// AI 파트가 서버로 동화를 보내는 경로(POST /admin/books)와 동화 부족 알림 기준.

/** 학생이 아직 배정받지 않은 책이 이 수 이하가 되면 AI 파트에 알립니다(하루 1권이라 며칠 여유) */
export const LOW_STOCK_THRESHOLD = 3;

/** 같은 알림을 반복하지 않는 간격(서버 메모리 기준, 인스턴스 1대 전제) */
export const LOW_STOCK_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** 알림 웹훅 호출 제한 시간 */
export const ALERT_WEBHOOK_TIMEOUT_MS = 5000;

/** 서버끼리 쓰는 API 키 헤더 */
export const CONTENT_API_KEY_HEADER = 'x-api-key';
