import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  LEARNING_REPOSITORY,
  type ILearningRepository,
} from '../interfaces/learning-repository.interface';

/** /assignments/:id/… 가 로그인한 학생 본인의 배정인지 확인합니다. StudentGuard 다음에 씁니다 */
@Injectable()
export class AssignmentOwnerGuard implements CanActivate {
  constructor(
    @Inject(LEARNING_REPOSITORY)
    private readonly repository: ILearningRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const assignmentId = Number(request.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      throw new BadRequestException('잘못된 배정 id입니다.');
    }
    const ownerId = await this.repository.findAssignmentOwner(assignmentId);
    if (ownerId === null)
      throw new NotFoundException('배정을 찾을 수 없습니다.');
    if (ownerId !== request.session.user?.userId) {
      throw new ForbiddenException('다른 학생의 배정입니다.');
    }
    return true;
  }
}
