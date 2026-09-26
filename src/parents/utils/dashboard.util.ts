import {
  COMFORTABLE_RATE,
  DASHBOARD_STAGES,
  NEEDS_HELP_MIN,
  NEEDS_HELP_WINDOW,
  StageStatus,
} from '../../common/constants/dashboard';
import type { QuestionStage } from '../../content/interfaces/content-repository.interface';

export interface CompletedBookResult {
  assignmentId: number;
  completedAt: Date;
  /** 문제별 시도 정오(차수 순) */
  questions: { stage: QuestionStage; attempts: boolean[] }[];
}

export interface StageAnalysis {
  stage: QuestionStage;
  /** 푼 문제 수(완료한 책 기준) */
  total: number;
  /** 1차에 맞힘 */
  firstTryRate: number | null;
  /** 1차 오답 후 맞힘(이해 질문은 힌트를 보고, 순서 맞추기는 다시 도전해서) */
  afterRetryRate: number | null;
  /** 끝까지 못 맞혀 정답 공개 */
  revealedRate: number | null;
  status: StageStatus;
}

const rate = (count: number, total: number) =>
  total === 0 ? null : Math.round((count / total) * 100) / 100;

/**
 * 유형별 풀이 결과와 상태. 한 번의 실수를 약점으로 단정하지 않도록
 * 최근 완료한 NEEDS_HELP_WINDOW권 중 NEEDS_HELP_MIN권 이상에서 1차에 틀린 유형만 '도움 필요'로 봅니다.
 * 완료한 책이 NEEDS_HELP_WINDOW권 미만이면 판정하지 않습니다(COLLECTING).
 */
export function analyzeStages(books: CompletedBookResult[]): StageAnalysis[] {
  const collecting = books.length < NEEDS_HELP_WINDOW;
  const recent = [...books]
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, NEEDS_HELP_WINDOW);

  return DASHBOARD_STAGES.map((stage) => {
    const results = books
      .flatMap((book) => book.questions)
      .filter((q) => q.stage === stage && q.attempts.length > 0);
    const firstTry = results.filter((q) => q.attempts[0]).length;
    const afterRetry = results.filter(
      (q) => !q.attempts[0] && q.attempts.includes(true),
    ).length;
    const total = results.length;
    const firstTryRate = rate(firstTry, total);

    const wrongFirstBooks = recent.filter((book) =>
      book.questions.some(
        (q) => q.stage === stage && q.attempts.length > 0 && !q.attempts[0],
      ),
    ).length;

    let status: StageStatus;
    if (collecting || total === 0) status = 'COLLECTING';
    else if (wrongFirstBooks >= NEEDS_HELP_MIN) status = 'NEEDS_HELP';
    else if (firstTryRate! >= COMFORTABLE_RATE) status = 'COMFORTABLE';
    else status = 'NORMAL';

    return {
      stage,
      total,
      firstTryRate,
      afterRetryRate: rate(afterRetry, total),
      revealedRate: rate(total - firstTry - afterRetry, total),
      status,
    };
  });
}

export interface DailyReading {
  date: string;
  syllables: number;
  durationMs: number;
}

/** 날짜별 읽기 속도(음절/분). 읽은 시간이 없는 날은 뺍니다 */
export function readingSpeeds(days: DailyReading[]) {
  return days
    .filter((day) => day.durationMs > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      ...day,
      syllablesPerMinute:
        Math.round((day.syllables / (day.durationMs / 60_000)) * 10) / 10,
    }));
}
