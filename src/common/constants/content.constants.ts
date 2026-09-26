/** Typecast 요청 1회 최대 글자 수. 이보다 긴 줄은 경고만 하고 적재합니다 */
export const TTS_MAX_LINE_LENGTH = 2000;

// DB 컬럼 길이(schema.prisma)와 맞춥니다.
export const EXTERNAL_ID_MAX_LENGTH = 100;
export const BOOK_TITLE_MAX_LENGTH = 100;
export const QUESTION_KEY_MAX_LENGTH = 20;
/** tts_audio.line_id 길이. 줄 id = {paragraph_id}-{n} */
export const LINE_ID_MAX_LENGTH = 30;

/** 순서 맞추기 문제의 external_key (책마다 1개) */
export const ORDERING_EXTERNAL_KEY = 'ORDER';
export const DEFAULT_ORDERING_TEXT =
  '이야기에서 일어난 차례대로 카드를 놓아 보세요.';
