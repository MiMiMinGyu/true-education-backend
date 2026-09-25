export const PASSWORD_SALT_ROUNDS = 10;

// 프론트 가입 화면과 같은 범위. 서비스 특성상 나이로 제한할 이유가 없어 넓게 받습니다.
export const STUDENT_AGE_MIN = 3;
export const STUDENT_AGE_MAX = 19;

export const LOGIN_ID_PATTERN = /^[a-zA-Z0-9_]{4,20}$/;
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt는 72바이트 이후를 무시하므로 그보다 짧게 제한합니다.
export const PASSWORD_MAX_LENGTH = 64;
export const NAME_MAX_LENGTH = 50;

export const LOGIN_FAILED_MESSAGE = '아이디 또는 비밀번호가 올바르지 않습니다.';
