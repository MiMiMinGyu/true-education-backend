// 여울이 차례 음성 미리 만들기: npm run tts:warmup -- --book <external_id|all>
// 발표 전 시연용 동화에 실행해 시연 중 Typecast 호출이 일어나지 않게 합니다. 이미 만든 줄은 건너뜁니다(과금 없음).
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import {
  TTS_REPOSITORY,
  type ITtsRepository,
} from '../tts/interfaces/tts-repository.interface';
import { TtsModule } from '../tts/tts.module';
import { TtsService } from '../tts/tts.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    TtsModule,
  ],
})
class WarmupModule {}

async function main() {
  const args = process.argv.slice(2);
  const book = args[args.indexOf('--book') + 1];
  if (!args.includes('--book') || !book) {
    console.log('사용법: npm run tts:warmup -- --book <external_id|all>');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(WarmupModule, {
    logger: ['error', 'warn'],
  });
  let failed = 0;
  try {
    const repository = app.get<ITtsRepository>(TTS_REPOSITORY);
    const tts = app.get(TtsService);
    const books = await repository.listBooks(book === 'all' ? undefined : book);
    if (books.length === 0) {
      console.log(`책을 찾을 수 없습니다: ${book}`);
      process.exitCode = 1;
      return;
    }
    for (const { id, externalId } of books) {
      const result = await tts.warmup(id);
      failed += result.failed.length;
      console.log(
        `[${externalId}] 생성 ${result.created} · 이미 있음 ${result.cached} · 실패 ${result.failed.length}`,
      );
      result.failed.forEach(({ lineId, reason }) =>
        console.log(`  ✗ ${lineId}: ${reason}`),
      );
    }
  } finally {
    await app.close();
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  new Logger('tts-warmup').error(error);
  process.exit(1);
});
