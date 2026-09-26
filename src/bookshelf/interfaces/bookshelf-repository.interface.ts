import { BookContent } from '../../content/interfaces/book-content.interface';
import { QuestionData } from '../../learning/interfaces/learning-repository.interface';

export const BOOKSHELF_REPOSITORY = Symbol('BOOKSHELF_REPOSITORY');

export interface ShelfItem {
  assignmentId: number;
  studentTitle: string | null;
  originalTitle: string;
  /** 표지 그림 저장소 키 */
  drawingKey: string | null;
  bookCoverUrl: string | null;
  completedAt: Date;
}

export interface ShelfAttempt {
  questionId: number;
  attemptNumber: number;
  answer: unknown;
  isCorrect: boolean;
}

export interface ShelfBook extends ShelfItem {
  studentId: number;
  book: {
    author: string | null;
    sourceUrl: string | null;
    license: string | null;
    bibliography: string | null;
    content: BookContent;
  };
  questions: QuestionData[];
  attempts: ShelfAttempt[];
  reflection: { transcript: string; durationMs: number } | null;
}

export interface IBookshelfRepository {
  /** 완료한 책만, 최근 완료 순 */
  listCompleted(studentId: number): Promise<ShelfItem[]>;
  /** 완료한 배정이 아니면 null */
  findCompleted(assignmentId: number): Promise<ShelfBook | null>;
}
