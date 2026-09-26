import { LearningStage } from '../../common/constants/learning.constants';
import { CompletedBookResult, DailyReading } from '../utils/dashboard.util';

export const PARENT_REPOSITORY = Symbol('PARENT_REPOSITORY');

export interface LinkedStudent {
  studentId: number;
  name: string;
}

export interface CompletedBookDetail extends CompletedBookResult {
  /** 학생이 지은 제목, 없으면 원제 */
  title: string;
  reflection: { transcript: string; durationMs: number } | null;
}

export interface DashboardSource {
  student: { id: number; name: string };
  stampTotal: number;
  inProgress: {
    assignmentId: number;
    title: string;
    stage: LearningStage;
  } | null;
  /** 최근 완료 순 */
  completedBooks: CompletedBookDetail[];
  /** 최근 학습 날짜 limit일(날짜 내림차순) */
  dailyReading: DailyReading[];
}

export interface IParentRepository {
  listStudents(parentId: number): Promise<LinkedStudent[]>;
  isLinked(parentId: number, studentId: number): Promise<boolean>;
  getDashboardSource(
    studentId: number,
    readingDays: number,
  ): Promise<DashboardSource | null>;
}
