import { Module } from '@nestjs/common';
import { TTS_PROVIDER } from './interfaces/tts-provider.interface';
import { TTS_REPOSITORY } from './interfaces/tts-repository.interface';
import { PrismaTtsRepository } from './repositories/prisma-tts.repository';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { TypecastProvider, typecastConfig } from './typecast.provider';

@Module({
  controllers: [TtsController],
  providers: [
    { provide: TTS_REPOSITORY, useClass: PrismaTtsRepository },
    {
      provide: TTS_PROVIDER,
      useFactory: () => new TypecastProvider(typecastConfig()),
    },
    TtsService,
  ],
  exports: [TtsService],
})
export class TtsModule {}
