export const INBOX_REPOSITORY = Symbol('INBOX_REPOSITORY');

export type ImportLogSource = 'API' | 'CLI' | 'PIPELINE';

export interface ImportLogEntry {
  source: ImportLogSource;
  externalId: string | null;
  status: string;
  errors: string[];
  warnings: string[];
  payload: unknown;
}

export interface StockSummary {
  totalBooks: number;
  /** 배정을 한 번이라도 받은 학생 수 */
  activeStudents: number;
  /** 그중 남은 책(아직 배정받지 않은 책)이 기준 이하인 학생 수 */
  lowStudents: number;
  /** 활동 학생 중 가장 적게 남은 책 수(활동 학생이 없으면 전체 책 수) */
  minRemaining: number;
}

export interface IInboxRepository {
  saveLog(entry: ImportLogEntry): Promise<void>;
  /** 주어진 외부 id 중 이미 DB에 있는 것 */
  existingExternalIds(externalIds: string[]): Promise<string[]>;
  /** 이 학생이 아직 배정받지 않은 책 수 */
  countUnassignedBooks(studentId: number): Promise<number>;
  stockSummary(threshold: number): Promise<StockSummary>;
}
