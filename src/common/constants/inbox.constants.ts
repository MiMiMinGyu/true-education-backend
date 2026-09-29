// AI 파트가 서버로 동화를 보내는 경로(POST /admin/books)와 동화 부족 알림 기준.

/** 학생이 아직 배정받지 않은 책이 이 수 이하가 되면 AI 파트에 알립니다(하루 1권이라 며칠 여유) */
export const LOW_STOCK_THRESHOLD = 3;

/** 같은 알림을 반복하지 않는 간격(서버 메모리 기준, 인스턴스 1대 전제) */
export const LOW_STOCK_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** 알림 웹훅 호출 제한 시간 */
export const ALERT_WEBHOOK_TIMEOUT_MS = 5000;

/** AI 파트 생성 파이프라인(Tailscale 사설망)에서 검증된 책을 가져오는 간격 */
export const PIPELINE_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** 서버 시작 직후 첫 동기화까지 기다리는 시간(마이그레이션·기동 직후 부하 회피) */
export const PIPELINE_SYNC_FIRST_DELAY_MS = 15 * 1000;

/** 파이프라인 API 요청 제한 시간 */
export const PIPELINE_REQUEST_TIMEOUT_MS = 10 * 1000;

/** 서버끼리 쓰는 API 키 헤더 */
export const CONTENT_API_KEY_HEADER = 'x-api-key';
