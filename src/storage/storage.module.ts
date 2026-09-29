import { Global, Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { storageConfig } from './storage.config';
import { STORAGE_SERVICE, StorageService } from './storage.interface';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useFactory: (): StorageService => {
        const config = storageConfig();
        if (config.s3) {
          // TODO: 정식 출시 전 아이 그림은 서명된 URL(만료 있음)로 전환 검토(DEPLOYMENT-PLAN §2-3). urlFor만 바꾸면 됨
          return S3StorageService.create(config.s3, config.publicBaseUrl);
        }
        return new LocalStorageService(config.localDir, config.publicBaseUrl);
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
