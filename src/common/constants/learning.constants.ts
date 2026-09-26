export type LearningStage =
  | 'READING'
  | 'QUESTION'
  | 'ORDERING'
  | 'TITLE'
  | 'DRAWING'
  | 'REFLECTION'
  | 'COMPLETED';

export type ActivityStage = Exclude<LearningStage, 'COMPLETED'>;

/**
 * 책 1권의 활동 순서. 여기서 빼면 그 단계는 건너뜁니다(마지막 단계를 마치면 완료).
 * DRAWING·REFLECTION은 프론트 그림 그리기 화면이 main에 머지되어 켰습니다(2026-09-26).
 */
export const LEARNING_STAGES: readonly ActivityStage[] = [
  'READING',
  'QUESTION',
  'ORDERING',
  'TITLE',
  'DRAWING',
  'REFLECTION',
];

/** 전체 단계 순서(비교용). LEARNING_STAGES에서 뺀 단계도 순서 비교에는 필요합니다 */
export const STAGE_ORDER: readonly LearningStage[] = [
  'READING',
  'QUESTION',
  'ORDERING',
  'TITLE',
  'DRAWING',
  'REFLECTION',
  'COMPLETED',
];

export const STAGE_LABELS: Record<ActivityStage, string> = {
  READING: '번갈아 읽기',
  QUESTION: '이해 질문',
  ORDERING: '순서 맞추기',
  TITLE: '제목 짓기',
  DRAWING: '그림 그리기',
  REFLECTION: '설명 말하기',
};

/** 번갈아 읽기 한 페이지의 줄 수(시안 기준) */
export const LINES_PER_PAGE = 3;
/** 이 범위를 벗어난 줄 읽기 시간은 읽기 속도 집계에서 뺍니다(줄이 문단 단위라 길 수 있어 상한 3분) */
export const READING_MIN_MS = 300;
export const READING_MAX_MS = 180_000;

export const CHOICE_MAX_ATTEMPTS = 2;
export const ORDERING_MAX_ATTEMPTS = 3;

/** 학생이 지은 제목(앞뒤 공백 제거 후). 프론트 입력 제한(30자)보다 넉넉하게 둡니다 */
export const TITLE_MAX_LENGTH = 50;
/** 표지 그림 업로드 상한(PNG/WebP) */
export const DRAWING_MAX_BYTES = 2 * 1024 * 1024;
/** 설명 말하기 받아 적은 글 최대 길이 */
export const REFLECTION_MAX_LENGTH = 2_000;
/** 설명 말하기 시간 상한 = 프론트 녹음 상한(2분) */
export const REFLECTION_MAX_DURATION_MS = 120_000;

/** 책 완료 시 스탬프는 1개, 이 확률로 2개(보물상자 연출). 판정은 서버가 합니다 */
export const DOUBLE_STAMP_CHANCE = 0.2;

/** 누적 스탬프 이 개수마다(5, 10, 15…) 보호자가 정한 보상 1개. 프론트 REWARD_EVERY와 같은 값 */
export const STAMPS_PER_REWARD = 5;
/** 보상 목표치 입력 상한(잘못된 큰 값 방지). 책 200권 분량 */
export const MAX_REWARD_MILESTONE = 1_000;

/** 새 책 고르는 방식: 아직 배정하지 않은 책 중 무작위 / id 순서대로 */
export type BookSelectionStrategy = 'RANDOM' | 'SEQUENTIAL';
export const BOOK_SELECTION: BookSelectionStrategy = 'RANDOM';
