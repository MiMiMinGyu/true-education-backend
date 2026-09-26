// 가입 동의 항목(프론트 가입 화면 lib/signupConsents.ts의 항목 id와 같음).
// 항목마다 따로 기록합니다(user_consents). "전체 동의"는 화면 편의 기능이라 저장하지 않습니다.
// 문구가 바뀌면 version을 올리고, 필요하면 다시 동의받습니다.

export type ConsentRole = 'STUDENT' | 'PARENT';

export interface ConsentItem {
  key: string;
  required: boolean;
  version: string;
  /** 보호자 동의 중 특정 자녀에 대한 것(기록에 대상 자녀를 남김) */
  aboutChild?: boolean;
}

// TODO: 법정대리인 동의의 법적 충분성은 정식 출시 전 확인(CLAUDE.md D 항목)
export const CONSENT_ITEMS: Record<ConsentRole, readonly ConsentItem[]> = {
  STUDENT: [
    { key: 'activityRecord', required: true, version: '2026-09-26' },
    { key: 'speechToText', required: true, version: '2026-09-26' },
    { key: 'guardianView', required: true, version: '2026-09-26' },
  ],
  PARENT: [
    { key: 'terms', required: true, version: '2026-09-26' },
    { key: 'guardianPrivacy', required: true, version: '2026-09-26' },
    {
      key: 'childPrivacy',
      required: true,
      version: '2026-09-26',
      aboutChild: true,
    },
    {
      key: 'childSpeech',
      required: true,
      version: '2026-09-26',
      aboutChild: true,
    },
    {
      key: 'guardianDashboard',
      required: true,
      version: '2026-09-26',
      aboutChild: true,
    },
    { key: 'marketing', required: false, version: '2026-09-26' },
  ],
};

export const consentKeys = (role: ConsentRole) =>
  CONSENT_ITEMS[role].map((item) => item.key);

/** 동의한 항목 중 빠진 필수 항목 */
export function missingRequiredConsents(
  role: ConsentRole,
  agreed: readonly string[],
): string[] {
  return CONSENT_ITEMS[role]
    .filter((item) => item.required && !agreed.includes(item.key))
    .map((item) => item.key);
}
