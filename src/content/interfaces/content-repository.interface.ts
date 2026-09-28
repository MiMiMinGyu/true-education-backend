import { BookContent } from './book-content.interface';

export const CONTENT_REPOSITORY = Symbol('CONTENT_REPOSITORY');

export type QuestionFormat = 'CHOICE' | 'ORDERING';
export type QuestionStage = 'WHO' | 'WHAT' | 'WHY' | 'EMOTION' | 'ORDER';

export interface BookRecord {
  externalId: string;
  title: string;
  author: string | null;
  sourceUrl: string | null;
  license: string | null;
  bibliography: string | null;
  content: BookContent;
  titleHints: string[] | null;
  sourceMeta: Record<string, unknown> | null;
}

export interface QuestionRecord {
  externalKey: string;
  format: QuestionFormat;
  stage: QuestionStage;
  order: number;
  text: string;
  options: unknown;
  correctAnswer: unknown;
  hint: string | null;
  evidence: unknown;
  explanation: string | null;
}

export interface ExistingBook {
  id: number;
  /** 이 책을 배정받은 학생 수(진행 중·완료 모두) */
  assignmentCount: number;
}

export interface IContentRepository {
  findBook(externalId: string): Promise<ExistingBook | null>;

  /**
   * 책과 문제를 한 트랜잭션으로 저장합니다. 같은 externalId면 갱신하고,
   * 문제는 externalKey 기준으로 갱신·추가하며 입력에 없는 문제는 삭제합니다.
   */
  saveBook(
    book: BookRecord,
    questions: QuestionRecord[],
  ): Promise<{ id: number }>;
}
