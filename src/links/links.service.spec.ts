import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CHILD_CONSENT_KEYS } from '../common/constants/consent.constants';
import {
  LINK_REREQUEST_COOLDOWN_HOURS,
  MAX_PENDING_LINK_REQUESTS,
} from '../common/constants/link.constants';
import type { NewConsent } from '../users/interfaces/user.interface';
import {
  ILinkRepository,
  LinkRequestContext,
  LinkStatus,
} from './interfaces/link-repository.interface';
import { LinksService, maskName } from './links.service';

interface Row {
  parentId: number;
  studentId: number;
  status: LinkStatus;
  requestedAt: Date;
  respondedAt: Date | null;
}

class InMemoryLinkRepository implements ILinkRepository {
  readonly students = [{ id: 1, name: '김여울', code: 'aB3$vK' }];
  readonly parents = new Map([
    [10, '김보호'],
    [11, '박보호'],
  ]);
  rows: Row[] = [];
  consents: (NewConsent & { parentId: number; studentId: number })[] = [];

  async findStudentByCode(code: string) {
    const student = this.students.find((s) => s.code === code);
    return student ? { id: student.id, name: student.name } : null;
  }

  async requestLink(
    parentId: number,
    studentId: number,
    consents: NewConsent[],
    check: (context: LinkRequestContext) => void,
  ) {
    const existing =
      this.rows.find(
        (r) => r.parentId === parentId && r.studentId === studentId,
      ) ?? null;
    check({
      existing,
      pendingCount: this.rows.filter(
        (r) => r.studentId === studentId && r.status === 'PENDING',
      ).length,
    });
    const now = new Date();
    this.rows = this.rows.filter((r) => r !== existing);
    this.rows.push({
      parentId,
      studentId,
      status: 'PENDING',
      requestedAt: now,
      respondedAt: null,
    });
    this.consents.push(...consents.map((c) => ({ ...c, parentId, studentId })));
    return now;
  }

  async listParentRequests(parentId: number) {
    return this.rows
      .filter((r) => r.parentId === parentId && r.status !== 'ACCEPTED')
      .map((r) => ({
        studentId: r.studentId,
        studentName: this.students.find((s) => s.id === r.studentId)!.name,
        status: r.status as 'PENDING' | 'REJECTED',
        requestedAt: r.requestedAt,
        respondedAt: r.respondedAt,
      }));
  }

  async cancelRequest(parentId: number, studentId: number) {
    const before = this.rows.length;
    this.rows = this.rows.filter(
      (r) =>
        !(
          r.parentId === parentId &&
          r.studentId === studentId &&
          r.status === 'PENDING'
        ),
    );
    return this.rows.length < before;
  }

  async listStudentRequests(studentId: number) {
    return this.rows
      .filter((r) => r.studentId === studentId && r.status === 'PENDING')
      .map((r) => ({
        parentId: r.parentId,
        parentName: this.parents.get(r.parentId) ?? '보호자',
        requestedAt: r.requestedAt,
      }));
  }

  async respond(
    studentId: number,
    parentId: number,
    status: 'ACCEPTED' | 'REJECTED',
  ) {
    const row = this.rows.find(
      (r) =>
        r.parentId === parentId &&
        r.studentId === studentId &&
        r.status === 'PENDING',
    );
    if (!row) return false;
    row.status = status;
    row.respondedAt = new Date();
    return true;
  }
}

const HOUR_MS = 60 * 60 * 1000;
const request = (studentCode = 'aB3$vK', agreements = CHILD_CONSENT_KEYS) => ({
  studentCode,
  agreements: [...agreements],
});

describe('LinksService', () => {
  let repository: InMemoryLinkRepository;
  let service: LinksService;

  beforeEach(() => {
    repository = new InMemoryLinkRepository();
    service = new LinksService(repository);
  });

  it('학생 코드로 요청하면 수락 대기 상태가 되고, 자녀 동의를 그 아이 대상으로 기록한다', async () => {
    const result = await service.request(10, request());

    expect(result).toMatchObject({
      studentId: 1,
      studentName: '김*울',
      status: 'PENDING',
      retryAfter: null,
    });
    expect(repository.consents.map((c) => [c.key, c.studentId])).toEqual(
      CHILD_CONSENT_KEYS.map((key) => [key, 1]),
    );
  });

  it.each(CHILD_CONSENT_KEYS)(
    '자녀 동의 %s가 빠지면 BadRequestException',
    async (missing) => {
      await expect(
        service.request(
          10,
          request(
            undefined,
            CHILD_CONSENT_KEYS.filter((key) => key !== missing),
          ),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(repository.rows).toHaveLength(0);
    },
  );

  it('일치하는 학생 코드가 없으면 NotFoundException', async () => {
    await expect(service.request(10, request('Zz9$Qx'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('이미 요청했거나 이미 연결된 아이에게 다시 요청하면 ConflictException', async () => {
    await service.request(10, request());
    await expect(service.request(10, request())).rejects.toThrow(
      ConflictException,
    );

    await service.respond(1, 10, 'ACCEPTED');
    await expect(service.request(10, request())).rejects.toThrow(
      ConflictException,
    );
  });

  it('거절된 뒤에는 정해진 시간이 지나야 다시 요청할 수 있다', async () => {
    await service.request(10, request());
    await service.respond(1, 10, 'REJECTED');

    await expect(service.request(10, request())).rejects.toThrow(
      ConflictException,
    );
    const [rejected] = await service.parentRequests(10);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.retryAfter!.getTime()).toBe(
      rejected.respondedAt!.getTime() + LINK_REREQUEST_COOLDOWN_HOURS * HOUR_MS,
    );

    repository.rows[0].respondedAt = new Date(
      Date.now() - LINK_REREQUEST_COOLDOWN_HOURS * HOUR_MS - 1000,
    );
    await expect(service.request(10, request())).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  it(`한 아이의 대기 요청은 ${MAX_PENDING_LINK_REQUESTS}개까지`, async () => {
    for (let parentId = 1; parentId <= MAX_PENDING_LINK_REQUESTS; parentId++) {
      await service.request(parentId, request());
    }
    await expect(service.request(99, request())).rejects.toThrow(
      ConflictException,
    );
  });

  it('학생은 대기 요청을 보고 수락·거절하며, 답한 요청은 목록에서 빠진다', async () => {
    await service.request(10, request());
    await service.request(11, request());

    expect((await service.studentRequests(1)).map((r) => r.parentName)).toEqual(
      ['김보호', '박보호'],
    );
    await expect(service.respond(1, 10, 'ACCEPTED')).resolves.toEqual({
      parentId: 10,
      status: 'ACCEPTED',
    });
    await service.respond(1, 11, 'REJECTED');

    expect(await service.studentRequests(1)).toEqual([]);
    await expect(service.respond(1, 10, 'REJECTED')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('보호자는 대기 중인 요청만 취소할 수 있다', async () => {
    await service.request(10, request());
    await service.cancel(10, 1);
    expect(repository.rows).toHaveLength(0);

    await expect(service.cancel(10, 1)).rejects.toThrow(NotFoundException);
  });

  it.each([
    ['김여울', '김*울'],
    ['이솔', '이*'],
    ['남궁여울이', '남***이'],
    ['A', 'A'],
  ])('이름 가리기: %s → %s', (name, masked) => {
    expect(maskName(name)).toBe(masked);
  });
});
