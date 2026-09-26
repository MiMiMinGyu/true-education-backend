import { PeriodBook } from '../utils/dashboard.util';

export const PARENT_REPOSITORY = Symbol('PARENT_REPOSITORY');

export interface LinkedStudent {
  studentId: number;
  name: string;
}

export interface DashboardBook extends PeriodBook {
  /** 학생이 지은 제목, 없으면 원제 */
  title: string;
  completedAt: Date;
  reflection: { transcript: string; durationMs: number } | null;
}

/** 날짜는 Asia/Seoul 기준 'YYYY-MM-DD'(양 끝 포함) */
export interface DashboardPeriod {
  startDate: string;
  endDate: string;
}

export interface DashboardSource {
  student: { id: number; name: string };
  /** 기간 안에 완료한 책, 최근 완료 순 */
  books: DashboardBook[];
}

export interface IParentRepository {
  listStudents(parentId: number): Promise<LinkedStudent[]>;
  isLinked(parentId: number, studentId: number): Promise<boolean>;
  getDashboardSource(
    studentId: number,
    period: DashboardPeriod,
  ): Promise<DashboardSource | null>;
}
