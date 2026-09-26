import type { QuestionStage } from '../../content/interfaces/content-repository.interface';
import { assessArea, PeriodBook } from './dashboard.util';

let attemptId = 0;

/** n번째 책(날짜 9월 n+10일). results: 유형별 문제 하나의 시도 정오 */
function book(
  n: number,
  results: Partial<Record<QuestionStage, boolean[]>>,
  date = `2026-09-${String(10 + n).padStart(2, '0')}`,
): PeriodBook {
  return {
    assignmentId: n,
    bookId: 100 + n,
    hasTitle: true,
    questions: Object.entries(results).map(([stage, attempts]) => ({
      stage: stage as QuestionStage,
      format: stage === 'ORDER' ? 'ORDERING' : 'CHOICE',
      attempts: attempts!.map((isCorrect) => ({
        id: ++attemptId,
        isCorrect,
        answeredDate: date,
      })),
    })),
  };
}

const books = (list: Partial<Record<QuestionStage, boolean[]>>[]) =>
  list.map((results, i) => book(i + 1, results));

describe('assessArea (v3 판정·문구)', () => {
  it('함께 연습: 독립 정답 못 한 문제 60%·3문제·2세션 이상 (v3 예시 원인 이해 문구와 같음)', () => {
    const area = assessArea(
      'cause',
      books([
        { WHY: [true] },
        { WHY: [true] },
        { WHY: [false, true] },
        { WHY: [false, false] },
        { WHY: [false, true] },
      ]),
    );
    expect(area).toMatchObject({
      id: 'cause',
      title: '원인 이해',
      state: 'needsSupport',
      ruleId: 'repeated_non_independent',
      missingEvidence: [],
      observation:
        '원인 이해 5문제 중 3문제는 첫 답에서 도움 없이 정답에 도달하지 못했어요. 어떤 부분을 다시 살펴볼지 함께 찾아봐 주세요.',
      evidenceText:
        '확인한 5문제의 첫 답: 도움 없이 정답 2개, 도움받고 정답 0개, 부분 정답 0개, 오답 3개예요.',
      recoveryTexts: [
        '첫 답에서 틀린 문제 중 2개는 힌트를 본 뒤 맞혔어요.',
        '첫 답에서 틀린 문제 중 1개는 정답 공개 전에 맞힌 기록이 없어요.',
      ],
      suggestion:
        '정답을 바로 알려주기 전에, "이야기에 힌트가 있었는데 어디였을까?" 하고 같이 다시 찾아봐 주세요.',
    });
    expect(area.metrics).toMatchObject({
      validQuestionCount: 5,
      firstIndependentCorrectCount: 2,
      firstIncorrectCount: 3,
      nonIndependentCount: 3,
      nonIndependentSessionCount: 3,
      validSessionCount: 5,
      validStoryCount: 5,
      validDayCount: 5,
      firstErrorRecoveredWithHintCount: 2,
      firstErrorWithoutVerifiedRecoveryCount: 1,
      answerRevealedQuestionCount: 1,
      incorrectAttemptCount: 4,
      independentCorrectRate: 0.4,
      scorableCoverage: 1,
    });
    expect(area.evidenceRecordIds).toHaveLength(5);
    expect(area.evidenceSessionIds).toEqual([
      'assignment-1',
      'assignment-2',
      'assignment-3',
      'assignment-4',
      'assignment-5',
    ]);
  });

  it('연습하며 관찰: 두 조건 사이 (v3 예시 순서 정리 문구와 같음), 순서 맞추기 재도전 정답은 힌트 없이', () => {
    const area = assessArea(
      'sequence',
      books([
        { ORDER: [true] },
        { ORDER: [true] },
        { ORDER: [true] },
        { ORDER: [false, false, false] },
        { ORDER: [false, false, false] },
      ]),
    );
    expect(area).toMatchObject({
      state: 'practicing',
      ruleId: 'mixed_observations',
      observation:
        '순서 정리 5문제 중 3문제를 첫 답에서 도움 없이 맞혔어요. 나머지 문제도 함께 살펴봐 주세요.',
      recoveryTexts: [
        '첫 답에서 틀린 문제 중 2개는 정답 공개 전에 맞힌 기록이 없어요.',
      ],
      suggestion:
        '"먼저 뭐였지? 그다음엔?" 하고 순서를 나타내는 말을 아이가 직접 소리 내어 말해보게 해주세요.',
    });
    const retried = assessArea(
      'sequence',
      books([
        { ORDER: [true] },
        { ORDER: [true] },
        { ORDER: [true] },
        { ORDER: [true] },
        { ORDER: [false, true] },
      ]),
    );
    expect(retried.metrics.firstErrorRecoveredWithoutHintCount).toBe(1);
    expect(retried.recoveryTexts).toEqual([
      '첫 답에서 틀린 문제 중 1개는 힌트 없이 다시 풀어 맞혔어요.',
    ]);
  });

  it('스스로 해결: 첫 독립 정답 80% 이상 (v3 예시 마음 이해 문구와 같음)', () => {
    const area = assessArea(
      'emotion',
      books([
        { EMOTION: [true] },
        { EMOTION: [true] },
        { EMOTION: [true] },
        { EMOTION: [true] },
        { EMOTION: [false, false] },
      ]),
    );
    expect(area).toMatchObject({
      state: 'supported',
      ruleId: 'mostly_independent',
      observation: '마음 이해 5문제 중 4문제를 첫 답에서 도움 없이 맞혔어요.',
      suggestion:
        '"네가 그 인물이라면 어떤 마음일까?" 하고 아이의 생각을 들어주세요.',
    });
  });

  it('인물과 사건은 누가·무슨 일 문제를 합쳐 판정한다(3권 = 6문제)', () => {
    const area = assessArea(
      'facts',
      books([
        { WHO: [true], WHAT: [true] },
        { WHO: [true], WHAT: [true] },
        { WHO: [true], WHAT: [true] },
      ]),
    );
    expect(area.metrics.validQuestionCount).toBe(6);
    expect(area.state).toBe('supported');
  });

  it('요약과 제목: 활동만 있고 채점 근거가 없어 판정 불가 (v3 예시 문구와 같음)', () => {
    const area = assessArea('gist', books([{}, {}, {}, {}, {}]));
    expect(area).toMatchObject({
      state: 'notAssessable',
      ruleId: 'no_usable_grading',
      observation:
        '요약과 제목 활동은 5개 있지만, 이번 판정에 사용할 수 있는 첫 응답 기록이 아직 없어요.',
      evidenceText: null,
      suggestion: '아이가 기억하는 중요한 일 한 가지를 먼저 들어주세요.',
      evidenceRecordIds: [],
    });
    expect(area.metrics).toMatchObject({
      observedQuestionCount: 5,
      unscorableQuestionCount: 5,
      validQuestionCount: 0,
      independentCorrectRate: null,
      scorableCoverage: 0,
    });
  });

  it('기록 요건 미달이면 판정하지 않고 모자란 항목을 알려 준다', () => {
    const four = assessArea(
      'cause',
      books([
        { WHY: [false, false] },
        { WHY: [false, false] },
        { WHY: [false, false] },
        { WHY: [false, false] },
      ]),
    );
    expect(four).toMatchObject({
      state: 'insufficientData',
      ruleId: 'insufficient_records',
      missingEvidence: ['validQuestionCount'],
      observation:
        '사건의 원인을 어떻게 이해하는지 살펴볼 기록을 더 모으고 있어요.',
    });
    expect(four.evidenceText).toContain('확인한 4문제');

    // 5문제지만 모두 같은 날
    const oneDay = assessArea(
      'emotion',
      [1, 2, 3, 4, 5].map((n) => book(n, { EMOTION: [true] }, '2026-09-20')),
    );
    expect(oneDay.missingEvidence).toEqual(['validDayCount']);
  });

  it('활동이 없으면 notObserved', () => {
    const area = assessArea('cause', []);
    expect(area).toMatchObject({
      state: 'notObserved',
      ruleId: 'no_activity',
      missingEvidence: [],
      evidenceText: null,
      recoveryTexts: [],
      observation:
        '이 기간에는 사건의 원인을 설명하는 활동 기록이 아직 없어요.',
    });
    expect(assessArea('gist', []).state).toBe('notObserved');
  });
});
