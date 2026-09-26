import { ImportBook } from '../interfaces/import-book.interface';
import { buildImportBook } from '../testing/import-book.fixture';
import { validateImportBook } from './import-book.validator';

const withQuestion = (overrides: Record<string, unknown>) => {
  const base = buildImportBook();
  return buildImportBook({
    questions: [{ ...base.questions[0], ...overrides } as never],
  });
};

describe('validateImportBook', () => {
  it('유효한 입력은 오류·경고가 없다', () => {
    expect(validateImportBook(buildImportBook())).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it('JSON 구조가 깨져 있어도 예외 없이 오류로 돌려준다', () => {
    const result = validateImportBook({
      title: 3,
      paragraphs: 'x',
      questions: null,
    } as unknown as ImportBook);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        'externalId가 비어 있습니다.',
        'title이 비어 있습니다.',
        'paragraphs가 1개 이상 있어야 합니다.',
        'questions가 배열이 아닙니다(문제가 없으면 빈 배열).',
      ]),
    );
  });

  it.each([
    [
      '문단 id 중복',
      buildImportBook({
        paragraphs: [
          { id: 'p1', sentences: ['가'] },
          { id: 'p1', sentences: ['나'] },
        ],
      }),
      '중복',
    ],
    [
      '빈 줄',
      buildImportBook({ paragraphs: [{ id: 'p1', sentences: ['가', '  '] }] }),
      'sentences[1]가 비어',
    ],
    ['보기 1개', withQuestion({ options: ['곰'] }), '보기 2개 이상'],
    ['정답 번호 범위 밖', withQuestion({ correct: 2 }), '보기 범위'],
    ['정답 번호가 정수 아님', withQuestion({ correct: 0.5 }), '보기 범위'],
    ['알 수 없는 유형', withQuestion({ stage: 'WHERE' }), 'stage'],
    [
      '없는 문단을 근거로 지정',
      withQuestion({ evidence: [{ paragraph_id: 'p999' }] }),
      '본문에 없습니다',
    ],
    [
      '예약어 ORDER를 문제 키로 사용',
      withQuestion({ externalKey: 'ORDER' }),
      '예약어',
    ],
    [
      '순서 카드 1개',
      buildImportBook({ ordering: { cards: [{ id: 'e1', text: '가' }] } }),
      '2개 이상',
    ],
    [
      '순서 카드 id 중복',
      buildImportBook({
        ordering: {
          cards: [
            { id: 'e1', text: '가' },
            { id: 'e1', text: '나' },
          ],
        },
      }),
      '중복',
    ],
  ])('%s → 오류', (_label, book, message) => {
    const { errors } = validateImportBook(book);
    expect(errors.some((error) => error.includes(message))).toBe(true);
  });

  it('근거 인용문이 공백만 다르면 통과, 문단에 없으면 경고만 한다', () => {
    const spaced = validateImportBook(
      withQuestion({
        evidence: [{ paragraph_id: 'p001', quote: '곰이  숲에\n살았어요.' }],
      }),
    );
    const missing = validateImportBook(
      withQuestion({
        evidence: [{ paragraph_id: 'p001', quote: '없는 문장' }],
      }),
    );

    expect(spaced).toEqual({ errors: [], warnings: [] });
    expect(missing.errors).toEqual([]);
    expect(missing.warnings[0]).toContain('quote가 p001 문단에 없습니다');
  });

  it('힌트와 근거가 모두 없거나 순서 문제가 없으면 경고만 한다', () => {
    const noHint = validateImportBook(
      withQuestion({ hint: null, evidence: null }),
    );
    const noOrdering = validateImportBook(buildImportBook({ ordering: null }));

    expect(noHint.errors).toEqual([]);
    expect(noHint.warnings[0]).toContain('힌트가 없습니다');
    expect(noOrdering.errors).toEqual([]);
    expect(noOrdering.warnings[0]).toContain('순서 맞추기');
  });

  it('TTS 한도를 넘는 줄은 경고만 한다', () => {
    const result = validateImportBook(
      buildImportBook({
        paragraphs: [{ id: 'p001', sentences: ['가'.repeat(2001)] }],
      }),
    );

    expect(result.warnings.some((warning) => warning.includes('p001-1'))).toBe(
      true,
    );
  });
});
