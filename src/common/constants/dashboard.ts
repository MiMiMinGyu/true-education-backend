// 보호자 대시보드 판정 기준과 코멘트 문구(AI 미사용, 규칙 기반).
// TODO: 모두 임시값입니다. 이유신 님 자료(논문·기준) 수령 후 이 파일만 교체합니다. 또래 비교(birth_year)도 그때 추가.

import type { QuestionStage } from '../../content/interfaces/content-repository.interface';

/** 약점 판정: 최근 완료한 NEEDS_HELP_WINDOW권 중 NEEDS_HELP_MIN권 이상에서 1차에 틀린 유형 */
export const NEEDS_HELP_WINDOW = 3;
export const NEEDS_HELP_MIN = 2;
/** 잘하는 유형: 도움 필요가 아니고 1차 정답 비율이 이 값 이상 */
export const COMFORTABLE_RATE = 0.8;

/** 읽기 속도 추이에 보여 줄 최근 학습 날짜 수 */
export const READING_SPEED_DAYS = 30;
/** 최근 설명 말하기 표시 개수 */
export const RECENT_REFLECTIONS = 5;

export const DASHBOARD_STAGES: readonly QuestionStage[] = [
  'WHO',
  'WHAT',
  'WHY',
  'EMOTION',
  'ORDER',
];

export const DASHBOARD_STAGE_LABELS: Record<QuestionStage, string> = {
  WHO: '누가',
  WHAT: '무슨 일',
  WHY: '왜',
  EMOTION: '마음',
  ORDER: '순서 맞추기',
};

export type StageStatus =
  'COLLECTING' | 'NEEDS_HELP' | 'COMFORTABLE' | 'NORMAL';

/** 유형 × 상태별 사전 정의 코멘트(임시 문구) */
export const DASHBOARD_COMMENTS: Record<
  QuestionStage,
  Record<Exclude<StageStatus, 'COLLECTING'>, string>
> = {
  WHO: {
    NEEDS_HELP:
      '등장인물을 헷갈려 해요. 읽은 뒤 "누가 나왔지?" 하고 함께 이름을 짚어 주세요.',
    COMFORTABLE: '등장인물을 잘 기억해요.',
    NORMAL: '등장인물을 차근차근 익히고 있어요.',
  },
  WHAT: {
    NEEDS_HELP:
      '일어난 일을 떠올리기 어려워해요. 한 장면씩 "무슨 일이 있었지?" 하고 물어봐 주세요.',
    COMFORTABLE: '이야기에서 일어난 일을 잘 파악해요.',
    NORMAL: '일어난 일을 차근차근 이해하고 있어요.',
  },
  WHY: {
    NEEDS_HELP:
      '이유를 찾는 질문을 어려워해요. "왜 그랬을까?"를 일상 대화에서도 자주 물어봐 주세요.',
    COMFORTABLE: '까닭을 잘 찾아내요.',
    NORMAL: '이유를 생각하는 힘을 기르고 있어요.',
  },
  EMOTION: {
    NEEDS_HELP:
      '인물의 마음을 짐작하기 어려워해요. "이때 기분이 어땠을까?" 하고 표정을 흉내 내 보세요.',
    COMFORTABLE: '인물의 마음을 잘 헤아려요.',
    NORMAL: '인물의 마음을 알아가고 있어요.',
  },
  ORDER: {
    NEEDS_HELP:
      '이야기 순서를 정리하기 어려워해요. "처음에는? 그다음에는?" 하고 함께 되짚어 주세요.',
    COMFORTABLE: '이야기 순서를 잘 정리해요.',
    NORMAL: '이야기 흐름을 익히고 있어요.',
  },
};

export const COLLECTING_MESSAGE = '데이터를 모으고 있어요';
