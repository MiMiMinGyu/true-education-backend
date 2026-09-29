export type StorageDriver = 'local' | 's3';

export interface S3StorageConfig {
  bucket: string;
  /** 객체 키 앞에 붙는 폴더. CloudFront `/files/*` → S3 경로와 맞추려고 기본값이 `files/` */
  keyPrefix: string;
  /** S3 호환 저장소 주소(로컬 검증용 MinIO 등). 운영(AWS S3)에서는 비워 둡니다 */
  endpoint?: string;
}

export interface StorageConfig {
  driver: StorageDriver;
  localDir: string;
  /**
   * 파일 URL 앞부분. 프론트가 다른 오리진이라 절대 URL이 필요합니다.
   * 로컬 드라이버 = 백엔드 주소, S3 드라이버 = CloudFront 주소(`/files/*`가 S3로 연결됨)
   */
  publicBaseUrl: string;
  s3?: S3StorageConfig;
}

export function storageConfig(env = process.env): StorageConfig {
  const driver = env.STORAGE_DRIVER ?? 'local';
  if (driver !== 'local' && driver !== 's3') {
    throw new Error(`STORAGE_DRIVER는 local 또는 s3여야 합니다: ${driver}`);
  }
  const config: StorageConfig = {
    driver,
    localDir: env.STORAGE_LOCAL_DIR ?? 'storage',
    publicBaseUrl: (
      env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT ?? 4000}`
    ).replace(/\/+$/, ''),
  };
  if (driver === 's3') {
    // 운영에서 빠뜨리면 그림 URL이 localhost를 가리키게 되므로 기본값 없이 요구합니다.
    const missing = ['S3_BUCKET', 'AWS_REGION', 'PUBLIC_BASE_URL'].filter(
      (name) => !env[name],
    );
    if (missing.length) {
      throw new Error(
        `STORAGE_DRIVER=s3에는 ${missing.join(', ')} 설정이 필요합니다.`,
      );
    }
    config.s3 = {
      bucket: env.S3_BUCKET as string,
      keyPrefix: normalizePrefix(env.S3_KEY_PREFIX ?? 'files/'),
      endpoint: env.S3_ENDPOINT || undefined,
    };
  }
  return config;
}

/** 빈 값이면 접두사 없음, 아니면 끝에 `/` 하나 */
function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/` : '';
}
