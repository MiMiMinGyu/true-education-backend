import { Module } from '@nestjs/common';
import { TTS_PROVIDER } from './interfaces/tts-provider.interface';
import { TTS_REPOSITORY } from './interfaces/tts-repository.interface';
import { PrismaTtsRepository } from './repositories/prisma-tts.repository';
import { StorageModule } from '../storage/storage.module';
import { TtsAutoWarmupService } from './tts-auto-warmup.service';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { TypecastProvider, typecastConfig } from './typecast.provider';

@Module({
  // 명령줄 스크립트(콘텐츠 적재 등)에서도 이 모듈을 쓰므로 저장소 모듈을 직접 가져옵니다.
  imports: [StorageModule],
  controllers: [TtsController],
  providers: [
    { provide: TTS_REPOSITORY, useClass: PrismaTtsRepository },
    {
      provide: TTS_PROVIDER,
      useFactory: () => new TypecastProvider(typecastConfig()),
    },
    TtsService,
    TtsAutoWarmupService,
  ],
  exports: [TtsService, TtsAutoWarmupService],
})
export class TtsModule {}
