import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toPages } from '../../learning/utils/reading.util';
import { buildBookContent } from './book-content.util';
import { convertAiStory } from './ai-story.converter';
import { validateImportBook } from './import-book.validator';

const sample = () =>
  JSON.parse(
    readFileSync(
      join(__dirname, '../../../prisma/seed/ai/good-brothers.json'),
      'utf8',
    ),
  ) as Record<string, unknown>;

describe('convertAiStory', () => {
  it('첫 샘플(의좋은 형제)을 AI가 나눈 쪽 그대로 적재 형식으로 바꾼다', () => {
    const result = convertAiStory(sample());
    if (result.status !== 'OK') throw new Error(JSON.stringify(result));
    const { book } = result;

    expect(book).toMatchObject({
      externalId: 'good-brothers',
      title: '의좋은 형제',
      paging: 'PARAGRAPH',
      questions: [],
      ordering: null,
    });
    expect(book.bibliography).toContain('의좋은 형제');
    expect(book.paragraphs.map((p) => p.id)).toEqual([
      'p001',
      'p002',
      'p003',
      'p004',
      'p005',
      'p006',
    ]);
    expect(validateImportBook(book).errors).toEqual([]);

    const pages = toPages(buildBookContent(book));
    expect(pages).toHaveLength(6);
    expect(pages[0].lines).toMatchObject([
      {
        id: 'p001-1',
        speaker: 'YEOUL',
        text: '형과 아우가 함께 논에서 벼농사를 지었어요.',
      },
      { id: 'p001-2', speaker: 'STUDENT' },
    ]);
  });

  it('rule_check.passed가 false면 건너뛰고, 없으면 경고만 남긴다', () => {
    const failed = { ...sample(), meta: { rule_check: { passed: false } } };
    expect(convertAiStory(failed)).toMatchObject({
      status: 'SKIPPED',
      externalId: 'good-brothers',
    });

    const unknown = convertAiStory({ ...sample(), meta: undefined });
    expect(unknown.status).toBe('OK');
    if (unknown.status === 'OK') {
      expect(unknown.warnings.join()).toContain('rule_check');
    }
  });

  it('쪽마다 줄 수가 달라도 그대로 쓰고 경고한다', () => {
    const result = convertAiStory({
      id: 'uneven',
      title: '고르지 않은 쪽',
      pages: [['한 줄'], ['두 줄', '두 줄'], ['세 줄', '세 줄', '세 줄']],
      meta: { rule_check: { passed: true } },
    });
    if (result.status !== 'OK') throw new Error(JSON.stringify(result));
    expect(
      toPages(buildBookContent(result.book)).map((p) => p.lines.length),
    ).toEqual([1, 2, 3]);
    expect(result.warnings.join()).toContain('줄 수가 다릅니다');
  });

  it('필수 값이 없으면 INVALID', () => {
    expect(convertAiStory({ title: '제목', pages: [] })).toMatchObject({
      status: 'INVALID',
      errors: ['id가 비어 있습니다.', 'pages가 1쪽 이상 있어야 합니다.'],
    });
    expect(convertAiStory('문자열').status).toBe('INVALID');
  });

  it('(임시) 12번 형식의 문제·순서 카드가 같은 파일에 있으면 함께 바꾼다', () => {
    const result = convertAiStory({
      ...sample(),
      questions: [
        {
          id: 'q1',
          stage: '누가',
          q: '볏단을 옮긴 사람은 누구인가요?',
          options: ['형', '형과 아우', '이웃'],
          correct: 1,
          evidence: [{ paragraph_id: 'p003' }, { paragraph_id: 'x9' }],
        },
        {
          id: 'q2',
          stage: '마음',
          q: '형은 왜 볏단을 옮겼나요?',
          options: ['a', 'b'],
          correct: 0,
          hint: '형의 생각',
        },
      ],
      order: {
        cards: [
          { id: 'e1', text: '벼를 거두었어요.' },
          { id: 'e2', text: '볏단을 나누었어요.' },
        ],
      },
    });
    if (result.status !== 'OK') throw new Error(JSON.stringify(result));
    expect(result.book.questions).toMatchObject([
      {
        externalKey: 'q1',
        stage: 'WHO',
        correct: 1,
        evidence: [{ paragraph_id: 'p003' }],
      },
      { externalKey: 'q2', stage: 'EMOTION', hint: '형의 생각' },
    ]);
    expect(result.book.ordering?.cards.map((c) => c.id)).toEqual(['e1', 'e2']);
    expect(result.warnings.join()).toContain('evidence');
    expect(validateImportBook(result.book).errors).toEqual([]);
  });

  it('알 수 없는 문제 유형이면 INVALID', () => {
    const result = convertAiStory({
      ...sample(),
      questions: [
        { id: 'q1', stage: '어디서', q: '?', options: ['a', 'b'], correct: 0 },
      ],
    });
    expect(result.status).toBe('INVALID');
  });
});

