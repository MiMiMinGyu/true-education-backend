import { DOUBLE_STAMP_CHANCE } from '../../common/constants/learning.constants';

/** 책 1권 완료로 받는 스탬프 수: 1개, DOUBLE_STAMP_CHANCE 확률로 2개 */
export function rollStampAmount(random: () => number = Math.random): number {
  return random() < DOUBLE_STAMP_CHANCE ? 2 : 1;
}
