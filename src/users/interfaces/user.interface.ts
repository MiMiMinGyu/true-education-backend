export type UserRole = 'STUDENT' | 'PARENT';

export interface StudentAccount {
  id: number;
  loginId: string;
  passwordHash: string;
  name: string;
  birthYear: number | null;
  // TODO: 학생 코드 유효기간·재발급 정책 미정 (CLAUDE.md D 항목) — 만료 로직 없음
  studentCode: string;
}

export interface ParentAccount {
  id: number;
  loginId: string;
  passwordHash: string;
  name: string;
}

/** 동의한 항목 1개(user_consents 한 행) */
export interface NewConsent {
  key: string;
  version: string;
  /** 보호자 동의 중 연결한 자녀에 대한 항목 */
  aboutChild: boolean;
}

export interface NewStudent {
  loginId: string;
  passwordHash: string;
  name: string;
  birthYear: number | null;
  studentCode: string;
  guardianShareAgreed: boolean;
  consents: NewConsent[];
}

export interface NewParent {
  loginId: string;
  passwordHash: string;
  name: string;
  termsAgreed: boolean;
  marketingAgreed: boolean;
  consents: NewConsent[];
}

export interface NewParentLink {
  studentCode: string;
  guardianConsentAgreed: boolean;
}
