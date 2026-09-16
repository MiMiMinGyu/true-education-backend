import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { SessionUser } from '../interfaces/session-user.interface';

// SessionAuthGuard 통과 후에만 사용 (req.session.user 존재 보장)
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.session.user as SessionUser;
  },
);
