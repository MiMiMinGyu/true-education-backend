import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import type { UserRole } from '../../users/interfaces/user.interface';

abstract class RoleGuard implements CanActivate {
  protected abstract readonly role: UserRole;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.session?.user;
    if (!user) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }
    if (user.role !== this.role) {
      throw new ForbiddenException('이 기능을 사용할 수 없는 계정입니다.');
    }
    return true;
  }
}

/** 학생 전용 API */
@Injectable()
export class StudentGuard extends RoleGuard {
  protected readonly role = 'STUDENT';
}

/** 보호자 전용 API */
@Injectable()
export class ParentGuard extends RoleGuard {
  protected readonly role = 'PARENT';
}
