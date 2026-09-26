import type { QuestionStage } from '../../content/interfaces/content-repository.interface';
import {
  analyzeStages,
  CompletedBookResult,
  readingSpeeds,
} from './dashboard.util';

/** daysAgo일 전에 완료한 책. results: 유형별 문제 하나씩의 시도 정오 */
function book(
  daysAgo: number,
  results: Partial<Record<QuestionStage, boolean[]>>,
): CompletedBookResult {
  return {
    assignmentId: daysAgo,
    completedAt: new Date(Date.UTC(2026, 8, 26 - daysAgo)),
    questions: Object.entries(results).map(([stage, attempts]) => ({
      stage: stage as QuestionStage,
      attempts: attempts!,
    })),
  };
}

const byStage = (books: CompletedBookResult[]) =>
  Object.fromEntries(analyzeStages(books).map((a) => [a.stage, a]));

describe('analyzeStages', () => {
  it('완료한 책이 3권 미만이면 판정하지 않는다(비율은 계산)', () => {
    const result = byStage([
      book(0, { WHY: [false, false] }),
      book(1, { WHY: [false, true] }),
    ]);
    expect(result.WHY).toMatchObject({
      status: 'COLLECTING',
      total: 2,
      firstTryRate: 0,
      afterRetryRate: 0.5,
      revealedRate: 0.5,
    });
  });

  it('최근 3권 중 2권 이상에서 1차 오답이면 NEEDS_HELP, 1번의 실수는 아님', () => {
    const result = byStage([
      book(0, { WHY: [false, true], WHO: [true], WHAT: [false, true] }),
      book(1, { WHY: [false, false], WHO: [true], WHAT: [true] }),
      book(2, { WHY: [true], WHO: [true], WHAT: [true] }),
      // 3권보다 오래된 책의 오답은 약점 판정에 쓰지 않는다
      book(3, { WHAT: [false, true] }),
    ]);
    expect(result.WHY.status).toBe('NEEDS_HELP');
    expect(result.WHAT.status).toBe('NORMAL'); // 1차 정답 2/4 = 0.5
    expect(result.WHO).toMatchObject({
      status: 'COMFORTABLE',
      firstTryRate: 1,
    });
    // 풀어 본 적 없는 유형은 판정하지 않는다
    expect(result.ORDER).toMatchObject({ status: 'COLLECTING', total: 0 });
  });

  it('입력 순서와 관계없이 최근 완료 순으로 3권을 고른다', () => {
    const result = byStage([
      book(5, { EMOTION: [false, true] }),
      book(0, { EMOTION: [true] }),
      book(6, { EMOTION: [false, true] }),
      book(1, { EMOTION: [true] }),
      book(2, { EMOTION: [false, true] }),
    ]);
    expect(result.EMOTION.status).not.toBe('NEEDS_HELP');
  });
});

describe('readingSpeeds', () => {
  it('날짜 오름차순으로 음절/분을 계산하고 읽은 시간이 없는 날은 뺀다', () => {
    expect(
      readingSpeeds([
        { date: '2026-09-26', syllables: 90, durationMs: 60_000 },
        { date: '2026-09-24', syllables: 50, durationMs: 40_000 },
        { date: '2026-09-25', syllables: 0, durationMs: 0 },
      ]).map(({ date, syllablesPerMinute }) => [date, syllablesPerMinute]),
    ).toEqual([
      ['2026-09-24', 75],
      ['2026-09-26', 90],
    ]);
  });
});
