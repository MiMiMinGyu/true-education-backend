// AI 파트 파이프라인 수동 명령(복구·점검용). 정상 흐름은 재고 부족 시 자동 요청 + 완성 즉시 콜백입니다.
//   npm run pipeline -- sync                  검증된 책 중 DB에 없는 것 즉시 가져오기(콜백 누락 복구)
//   npm run pipeline -- generate --random     자동 보충과 같은 새 원문 요청(실패 대기 시간 무시, 진행 중이면 안 함)
//   npm run pipeline -- status [작업 id]      작업 상태(없으면 진행 중인 보충 요청)
//   npm run pipeline -- retry-delivery <작업 id>  전송 failed 작업의 같은 결과 재전송(생성 재실행 아님)
// 서버에서는 docker compose exec backend node dist/scripts/pipeline.js <명령>
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  AI_PIPELINE_CLIENT,
  type AiPipelineClient,
} from '../content-inbox/ai-pipeline.client';
import { ContentInboxModule } from '../content-inbox/content-inbox.module';
import {
  PIPELINE_REPOSITORY,
  type IPipelineRepository,
} from '../content-inbox/interfaces/pipeline-repository.interface';
import {
  describe,
  PipelineSyncService,
} from '../content-inbox/pipeline-sync.service';
import { RefillService } from '../content-inbox/refill.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ContentInboxModule,
  ],
})
class PipelineModule {}

const USAGE =
  '사용법: npm run pipeline -- sync | generate --random | status [작업 id] | retry-delivery <작업 id>';

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (!['sync', 'generate', 'status', 'retry-delivery'].includes(command)) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(PipelineModule, {
    logger: ['error', 'warn', 'log'],
  });
  const client = app.get<AiPipelineClient>(AI_PIPELINE_CLIENT);
  const repository = app.get<IPipelineRepository>(PIPELINE_REPOSITORY);
  try {
    if (!client.enabled) {
      throw new Error(
        'AI_PIPELINE_URL·AI_PIPELINE_TOKEN이 설정되지 않았습니다.',
      );
    }
    if (command === 'sync') {
      const result = await app.get(PipelineSyncService).sync();
      console.log(describe(result));
      if (result.failed.length > 0) process.exitCode = 1;
    } else if (command === 'generate') {
      if (arg !== '--random') {
        // TODO: 등록 원천 지정 생성(pipeline generate <원천 id>)은 점검용이라 필요할 때 추가
        throw new Error('지금은 generate --random만 지원합니다.');
      }
      const outcome = await app
        .get(RefillService)
        .requestIfNeeded({ reason: '수동 명령', force: true });
      const active = await repository.activeRefill();
      console.log(outcome.status, active ? JSON.stringify(view(active)) : '');
    } else if (command === 'status') {
      const jobId = arg ?? (await repository.activeRefill())?.jobId;
      if (!jobId) {
        console.log('진행 중인 보충 요청이 없습니다.');
      } else {
        const refill = await repository.findRefillByJob(jobId);
        if (refill) console.log('백엔드 기록:', JSON.stringify(view(refill)));
        console.log('AI 작업:', JSON.stringify(await client.getJob(jobId)));
      }
    } else {
      if (!arg) throw new Error(USAGE);
      const result = await client.retryDelivery(arg);
      console.log(`HTTP ${result.httpStatus}`, JSON.stringify(result.body));
      if (result.httpStatus >= 300) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

/** 보낸 본문(보유 목록)은 길어서 개수만 */
function view(refill: {
  id: string;
  jobId: string;
  status: string;
  aiStatus: string | null;
  deliveryStatus: string | null;
  error: string | null;
  bookExternalId: string | null;
  requestBody: { exclude_book_ids: string[]; exclude_source_urls: string[] };
}) {
  return {
    id: refill.id,
    jobId: refill.jobId,
    status: refill.status,
    aiStatus: refill.aiStatus,
    deliveryStatus: refill.deliveryStatus,
    error: refill.error,
    book: refill.bookExternalId,
    excluded: `${refill.requestBody.exclude_book_ids.length}권 · URL ${refill.requestBody.exclude_source_urls.length}개`,
  };
}

void main();
