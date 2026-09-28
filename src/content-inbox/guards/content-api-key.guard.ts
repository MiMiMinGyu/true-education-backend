import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { CONTENT_API_KEY_HEADER } from '../../common/constants/inbox.constants';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * AI 파트(서버 대 서버) 전용 API 키 확인. 사람 로그인(세션)과 별개입니다.
 * 키가 설정되지 않은 서버에서는 경로 자체를 없는 것처럼(404) 둡니다.
 */
@Injectable()
export class ContentApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.CONTENT_API_KEY;
    if (!expected) throw new NotFoundException();

    const request = context.switchToHttp().getRequest<Request>();
    const given = request.header(CONTENT_API_KEY_HEADER) ?? '';
    // 길이·내용이 달라도 비교 시간이 같도록 해시끼리 비교합니다.
    if (!timingSafeEqual(digest(given), digest(expected))) {
      throw new UnauthorizedException('API 키가 올바르지 않습니다.');
    }
    return true;
  }
}
