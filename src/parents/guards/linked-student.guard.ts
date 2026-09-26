import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import {
  PARENT_REPOSITORY,
  type IParentRepository,
} from '../interfaces/parent-repository.interface';

/**
 * /parents/me/students/:studentId/… 가 로그인한 보호자와 연결된 자녀인지 확인합니다. ParentGuard 다음에 씁니다.
 * 없는 학생도 403으로 답해 다른 학생의 존재 여부를 드러내지 않습니다.
 */
@Injectable()
export class LinkedStudentGuard implements CanActivate {
  constructor(
    @Inject(PARENT_REPOSITORY)
    private readonly repository: IParentRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const studentId = Number(request.params.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw new BadRequestException('잘못된 학생 id입니다.');
    }
    const parentId = request.session.user!.userId;
    if (!(await this.repository.isLinked(parentId, studentId))) {
      throw new ForbiddenException('연결된 자녀가 아닙니다.');
    }
    return true;
  }
}
