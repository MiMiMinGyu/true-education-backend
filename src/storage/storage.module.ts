import { Global, Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { storageConfig } from './storage.config';
import { STORAGE_SERVICE, StorageService } from './storage.interface';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useFactory: (): StorageService => {
        const config = storageConfig();
        if (config.driver === 's3') {
          // TODO: 운영 배포 시 S3 드라이버(S3_BUCKET·AWS_REGION, URL은 서명된 URL) 구현
          throw new Error('STORAGE_DRIVER=s3는 아직 구현되지 않았습니다.');
        }
        return new LocalStorageService(config.localDir, config.publicBaseUrl);
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
