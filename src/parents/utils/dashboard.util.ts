import {
  MIN_SCORABLE_COVERAGE,
  MIN_VALID_DAYS,
  MIN_VALID_QUESTIONS,
  MIN_VALID_SESSIONS,
  MIN_VALID_STORIES,
  NEEDS_SUPPORT_MIN_COUNT,
  NEEDS_SUPPORT_MIN_RATE,
  NEEDS_SUPPORT_MIN_SESSIONS,
  SUPPORTED_MIN_RATE,
} from '../../common/constants/dashboard';
import type {
  QuestionFormat,
  QuestionStage,
} from '../../content/interfaces/content-repository.interface';
import {
  AREA_COPY,
  AreaCounts,
  AreaId,
  AreaState,
  EVIDENCE_COPY,
  OBSERVATION_COPY,
  RECOVERY_COPY,
  RULE_IDS,
  SUGGESTION_KEY,
} from '../guardian-copy';

/** 조회 기간 안에 완료한 책 1권(= 세션 1개 = 이야기 1개) */
export interface PeriodBook {
  assignmentId: number;
  bookId: number;
  /** 제목 짓기 활동 여부(요약과 제목 영역, 채점 없음) */
  hasTitle: boolean;
  questions: {
    stage: QuestionStage;
    format: QuestionFormat;
    /** 차수 순. answeredDate = Asia/Seoul 날짜 */
    attempts: { id: number; isCorrect: boolean; answeredDate: string }[];
  }[];
}

/** 영역 ↔ 문제 유형. 요약과 제목(gist)은 채점하는 문제가 없습니다 */
const AREA_STAGES: Record<Exclude<AreaId, 'gist'>, QuestionStage[]> = {
  cause: ['WHY'],
  emotion: ['EMOTION'],
  sequence: ['ORDER'],
  facts: ['WHO', 'WHAT'],
};

export interface AreaMetrics {
  observedQuestionCount: number;
  eligibleQuestionCount: number;
  excludedPriorExposureCount: number;
  duplicatePresentationCount: number;
  validQuestionCount: number;
  unscorableQuestionCount: number;
  firstIndependentCorrectCount: number;
  firstAssistedCorrectCount: number;
  firstPartialCount: number;
  firstIncorrectCount: number;
  nonIndependentCount: number;
  nonIndependentSessionCount: number;
  validSessionCount: number;
  validStoryCount: number;
  validDayCount: number;
  firstErrorRecoveredWithoutHintCount: number;
  firstErrorRecoveredWithHintCount: number;
  firstErrorRecoveryUnknownCount: number;
  firstErrorWithoutVerifiedRecoveryCount: number;
  answerRevealedQuestionCount: number;
  incorrectAttemptCount: number;
  independentCorrectRate: number | null;
  scorableCoverage: number | null;
}

