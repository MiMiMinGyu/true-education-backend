import { BadRequestException } from '@nestjs/common';
import {
  CONSENT_ITEMS,
  missingRequiredConsents,
  type ConsentRole,
} from '../constants/consent.constants';

/**
 * 동의한 항목을 기록할 형태로 바꿉니다. 필수 항목이 하나라도 빠지면 400입니다
 * (동의는 선택권이 아니라 사전 고지 목적이라 필수 항목 없이는 가입할 수 없음).
 */
export function consentsFor(
  role: ConsentRole,
  agreed: readonly string[],
  aboutChild?: boolean,
) {
  const missing = missingRequiredConsents(role, agreed, aboutChild);
  if (missing.length > 0) {
    throw new BadRequestException(
      `필수 동의 항목에 모두 동의해 주세요: ${missing.join(', ')}`,
    );
  }
  return CONSENT_ITEMS[role]
    .filter(
      (item) =>
        aboutChild === undefined || (item.aboutChild ?? false) === aboutChild,
    )
    .filter((item) => agreed.includes(item.key))
    .map((item) => ({
      key: item.key,
      version: item.version,
      aboutChild: item.aboutChild ?? false,
    }));
}
