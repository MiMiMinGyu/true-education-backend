import { ContentImportService } from './content-import.service';
import {
  BookRecord,
  ExistingBook,
  IContentRepository,
  QuestionRecord,
} from './interfaces/content-repository.interface';
import { buildImportBook } from './testing/import-book.fixture';

class FakeContentRepository implements IContentRepository {
  readonly books = new Map<
    string,
    { id: number; book: BookRecord; questions: QuestionRecord[] }
  >();
  readonly assignments = new Map<string, number>();
  private nextId = 1;

  async findBook(externalId: string): Promise<ExistingBook | null> {
    const saved = this.books.get(externalId);
    return saved
      ? { id: saved.id, assignmentCount: this.assignments.get(externalId) ?? 0 }
      : null;
  }

  async saveBook(book: BookRecord, questions: QuestionRecord[]) {
    const id = this.books.get(book.externalId)?.id ?? this.nextId++;
    this.books.set(book.externalId, { id, book, questions });
    return { id };
  }
}

describe('ContentImportService', () => {
  let repository: FakeContentRepository;
  let service: ContentImportService;

  beforeEach(() => {
    repository = new FakeContentRepository();
    service = new ContentImportService(repository);
  });

  it('새 책을 만들고, 같은 externalId로 다시 넣으면 갱신한다', async () => {
    expect((await service.importBook(buildImportBook())).status).toBe(
      'CREATED',
    );
    expect(
      (await service.importBook(buildImportBook({ title: '바뀐 제목' })))
        .status,
    ).toBe('UPDATED');

    expect(repository.books.size).toBe(1);
    expect(repository.books.get('test-book')!.book.title).toBe('바뀐 제목');
  });

  it('본문에 줄 id·음절 수를 붙여 저장한다', async () => {
    await service.importBook(buildImportBook());

    expect(
      repository.books.get('test-book')!.book.content.paragraphs[0].lines[0],
    ).toEqual({
      id: 'p001-1',
      text: '곰이 숲에 살았어요.',
      syllableCount: 8,
    });
  });

  it('이해 질문 뒤에 순서 맞추기를 ORDER 문제로 붙이고, 정답은 카드 순서로 둔다', async () => {
    await service.importBook(buildImportBook());
    const [choice, ordering] = repository.books.get('test-book')!.questions;

    expect(choice).toMatchObject({
      externalKey: 'q1',
      format: 'CHOICE',
      stage: 'WHO',
      order: 1,
      correctAnswer: 0,
    });
    expect(ordering).toMatchObject({
      externalKey: 'ORDER',
      format: 'ORDERING',
      stage: 'ORDER',
      order: 2,
      correctAnswer: ['e1', 'e2'],
      text: '이야기에서 일어난 차례대로 카드를 놓아 보세요.',
    });
  });

  it('순서 맞추기가 없으면 이해 질문만 저장한다', async () => {
    await service.importBook(buildImportBook({ ordering: null }));

    expect(
      repository.books.get('test-book')!.questions.map((q) => q.format),
    ).toEqual(['CHOICE']);
  });

  it('검증에 실패하면 저장하지 않는다', async () => {
    const result = await service.importBook(
      buildImportBook({ paragraphs: [] }),
    );

    expect(result.status).toBe('INVALID');
    expect(repository.books.size).toBe(0);
  });

  it('학생에게 배정된 책은 건너뛰고, --force면 덮어쓴다', async () => {
    await service.importBook(buildImportBook());
    repository.assignments.set('test-book', 2);

    const skipped = await service.importBook(
      buildImportBook({ title: '바뀐 제목' }),
    );
    expect(skipped.status).toBe('SKIPPED_ASSIGNED');
    expect(skipped.warnings.at(-1)).toContain('학생 2명');
    expect(repository.books.get('test-book')!.book.title).toBe('시험용 동화');

    const forced = await service.importBook(
      buildImportBook({ title: '바뀐 제목' }),
      { force: true },
    );
    expect(forced.status).toBe('UPDATED');
    expect(repository.books.get('test-book')!.book.title).toBe('바뀐 제목');
  });
});
