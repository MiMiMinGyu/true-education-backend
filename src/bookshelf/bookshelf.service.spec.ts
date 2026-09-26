import { NotFoundException } from '@nestjs/common';
import { StorageService } from '../storage/storage.interface';
import { BookshelfService } from './bookshelf.service';
import {
  IBookshelfRepository,
  ShelfBook,
  ShelfItem,
} from './interfaces/bookshelf-repository.interface';

const storage: StorageService = {
  put: jest.fn(),
  urlFor: (key) => `http://files/${key}`,
};

const item = (overrides: Partial<ShelfItem>): ShelfItem => ({
  assignmentId: 1,
  studentTitle: null,
  originalTitle: '작은 곰',
  drawingKey: null,
  bookCoverUrl: null,
  completedAt: new Date('2026-09-26T01:00:00Z'),
  ...overrides,
});

function service(repository: Partial<IBookshelfRepository>) {
  return new BookshelfService(repository as IBookshelfRepository, storage);
}

describe('BookshelfService', () => {
  it('제목은 학생 제목 → 원제, 표지는 학생 그림 → 책 기본 표지 → null 순', async () => {
    const list = await service({
      listCompleted: jest
        .fn()
        .mockResolvedValue([
          item({ studentTitle: '나의 곰', drawingKey: 'drawings/1/a.png' }),
          item({ assignmentId: 2, bookCoverUrl: 'http://cover/b.png' }),
          item({ assignmentId: 3 }),
        ]),
    }).list(7);
    expect(
      list.map(({ title, coverImageUrl }) => [title, coverImageUrl]),
    ).toEqual([
      ['나의 곰', 'http://files/drawings/1/a.png'],
      ['작은 곰', 'http://cover/b.png'],
      ['작은 곰', null],
    ]);
  });

  it('완료하지 않은 책은 404', async () => {
    await expect(
      service({ findCompleted: jest.fn().mockResolvedValue(null) }).detail(1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('문제별로 시도 기록을 묶고, 순서 맞추기가 없으면 null', async () => {
    const shelf: ShelfBook = {
      ...item({}),
      studentId: 7,
      book: {
        author: null,
        sourceUrl: null,
        license: null,
        bibliography: null,
        content: {
          paragraphs: [
            {
              id: 'p001',
              lines: [{ id: 'p001-1', text: '곰', syllableCount: 1 }],
            },
          ],
          glossary: {},
        },
      },
      questions: [
        {
          id: 31,
          format: 'CHOICE',
          stage: 'WHO',
          order: 1,
          text: '누구?',
          options: ['곰', '토끼'],
          correctAnswer: 0,
          hint: '숨은 힌트',
          evidence: [{ paragraph_id: 'p001' }],
        },
      ],
      attempts: [
        { questionId: 31, attemptNumber: 1, answer: 1, isCorrect: false },
        { questionId: 31, attemptNumber: 2, answer: 0, isCorrect: true },
      ],
      reflection: null,
    };
    const detail = await service({
      findCompleted: jest.fn().mockResolvedValue(shelf),
    }).detail(1);
    expect(detail.questions).toEqual([
      {
        questionId: 31,
        order: 1,
        stage: 'WHO',
        text: '누구?',
        options: ['곰', '토끼'],
        answer: 0,
        attempts: [
          { attemptNumber: 1, answer: 1, correct: false },
          { attemptNumber: 2, answer: 0, correct: true },
        ],
      },
    ]);
    expect(detail.ordering).toBeNull();
    expect(detail.pages[0].lines[0]).toEqual({
      id: 'p001-1',
      text: '곰',
      speaker: 'YEOUL',
    });
    // 힌트·근거는 서재에서도 쓰지 않으므로 내보내지 않습니다
    expect(JSON.stringify(detail)).not.toMatch(/숨은 힌트|evidence/);
  });
});
