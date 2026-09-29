import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  IDEMPOTENCY_KEY_HEADER,
  PIPELINE_JOB_ID_HEADER,
} from '../common/constants/inbox.constants';
import { PipelineCallbackGuard } from './guards/pipeline-callback.guard';
import { PipelineDeliveryService } from './pipeline-delivery.service';

/** AI 파트 파이프라인 → 서버: 생성·검수가 끝난 완성본을 즉시 보냄 */
@ApiTags('internal')
@UseGuards(PipelineCallbackGuard)
@Controller('internal/ai')
export class PipelineCallbackController {
  constructor(private readonly delivery: PipelineDeliveryService) {}

  @ApiOperation({
    summary: '완성본 수신(AI 파이프라인 콜백)',
    description:
      '본문 = Book JSON 그대로(id·title·pages·meta). Authorization: Bearer <AI_PIPELINE_CALLBACK_TOKEN>. ' +
      'DB 저장이 끝난 뒤에만 201(새 책)·200을 돌려주고, 같은 전달 키·같은 본문 재수신은 저장 없이 200, 같은 키·다른 본문은 409.',
  })
  @ApiHeader({ name: 'X-Pipeline-Job-Id', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: { type: 'object' } })
  @ApiResponse({ status: 201, description: '새 책 저장' })
  @ApiResponse({ status: 200, description: '갱신·재수신' })
  @ApiResponse({ status: 400, description: '헤더 누락·검증 실패' })
  @ApiResponse({ status: 401, description: '토큰 없음·틀림' })
  @ApiResponse({ status: 409, description: '같은 전달 키에 다른 본문' })
  @ApiResponse({ status: 422, description: 'meta.rule_check.passed가 false' })
  @Post('books')
  async receive(
    @Body() body: Record<string, unknown>,
    @Headers(PIPELINE_JOB_ID_HEADER) jobId: string | undefined,
    @Headers(IDEMPOTENCY_KEY_HEADER) deliveryKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const job = jobId?.trim();
    const key = deliveryKey?.trim();
    if (!job || !key || job.length > 64 || key.length > 250) {
      throw new BadRequestException(
        'X-Pipeline-Job-Id(64자 이하)와 Idempotency-Key(250자 이하) 헤더가 필요합니다.',
      );
    }
    const result = await this.delivery.receive(body, job, key);
    if (result.httpStatus >= 400) {
      throw new HttpException(result.body, result.httpStatus);
    }
    res.status(result.httpStatus);
    return result.body;
  }
}
