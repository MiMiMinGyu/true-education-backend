import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { consentsFor } from '../common/utils/consents.util';
import {
  LINK_REQUEST_LIMIT_MESSAGE,
  LINK_REREQUEST_COOLDOWN_HOURS,
  MAX_PENDING_LINK_REQUESTS,
} from '../common/constants/link.constants';
import {
  CreateLinkRequestDto,
  LinkResponseDto,
  ParentLinkRequestDto,
  StudentLinkRequestDto,
} from './dto/links.dto';
import {
  LINK_REPOSITORY,
  type ILinkRepository,
  type LinkRequestContext,
} from './interfaces/link-repository.interface';

const COOLDOWN_MS = LINK_REREQUEST_COOLDOWN_HOURS * 60 * 60 * 1000;

/** 아이가 수락하기 전에는 이름 가운데를 가립니다(학생 코드만 아는 사람에게 이름이 그대로 드러나지 않도록) */
export function maskName(name: string): string {
  const chars = [...name];
  if (chars.length <= 1) return name;
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

const retryAfterOf = (respondedAt: Date | null) =>
  respondedAt && new Date(respondedAt.getTime() + COOLDOWN_MS);

/**
 * 보호자-학생 연결: 보호자가 학생 코드로 요청 → 학생이 수락하면 연결(ACCEPTED).
 * 보호자 API(대시보드·보상)는 수락된 연결만 허용합니다(LinkedStudentGuard).
 */
@Injectable()
export class LinksService {
  constructor(
    @Inject(LINK_REPOSITORY) private readonly repository: ILinkRepository,
  ) {}

  async request(
    parentId: number,
    dto: CreateLinkRequestDto,
  ): Promise<ParentLinkRequestDto> {
    const consents = consentsFor('PARENT', dto.agreements, true);
    const student = await this.repository.findStudentByCode(dto.studentCode);
    if (!student) {
      throw new NotFoundException('일치하는 학생 코드를 찾을 수 없습니다.');
    }
    const requestedAt = await this.repository.requestLink(
      parentId,
      student.id,
      consents,
      (context) => this.checkRequestable(context),
    );
    return {
      studentId: student.id,
      studentName: maskName(student.name),
      studentCode: dto.studentCode,
      status: 'PENDING',
      requestedAt,
      respondedAt: null,
      retryAfter: null,
    };
  }

  private checkRequestable({ existing, pendingCount }: LinkRequestContext) {
    if (existing?.status === 'ACCEPTED') {
      throw new ConflictException('이미 연결된 아이예요.');
    }
    if (existing?.status === 'PENDING') {
      throw new ConflictException(
        '이미 연결을 요청했어요. 아이가 수락하면 연결돼요.',
      );
    }
    if (existing?.status === 'REJECTED') {
      const retryAfter = retryAfterOf(existing.respondedAt);
      if (retryAfter && retryAfter > new Date()) {
        throw new ConflictException(
          `아이가 요청을 거절했어요. 거절한 뒤 ${LINK_REREQUEST_COOLDOWN_HOURS}시간이 지나면 다시 요청할 수 있어요.`,
        );
      }
    }
    if (pendingCount >= MAX_PENDING_LINK_REQUESTS) {
      throw new ConflictException(LINK_REQUEST_LIMIT_MESSAGE);
    }
  }

  async parentRequests(parentId: number): Promise<ParentLinkRequestDto[]> {
    const requests = await this.repository.listParentRequests(parentId);
    return requests.map((request) => ({
      ...request,
      studentName: maskName(request.studentName),
      retryAfter:
        request.status === 'REJECTED'
          ? retryAfterOf(request.respondedAt)
          : null,
    }));
  }

  async cancel(parentId: number, studentId: number): Promise<void> {
    if (!(await this.repository.cancelRequest(parentId, studentId))) {
      throw new NotFoundException('대기 중인 연결 요청이 없어요.');
    }
  }

  studentRequests(studentId: number): Promise<StudentLinkRequestDto[]> {
    return this.repository.listStudentRequests(studentId);
  }

  async respond(
    studentId: number,
    parentId: number,
    status: 'ACCEPTED' | 'REJECTED',
  ): Promise<LinkResponseDto> {
    if (!(await this.repository.respond(studentId, parentId, status))) {
      throw new NotFoundException('대기 중인 연결 요청이 없어요.');
    }
    return { parentId, status };
  }
}
