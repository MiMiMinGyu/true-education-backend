import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * AI 파트 파이프라인 → 서버 완성본 전송용 콜백 토큰 확인(Authorization: Bearer).
 * AI API 호출 토큰(AI_PIPELINE_TOKEN)과 별개인 AI_PIPELINE_CALLBACK_TOKEN을 씁니다.
 * 토큰이 설정되지 않은 서버에서는 경로 자체를 없는 것처럼(404) 둡니다.
 */
@Injectable()
export class PipelineCallbackGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.AI_PIPELINE_CALLBACK_TOKEN;
    if (!expected) throw new NotFoundException();

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization') ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    // 길이·내용이 달라도 비교 시간이 같도록 해시끼리 비교합니다.
    if (!timingSafeEqual(digest(given), digest(expected))) {
      throw new UnauthorizedException('인증이 필요합니다.');
    }
    return true;
  }
}
