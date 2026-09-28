// 저장소가 던지는 도메인 오류. 서비스 계층이 HTTP 예외로 변환합니다(저장소 구현체와 무관하게 동일).

export class LoginIdTakenError extends Error {
  constructor(loginId: string) {
    super(`loginId already taken: ${loginId}`);
  }
}

export class StudentCodeTakenError extends Error {
  constructor() {
    super('student code already taken');
  }
}

export class StudentCodeNotFoundError extends Error {
  constructor() {
    super('student code not found');
  }
}

export class LinkRequestLimitError extends Error {
  constructor() {
    super('too many pending link requests for the student');
  }
}