export interface AreaAssessment {
  id: AreaId;
  title: string;
  state: AreaState;
  ruleId: string;
  metrics: AreaMetrics;
  /** 기록 요건 중 채우지 못한 항목(기록 부족일 때) */
  missingEvidence: string[];
  evidenceRecordIds: string[];
  evidenceSessionIds: string[];
  observation: string;
  evidenceText: string | null;
  recoveryTexts: string[];
  suggestion: string;
  reference: { label: string; url: string };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function emptyMetrics(): AreaMetrics {
  return {
    observedQuestionCount: 0,
    eligibleQuestionCount: 0,
    // 같은 문제를 다시 내거나, 첫 답 전에 도움(힌트 버튼)을 주거나, 부분 점수를 주는 구조가 없어 항상 0입니다.
    excludedPriorExposureCount: 0,
    duplicatePresentationCount: 0,
    validQuestionCount: 0,
    unscorableQuestionCount: 0,
    firstIndependentCorrectCount: 0,
    firstAssistedCorrectCount: 0,
    firstPartialCount: 0,
    firstIncorrectCount: 0,
    nonIndependentCount: 0,
    nonIndependentSessionCount: 0,
    validSessionCount: 0,
    validStoryCount: 0,
    validDayCount: 0,
    firstErrorRecoveredWithoutHintCount: 0,
    firstErrorRecoveredWithHintCount: 0,
    firstErrorRecoveryUnknownCount: 0,
    firstErrorWithoutVerifiedRecoveryCount: 0,
    answerRevealedQuestionCount: 0,
    incorrectAttemptCount: 0,
    independentCorrectRate: null,
    scorableCoverage: null,
  };
}

function metricsOf(id: AreaId, books: PeriodBook[]) {
  const metrics = emptyMetrics();
  if (id === 'gist') {
    const observed = books.filter((book) => book.hasTitle).length;
    metrics.observedQuestionCount = observed;
    metrics.eligibleQuestionCount = observed;
    metrics.unscorableQuestionCount = observed;
    metrics.scorableCoverage = observed > 0 ? 0 : null;
    return { metrics, recordIds: [], sessionIds: [] };
  }

  const questions = books.flatMap((book) =>
    book.questions
      .filter((q) => AREA_STAGES[id].includes(q.stage) && q.attempts.length)
      .map((q) => ({
        ...q,
        assignmentId: book.assignmentId,
        bookId: book.bookId,
      })),
  );
  const nonIndependentSessions = new Set<number>();
  for (const q of questions) {
    const [first] = q.attempts;
    const recovered = q.attempts.slice(1).some((a) => a.isCorrect);
    metrics.incorrectAttemptCount += q.attempts.filter(
      (a) => !a.isCorrect,
    ).length;
    if (first.isCorrect) {
      metrics.firstIndependentCorrectCount++;
      continue;
    }
    metrics.firstIncorrectCount++;
    nonIndependentSessions.add(q.assignmentId);
    if (!recovered) {
      // 완료한 책이라 끝까지 못 맞힌 문제는 모두 정답이 공개된 문제입니다.
      metrics.firstErrorWithoutVerifiedRecoveryCount++;
      metrics.answerRevealedQuestionCount++;
    } else if (q.format === 'CHOICE') {
      // 이해 질문은 1차 오답이면 힌트를 보여 준 뒤 다시 풉니다.
      metrics.firstErrorRecoveredWithHintCount++;
    } else {
      metrics.firstErrorRecoveredWithoutHintCount++;
    }
  }

  const valid = questions.length;
  metrics.observedQuestionCount = valid;
  metrics.eligibleQuestionCount = valid;
  metrics.validQuestionCount = valid;
  metrics.nonIndependentCount = metrics.firstIncorrectCount;
  metrics.nonIndependentSessionCount = nonIndependentSessions.size;
  metrics.validSessionCount = new Set(
    questions.map((q) => q.assignmentId),
  ).size;
  metrics.validStoryCount = new Set(questions.map((q) => q.bookId)).size;
  metrics.validDayCount = new Set(
    questions.map((q) => q.attempts[0].answeredDate),
  ).size;
  metrics.independentCorrectRate =
    valid > 0 ? round2(metrics.firstIndependentCorrectCount / valid) : null;
  metrics.scorableCoverage = valid > 0 ? 1 : null;

  return {
    metrics,
    recordIds: questions.map((q) => `attempt-${q.attempts[0].id}`),
    sessionIds: [...new Set(questions.map((q) => q.assignmentId))]
      .sort((a, b) => a - b)
      .map((assignmentId) => `assignment-${assignmentId}`),
  };
}

function missingEvidenceOf(m: AreaMetrics): string[] {
  const missing: string[] = [];
  if (m.validQuestionCount < MIN_VALID_QUESTIONS)
    missing.push('validQuestionCount');
  if (m.validSessionCount < MIN_VALID_SESSIONS)
    missing.push('validSessionCount');
  if (m.validStoryCount < MIN_VALID_STORIES) missing.push('validStoryCount');
  if (m.validDayCount < MIN_VALID_DAYS) missing.push('validDayCount');
  if ((m.scorableCoverage ?? 0) < MIN_SCORABLE_COVERAGE)
    missing.push('scorableCoverage');
  return missing;
}

/**
 * 판정 순서: 활동 없음 → 채점 근거 없음 → 기록 요건 미달 → 함께 연습 → 스스로 해결 → 연습하며 관찰.
 * 함께 연습(독립 정답 못 한 비율 60% 이상)과 스스로 해결(독립 정답 80% 이상)은 동시에 성립하지 않습니다.
 */
function stateOf(m: AreaMetrics, missing: string[]): AreaState {
  if (m.observedQuestionCount === 0) return 'notObserved';
  if (m.validQuestionCount === 0) return 'notAssessable';
  if (missing.length > 0) return 'insufficientData';
  if (
    m.nonIndependentCount / m.validQuestionCount >= NEEDS_SUPPORT_MIN_RATE &&
    m.nonIndependentCount >= NEEDS_SUPPORT_MIN_COUNT &&
    m.nonIndependentSessionCount >= NEEDS_SUPPORT_MIN_SESSIONS
  ) {
    return 'needsSupport';
  }
  if ((m.independentCorrectRate ?? 0) >= SUPPORTED_MIN_RATE) return 'supported';
  return 'practicing';
}

export function assessArea(id: AreaId, books: PeriodBook[]): AreaAssessment {
  const { metrics, recordIds, sessionIds } = metricsOf(id, books);
  const missing =
    metrics.validQuestionCount > 0 ? missingEvidenceOf(metrics) : [];
  const state = stateOf(metrics, missing);
  const copy = AREA_COPY[id];
  const counts: AreaCounts = {
    observed: metrics.observedQuestionCount,
    valid: metrics.validQuestionCount,
    independent: metrics.firstIndependentCorrectCount,
    assisted: metrics.firstAssistedCorrectCount,
    partial: metrics.firstPartialCount,
    incorrect: metrics.firstIncorrectCount,
    nonIndependent: metrics.nonIndependentCount,
  };
  const observation =
    OBSERVATION_COPY[state]?.(copy.title, counts) ??
    copy.observations[state as 'insufficientData' | 'notObserved'];

  const recoveryTexts: string[] = [];
  if (metrics.firstErrorRecoveredWithoutHintCount)
    recoveryTexts.push(
      RECOVERY_COPY.withoutHint(metrics.firstErrorRecoveredWithoutHintCount),
    );
  if (metrics.firstErrorRecoveredWithHintCount)
    recoveryTexts.push(
      RECOVERY_COPY.withHint(metrics.firstErrorRecoveredWithHintCount),
    );
  if (metrics.firstErrorWithoutVerifiedRecoveryCount)
    recoveryTexts.push(
      RECOVERY_COPY.withoutVerified(
        metrics.firstErrorWithoutVerifiedRecoveryCount,
      ),
    );

  return {
    id,
    title: copy.title,
    state,
    ruleId: RULE_IDS[state],
    metrics,
    missingEvidence: missing,
    evidenceRecordIds: recordIds,
    evidenceSessionIds: sessionIds,
    observation,
    evidenceText: metrics.validQuestionCount > 0 ? EVIDENCE_COPY(counts) : null,
    recoveryTexts,
    suggestion: copy.suggestions[SUGGESTION_KEY[state]],
    reference: copy.reference,
  };
}