describe('convertAiStory — 기준 형식(folkency-5747, 본문·문제 한 파일)', () => {
  const folkency = () =>
    JSON.parse(
      readFileSync(
        join(__dirname, '../../../prisma/seed/ai/folkency-5747.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;

  it('meta.activities의 이해 질문·순서 맞추기·제목 힌트와 출처를 모두 옮긴다', () => {
    const result = convertAiStory(folkency());
    if (result.status !== 'OK') throw new Error(JSON.stringify(result));
    const { book } = result;

    expect(book.questions).toHaveLength(4);
    expect(book.questions[0]).toMatchObject({
      externalKey: 'q1',
      stage: 'WHO',
      options: ['산신령', '연못에 사는 물고기', '나무꾼'],
      correct: 2,
      hint: '이야기의 맨 처음에 나오는 사람을 생각해 보세요.',
      explanation: '이야기의 첫 문장에 나무꾼이 살았다고 나와 있어요.',
      evidence: [
        { paragraph_id: 'p001', quote: '옛날에 한 나무꾼이 살았어요.' },
      ],
    });
    expect(book.questions.map((q) => q.stage)).toEqual([
      'WHO',
      'WHAT',
      'WHY',
      'EMOTION',
    ]);
    // 따옴표·쉼표가 섞인 인용도 본문 쪽을 찾는다
    expect(book.questions[2].evidence?.[0].paragraph_id).toBe('p007');
    expect(book.ordering?.cards.map((c) => c.id)).toEqual([
      'e1',
      'e2',
      'e3',
      'e4',
    ]);
    expect(book.ordering?.cards[0].text).toBe(
      '나무꾼이 연못에 도끼를 빠뜨렸어요.',
    );
    expect(book.titleHints).toHaveLength(3);
    expect(book).toMatchObject({
      sourceUrl: 'https://folkency.nfm.go.kr/topic/detail/5747',
      license: expect.stringContaining('공공누리 제2유형'),
      bibliography: '[출처: 금도끼은도끼–국립민속박물관 한국민속대백과사전]',
    });
    // 옮기지 않은 meta는 그대로 보존(문제 본문은 questions 테이블에만)
    expect(book.sourceMeta).toMatchObject({
      model: 'exaone4.0-edit:32b',
      validation: { status: 'not_run' },
      activities: {
        sequence: { id: 'folkency-5747-sequence', displayOrder: [3, 0, 2, 1] },
      },
    });
    expect(
      (book.sourceMeta?.activities as Record<string, unknown>).comprehension,
    ).toBeUndefined();
    expect(validateImportBook(book).errors).toEqual([]);
  });

  it('검증 전 상태와 줄 끝 따옴표·쉼표를 경고로 알리고 본문은 바꾸지 않는다', () => {
    const result = convertAiStory(folkency());
    if (result.status !== 'OK') throw new Error(JSON.stringify(result));
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        '내용 검증 상태가 "not_run"입니다.',
        expect.stringContaining('줄 끝에 따옴표·쉼표'),
      ]),
    );
    expect(result.book.paragraphs[2].sentences[0]).toMatch(/',$/);
  });

  it('알 수 없는 유형이면 적재하지 않는다', () => {
    const json = folkency();
    const meta = json.meta as { activities: { comprehension: object[] } };
    meta.activities.comprehension[0] = {
      ...meta.activities.comprehension[0],
      category: '어디서',
    };
    const result = convertAiStory(json);
    expect(result.status).toBe('INVALID');
  });
});
