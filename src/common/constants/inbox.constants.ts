// AI 파트가 서버로 동화를 보내는 경로(POST /admin/books)와 동화 부족 알림 기준.

/** 학생이 아직 배정받지 않은 책이 이 수 이하가 되면 AI 파트에 알립니다(하루 1권이라 며칠 여유) */
export const LOW_STOCK_THRESHOLD = 3;

/** 같은 알림을 반복하지 않는 간격(서버 메모리 기준, 인스턴스 1대 전제) */
export const LOW_STOCK_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** 알림 웹훅 호출 제한 시간 */
export const ALERT_WEBHOOK_TIMEOUT_MS = 5000;

/** 파이프라인 API 요청 제한 시간 */
export const PIPELINE_REQUEST_TIMEOUT_MS = 10 * 1000;

/** 진행 중인 보충 작업 상태 확인 간격(실패 감지용. 완성본은 콜백으로 즉시 받음) */
export const REFILL_POLL_INTERVAL_MS = 20 * 1000;

/** 파이프라인 통신 실패 시 상태 확인 간격을 늘리는 최대치 */
export const REFILL_POLL_MAX_BACKOFF_MS = 5 * 60 * 1000;

/** 보충 실패(rejected·error) 뒤 다음 자동 요청까지 기다리는 시간 */
export const REFILL_RETRY_COOLDOWN_MS = 30 * 60 * 1000;

/** 새 원천이 없음(NO_NEW_SOURCE) 뒤 자동 요청을 멈추는 시간(담당자 확인 대상) */
export const REFILL_NO_SOURCE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** AI 서버 요청 본문 상한(65536바이트)보다 여유 있게. 넘으면 목록을 자르지 않고 요청하지 않음 */
export const REFILL_MAX_BODY_BYTES = 60_000;

/** 완성본 수신 API 헤더 */
export const PIPELINE_JOB_ID_HEADER = 'x-pipeline-job-id';
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** 서버끼리 쓰는 API 키 헤더 */
export const CONTENT_API_KEY_HEADER = 'x-api-key';
