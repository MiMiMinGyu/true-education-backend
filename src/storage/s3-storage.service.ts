import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { LOCAL_FILES_PATH } from './local-storage.service';
import { S3StorageConfig } from './storage.config';
import { StorageService } from './storage.interface';

/**
 * 파일을 S3에 저장합니다. 버킷은 비공개이고 CloudFront(OAC)가 `/files/*`로 제공합니다.
 * 자격 증명은 코드·설정에 두지 않고 SDK 기본 체인(운영 = EC2 IAM 역할)을 씁니다.
 */
export class S3StorageService implements StorageService {
  constructor(
    private readonly client: Pick<S3Client, 'send'>,
    private readonly config: S3StorageConfig,
    private readonly publicBaseUrl: string,
  ) {}

  static create(
    config: S3StorageConfig,
    publicBaseUrl: string,
  ): S3StorageService {
    const client = new S3Client({
      // 지역은 AWS_REGION 환경변수에서 읽습니다.
      ...(config.endpoint && {
        endpoint: config.endpoint,
        forcePathStyle: true,
      }),
    });
    return new S3StorageService(client, config, publicBaseUrl);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.objectKey(key),
        Body: body,
        ContentType: contentType,
        // 키에 uuid·내용 해시가 들어가 같은 키의 내용이 바뀌지 않으므로 오래 캐시해도 됩니다.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  urlFor(key: string): string {
    return `${this.publicBaseUrl}${LOCAL_FILES_PATH}/${key}`;
  }

  private objectKey(key: string): string {
    // 키는 서버가 만들지만, 접두사 밖이나 이상한 경로를 가리키는 키는 막아 둡니다.
    if (!key || key.startsWith('/') || key.split('/').includes('..')) {
      throw new Error(`올바르지 않은 저장소 키입니다: ${key}`);
    }
    return `${this.config.keyPrefix}${key}`;
  }
}
