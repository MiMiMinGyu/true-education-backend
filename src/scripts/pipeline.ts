// AI 파트 파이프라인 수동 명령: npm run pipeline -- sync
// 서버에서는 docker compose exec backend node dist/scripts/pipeline.js sync
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ContentInboxModule } from '../content-inbox/content-inbox.module';
import {
  describe,
  PipelineSyncService,
} from '../content-inbox/pipeline-sync.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ContentInboxModule,
  ],
})
class PipelineModule {}

async function main() {
  const command = process.argv[2];
  if (command !== 'sync') {
    // TODO: generate --random(자동 보충과 같은 요청)은 보충 요청 기록 테이블을 추가한 뒤 구현
    console.log('사용법: npm run pipeline -- sync');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(PipelineModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await app.get(PipelineSyncService).sync();
    console.log(describe(result));
    if (result.failed.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
