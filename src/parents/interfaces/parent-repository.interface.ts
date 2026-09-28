import type { LearningStage } from '../../common/constants/learning.constants';
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

/** 기간과 무관한 전체 요약(보호자 화면 상단·읽기 속도·설명 말하기 목록) */
export interface StudentOverview {
  completedBooks: number;
  stampTotal: number;
  inProgress: {
    assignmentId: number;
    title: string;
    stage: LearningStage;
  } | null;
  /** 최근 학습 날짜 readingDays일(날짜 내림차순) */
  dailyReading: { date: string; syllables: number; durationMs: number }[];
  /** 설명 말하기가 있는 최근 완료 책 reflectionLimit권(최근 완료 순) */
  reflections: {
    assignmentId: number;
    title: string;
    transcript: string;
    durationMs: number;
    completedAt: Date;
    /** 표지 그림 저장소 키 */
    drawingKey: string;
  }[];
}

export interface IParentRepository {
  listStudents(parentId: number): Promise<LinkedStudent[]>;
  isLinked(parentId: number, studentId: number): Promise<boolean>;
  getDashboardSource(
    studentId: number,
    period: DashboardPeriod,
  ): Promise<DashboardSource | null>;
  getOverview(
    studentId: number,
    readingDays: number,
    reflectionLimit: number,
  ): Promise<StudentOverview>;
}
