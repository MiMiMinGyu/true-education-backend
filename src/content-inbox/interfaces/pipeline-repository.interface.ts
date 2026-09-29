import type { RandomJobRequest } from '../ai-pipeline.client';

export const PIPELINE_REPOSITORY = Symbol('PIPELINE_REPOSITORY');

export type RefillStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';

export interface RefillRecord {
  id: string;
  jobId: string;
  requestBody: RandomJobRequest;
  status: RefillStatus;
  aiStatus: string | null;
  deliveryStatus: string | null;
  error: string | null;
  bookExternalId: string | null;
  submitAttempts: number;
  createdAt: Date;
  finishedAt: Date | null;
}

export type RefillUpdate = Partial<
  Pick<
    RefillRecord,
    | 'jobId'
    | 'status'
    | 'aiStatus'
    | 'deliveryStatus'
    | 'error'
    | 'bookExternalId'
    | 'submitAttempts'
    | 'finishedAt'
  >
>;

export interface DeliveryRecord {
  deliveryKey: string;
  jobId: string;
  externalId: string;
  bodyHash: string;
  status: string;
}

export interface OwnedBooks {
  externalIds: string[];
  sourceUrls: string[];
}

export interface IPipelineRepository {
  /** 보충 요청 제외 목록: DB의 모든 책 id와 원문 URL */
  ownedBooks(): Promise<OwnedBooks>;
  /** 진행 중(PENDING·ACTIVE) 보충 요청이 이미 있으면(유일 인덱스 충돌) null */
  createRefill(record: {
    id: string;
    jobId: string;
    requestBody: RandomJobRequest;
  }): Promise<RefillRecord | null>;
  activeRefill(): Promise<RefillRecord | null>;
  lastFailedRefill(): Promise<RefillRecord | null>;
  findRefillByJob(jobId: string): Promise<RefillRecord | null>;
  updateRefill(id: string, data: RefillUpdate): Promise<void>;
  /** 이 작업의 보충 요청이 진행 중이면 COMPLETED로. 바꿨으면 true */
  completeRefillByJob(jobId: string, externalId: string): Promise<boolean>;
  findDelivery(deliveryKey: string): Promise<DeliveryRecord | null>;
  /** 같은 전달 키가 동시에 들어와 이미 있으면(유일 제약) 기존 기록을 돌려줌 */
  saveDelivery(record: DeliveryRecord): Promise<DeliveryRecord>;
  bookExists(externalId: string): Promise<boolean>;
}
