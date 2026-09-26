// 보호자 대시보드 판정 기준(AI 미사용, 규칙 기반). 출처: AI 파트 guardian-observation 명세(2026-09-26 수령).
// 문구는 src/parents/guardian-copy.ts에 있습니다.

export const DASHBOARD_SPEC_VERSION = '3.0.0';
export const DASHBOARD_POLICY_VERSION = 'guardian-observation-2026-09-v1';
// TODO: 의미 확인 필요(연령대별 기준 분리 계획인지, AI 파트)
export const DASHBOARD_PROFILE_ID = 'early-reading-v1';

/** 기본 조회 기간(오늘 포함 최근 N일, Asia/Seoul) */
export const DASHBOARD_PERIOD_DAYS = 14;
/** 조회 기간 상한(잘못된 긴 범위 방지) */
export const DASHBOARD_MAX_PERIOD_DAYS = 92;

/** 판정 전 기록 요건: 영역별로 모두 충족해야 판정합니다 */
export const MIN_VALID_QUESTIONS = 5;
export const MIN_VALID_SESSIONS = 3;
export const MIN_VALID_STORIES = 3;
export const MIN_VALID_DAYS = 2;
export const MIN_SCORABLE_COVERAGE = 0.8;

/** 스스로 해결: 첫 응답에서 도움 없이 정답인 비율 */
export const SUPPORTED_MIN_RATE = 0.8;
/** 함께 연습: 첫 독립 정답에 도달하지 못한 문제가 비율·개수·세션 수를 모두 넘을 때 */
export const NEEDS_SUPPORT_MIN_RATE = 0.6;
export const NEEDS_SUPPORT_MIN_COUNT = 3;
export const NEEDS_SUPPORT_MIN_SESSIONS = 2;
