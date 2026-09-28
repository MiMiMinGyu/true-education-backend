// 보호자 연결 요청(보호자가 학생 코드로 요청 → 학생이 수락)

/** 한 학생에게 동시에 쌓일 수 있는 대기 요청 수(요청 남발 방지) */
export const MAX_PENDING_LINK_REQUESTS = 5;

export const LINK_REQUEST_LIMIT_MESSAGE =
  '이 아이에게 대기 중인 연결 요청이 많아요. 아이가 요청을 확인한 뒤 다시 시도해 주세요.';

/** 거절된 보호자가 같은 학생에게 다시 요청할 수 있기까지의 시간 */
export const LINK_REREQUEST_COOLDOWN_HOURS = 24;

// TODO: 학생 코드 추측(무차별 대입) 방지용 요청 횟수 제한(rate limit)은 배포 구성과 함께 결정
