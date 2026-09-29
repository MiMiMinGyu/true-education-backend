import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { AdminContentController } from './admin-content.controller';
import { AI_PIPELINE_CLIENT, HttpAiPipelineClient } from './ai-pipeline.client';
import { PipelineCallbackGuard } from './guards/pipeline-callback.guard';
import { PIPELINE_REPOSITORY } from './interfaces/pipeline-repository.interface';
import { PipelineCallbackController } from './pipeline-callback.controller';
import { PipelineDeliveryService } from './pipeline-delivery.service';
import { PipelineSyncService } from './pipeline-sync.service';
import { RefillService } from './refill.service';
import { PrismaPipelineRepository } from './repositories/prisma-pipeline.repository';
import { AiStoryImportService } from './ai-story-import.service';
import { ALERT_NOTIFIER, WebhookAlertNotifier } from './alert-notifier';
import { ContentStockService } from './content-stock.service';
import { ContentApiKeyGuard } from './guards/content-api-key.guard';
import { INBOX_REPOSITORY } from './interfaces/inbox-repository.interface';
import { PrismaInboxRepository } from './repositories/prisma-inbox.repository';

/** AI 파트 → 서버 동화 전송(POST /admin/books)과 동화 부족 알림 */
@Module({
  imports: [ContentModule],
  controllers: [AdminContentController, PipelineCallbackController],
  providers: [
    { provide: INBOX_REPOSITORY, useClass: PrismaInboxRepository },
    { provide: ALERT_NOTIFIER, useClass: WebhookAlertNotifier },
    { provide: AI_PIPELINE_CLIENT, useClass: HttpAiPipelineClient },
    { provide: PIPELINE_REPOSITORY, useClass: PrismaPipelineRepository },
    AiStoryImportService,
    ContentStockService,
    ContentApiKeyGuard,
    PipelineCallbackGuard,
    PipelineSyncService,
    RefillService,
    PipelineDeliveryService,
  ],
  exports: [
    AiStoryImportService,
    ContentStockService,
    PipelineSyncService,
    RefillService,
  ],
})
export class ContentInboxModule {}
