import { LearningStage } from '../../common/constants/learning.constants';
import { BookContent } from '../../content/interfaces/book-content.interface';
import {
  QuestionFormat,
  QuestionStage,
} from '../../content/interfaces/content-repository.interface';

export const LEARNING_REPOSITORY = Symbol('LEARNING_REPOSITORY');

export interface QuestionData {
  id: number;
  format: QuestionFormat;
  stage: QuestionStage;
  order: number;
  text: string;
  /** CHOICE: string[] / ORDERING: { id, text }[] (정답 순서) */
  options: unknown;
  /** CHOICE: number / ORDERING: string[]. 채점 전 응답에 넣지 않습니다 */
  correctAnswer: unknown;
  hint: string | null;
  evidence: unknown;
}

export interface AssignmentDetail {
  id: number;
  studentId: number;
  stage: LearningStage;
  step: number;
  book: {
    id: number;
    title: string;
    author: string | null;
    content: BookContent;
  };
  questions: QuestionData[];
}

export interface CompletedAssignment {
  assignmentId: number;
  /** 학생이 지은 제목, 없으면 원제 */
  title: string;
  stampsEarned: number;
}

export interface AttemptRecord {
  questionId: number;
  attemptNumber: number;
  answer: unknown;
  isCorrect: boolean;
}

export interface NewAttempt {
  assignmentId: number;
  sessionId: number;
  questionId: number;
  attemptNumber: number;
  answer: unknown;
  isCorrect: boolean;
  responseTimeMs: number | null;
}

/** 날짜는 모두 Asia/Seoul 기준 'YYYY-MM-DD' 문자열입니다 */
export interface ILearningRepository {
  /**
   * work 안의 모든 호출을 한 트랜잭션으로 실행합니다. work에 넘어오는 저장소를 써야 트랜잭션에 포함됩니다.
   * 배정 단위 변경은 lockProgress로 먼저 잠가 직렬화합니다.
   */
  runInTransaction<T>(
    work: (repo: ILearningRepository) => Promise<T>,
  ): Promise<T>;

  findInProgressAssignmentId(studentId: number): Promise<number | null>;
  findCompletedAssignmentOn(
    studentId: number,
    date: string,
  ): Promise<CompletedAssignment | null>;
  /** 이 학생에게 한 번도 배정되지 않은 책 id (id 오름차순) */
  findUnassignedBookIds(studentId: number): Promise<number[]>;
  /**
   * 배정과 진행 상태(firstStage, 0)를 함께 만듭니다.
   * 동시 요청으로 유일 제약(진행 중 1권 등)에 걸리면 null을 돌려줍니다.
   */
  createAssignment(
    studentId: number,
    bookId: number,
    date: string,
    firstStage: LearningStage,
  ): Promise<number | null>;
  /** 오늘 학습 세션 행을 만들거나(있으면 last_active_at 갱신) id를 돌려줍니다 */
  touchSession(assignmentId: number, date: string): Promise<number>;

  findAssignmentOwner(assignmentId: number): Promise<number | null>;
  getAssignment(assignmentId: number): Promise<AssignmentDetail | null>;

  /** 진행 상태 행을 잠그고(FOR UPDATE) 읽습니다. 트랜잭션 안에서만 의미가 있습니다 */
  lockProgress(
    assignmentId: number,
  ): Promise<{ stage: LearningStage; step: number } | null>;
  updateProgress(
    assignmentId: number,
    stage: LearningStage,
    step: number,
  ): Promise<void>;
  addReadingStats(
    sessionId: number,
    syllables: number,
    durationMs: number,
  ): Promise<void>;

  listAttempts(assignmentId: number): Promise<AttemptRecord[]>;
  createAttempt(attempt: NewAttempt): Promise<void>;

  saveTitle(assignmentId: number, title: string): Promise<void>;
  /** 배정당 1장. 다시 저장하면 교체합니다 */
  upsertDrawing(assignmentId: number, imageKey: string): Promise<void>;
  findDrawingId(assignmentId: number): Promise<number | null>;
  createReflection(
    drawingId: number,
    transcript: string,
    durationMs: number,
  ): Promise<void>;

  /** 배정 COMPLETED(completed_at = now) + 진행 상태 COMPLETED */
  completeAssignment(assignmentId: number): Promise<void>;
  /** 배정당 1번(UNIQUE). 이미 있으면 유일 제약 오류 */
  createStamp(
    studentId: number,
    assignmentId: number,
    amount: number,
  ): Promise<void>;
  sumStamps(studentId: number): Promise<number>;
}
