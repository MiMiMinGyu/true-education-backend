import type { NewConsent } from '../../users/interfaces/user.interface';

export const LINK_REPOSITORY = Symbol('LINK_REPOSITORY');

export type LinkStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

/** 연결 요청을 만들기 직전의 상태(학생 단위로 잠근 뒤 읽음) */
export interface LinkRequestContext {
  /** 이 보호자와 학생 사이의 기존 행 */
  existing: { status: LinkStatus; respondedAt: Date | null } | null;
  /** 이 학생에게 대기 중인 요청 수(모든 보호자) */
  pendingCount: number;
}

export interface ParentLinkRequest {
  studentId: number;
  studentName: string;
  status: Exclude<LinkStatus, 'ACCEPTED'>;
  requestedAt: Date;
  respondedAt: Date | null;
}

export interface StudentLinkRequest {
  parentId: number;
  parentName: string;
  requestedAt: Date;
}

export interface ILinkRepository {
  findStudentByCode(
    studentCode: string,
  ): Promise<{ id: number; name: string } | null>;

  /**
   * 학생 단위로 잠근 트랜잭션에서 현재 상태를 check에 넘기고(check가 던지면 되돌림),
   * 통과하면 연결 요청을 만들거나(거절된 요청은) 다시 열고, 자녀 관련 동의를 그 학생 대상으로 기록합니다.
   * @returns 요청 시각
   */
  requestLink(
    parentId: number,
    studentId: number,
    consents: NewConsent[],
    check: (context: LinkRequestContext) => void,
  ): Promise<Date>;

  /** 보호자가 보낸 요청 중 아직 연결되지 않은 것(대기·거절), 최근 요청 순 */
  listParentRequests(parentId: number): Promise<ParentLinkRequest[]>;

  /** 대기 중인 요청을 지웁니다. 지운 요청이 있으면 true */
  cancelRequest(parentId: number, studentId: number): Promise<boolean>;

  /** 학생에게 온 대기 요청, 오래된 요청 순 */
  listStudentRequests(studentId: number): Promise<StudentLinkRequest[]>;

  /** 대기 중인 요청에 답합니다. 답할 요청이 있었으면 true */
  respond(
    studentId: number,
    parentId: number,
    status: 'ACCEPTED' | 'REJECTED',
  ): Promise<boolean>;
}
