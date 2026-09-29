import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AiStoryImportService,
  type StoryImportResult,
} from './ai-story-import.service';
import {
  PIPELINE_REPOSITORY,
  type IPipelineRepository,
} from './interfaces/pipeline-repository.interface';
import { RefillService } from './refill.service';

export interface DeliveryResponse {
  httpStatus: number;
  body: {
    status: string;
    externalId: string | null;
    errors?: string[];
    warnings?: string[];
  };
}

/** 적재 결과 → 응답 코드. 2xx는 "DB 저장 완료"를 뜻하므로 저장이 끝난 경우에만 2xx */
const STORED = new Set(['CREATED', 'UPDATED', 'SKIPPED_ASSIGNED']);

/**
 * AI 파트 파이프라인이 보낸 완성본(Book JSON 그대로)을 받습니다.
 * - 같은 전달 키 + 같은 본문 → 저장을 반복하지 않고 200
 * - 같은 전달 키 + 다른 본문 → 409(덮어쓰지 않음)
 * - 저장이 끝난 뒤에만 201(새 책)/200을 돌려줌. 검증 실패는 422·400
 */
@Injectable()
export class PipelineDeliveryService {
  private readonly logger = new Logger('PipelineDelivery');

  constructor(
    private readonly importer: AiStoryImportService,
    @Inject(PIPELINE_REPOSITORY)
    private readonly repository: IPipelineRepository,
    private readonly refill: RefillService,
  ) {}

  async receive(
    body: unknown,
    jobId: string,
    deliveryKey: string,
  ): Promise<DeliveryResponse> {
    const bodyHash = createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex');

    const previous = await this.repository.findDelivery(deliveryKey);
    if (previous) return this.replay(previous, bodyHash);

    const result = await this.importer.importJson(body, {
      source: 'PIPELINE',
    });
    if (!STORED.has(result.status)) {
      return {
        httpStatus:
          result.status === 'INVALID'
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.UNPROCESSABLE_ENTITY,
        body: summary(result),
      };
    }

    // 이미 학생에게 배정된 같은 책(저장 후 응답이 끊겨 다시 온 경우 등)은 바꾸지 않고 저장된 것으로 봄
    const saved = await this.repository.saveDelivery({
      deliveryKey,
      jobId,
      externalId: result.externalId,
      bodyHash,
      status: result.status,
    });
    if (saved.bodyHash !== bodyHash) return this.replay(saved, bodyHash);

    this.logger.log(
      `완성본 수신: 작업 ${jobId} → ${result.externalId} (${result.status})`,
    );
    // 보충 완료 처리가 실패해도 책은 이미 저장됨 → 2xx 유지(상태 확인 작업이 나중에 맞춤)
    await this.refill
      .onBookStored(jobId, result.externalId)
      .catch((error: unknown) =>
        this.logger.warn(
          `보충 완료 처리 실패(작업 ${jobId}): ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    return {
      httpStatus:
        result.status === 'CREATED' ? HttpStatus.CREATED : HttpStatus.OK,
      body: summary(result),
    };
  }

  private replay(
    previous: { externalId: string; bodyHash: string },
    bodyHash: string,
  ): DeliveryResponse {
    if (previous.bodyHash !== bodyHash) {
      return {
        httpStatus: HttpStatus.CONFLICT,
        body: {
          status: 'CONFLICT',
          externalId: previous.externalId,
          errors: ['같은 Idempotency-Key로 다른 본문을 받았습니다.'],
        },
      };
    }
    return {
      httpStatus: HttpStatus.OK,
      body: { status: 'ALREADY_STORED', externalId: previous.externalId },
    };
  }
}

function summary(result: StoryImportResult): DeliveryResponse['body'] {
  return {
    status: result.status,
    externalId: result.externalId,
    errors: result.errors,
    warnings: result.warnings,
  };
}
