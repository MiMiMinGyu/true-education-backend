export type UserRole = 'student' | 'parent';

interface BaseUser {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}

export interface StudentUser extends BaseUser {
  role: 'student';
  // TODO: 학생 코드 유효기간·재발급 정책 협의 중 (CLAUDE.md D 항목) — 확정 전까지 만료 로직 없음
  studentCode: string;
}

export interface ParentUser extends BaseUser {
  role: 'parent';
  // TODO: 부모 1명이 여러 학생 코드를 등록하는 경우(1:N)의 데이터 구조 미정 (CLAUDE.md D 항목)
  // 우선 배열로 목업 구현. DB 스키마 확정 시 실제 구조로 교체.
  linkedStudentIds: string[];
}

export type User = StudentUser | ParentUser;
