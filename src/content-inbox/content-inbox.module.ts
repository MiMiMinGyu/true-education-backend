import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { AdminContentController } from './admin-content.controller';
import { AI_PIPELINE_CLIENT, HttpAiPipelineClient } from './ai-pipeline.client';
import { PipelineSyncService } from './pipeline-sync.service';
import { AiStoryImportService } from './ai-story-import.service';
import { ALERT_NOTIFIER, WebhookAlertNotifier } from './alert-notifier';
import { ContentStockService } from './content-stock.service';
import { ContentApiKeyGuard } from './guards/content-api-key.guard';
import { INBOX_REPOSITORY } from './interfaces/inbox-repository.interface';
import { PrismaInboxRepository } from './repositories/prisma-inbox.repository';

/** AI 파트 → 서버 동화 전송(POST /admin/books)과 동화 부족 알림 */
@Module({
  imports: [ContentModule],
  controllers: [AdminContentController],
  providers: [
    { provide: INBOX_REPOSITORY, useClass: PrismaInboxRepository },
    { provide: ALERT_NOTIFIER, useClass: WebhookAlertNotifier },
    { provide: AI_PIPELINE_CLIENT, useClass: HttpAiPipelineClient },
    AiStoryImportService,
    ContentStockService,
    ContentApiKeyGuard,
    PipelineSyncService,
  ],
  exports: [AiStoryImportService, ContentStockService, PipelineSyncService],
})
export class ContentInboxModule {}
