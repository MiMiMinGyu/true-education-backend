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

export interface NewStudent {
  loginId: string;
  passwordHash: string;
  name: string;
  birthYear: number | null;
  studentCode: string;
  guardianShareAgreed: boolean;
}

export interface NewParent {
  loginId: string;
  passwordHash: string;
  name: string;
  termsAgreed: boolean;
  marketingAgreed: boolean;
}

export interface NewParentLink {
  studentCode: string;
  guardianConsentAgreed: boolean;
}
