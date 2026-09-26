import { ImportBook } from '../interfaces/import-book.interface';

/** 단위 테스트용 최소 유효 입력 */
export function buildImportBook(
  overrides: Partial<ImportBook> = {},
): ImportBook {
  return {
    externalId: 'test-book',
    title: '시험용 동화',
    paragraphs: [
      {
        id: 'p001',
        sentences: ['곰이 숲에 살았어요.', '곰은 꿀을 좋아했어요.'],
      },
      { id: 'p002', sentences: ['어느 날 꿀단지를 찾았어요.'] },
    ],
    glossary: {},
    questions: [
      {
        externalKey: 'q1',
        stage: 'WHO',
        text: '숲에 산 동물은?',
        options: ['곰', '토끼'],
        correct: 0,
        hint: '첫 문장을 보세요.',
        evidence: [{ paragraph_id: 'p001', quote: '곰이 숲에 살았어요.' }],
      },
    ],
    ordering: {
      cards: [
        { id: 'e1', text: '곰이 숲에 살았어요.' },
        { id: 'e2', text: '꿀단지를 찾았어요.' },
      ],
    },
    ...overrides,
  };
}
