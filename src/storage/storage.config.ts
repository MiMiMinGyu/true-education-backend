export type StorageDriver = 'local' | 's3';

export interface StorageConfig {
  driver: StorageDriver;
  localDir: string;
  /** 파일 URL 앞부분(로컬 드라이버). 프론트가 다른 오리진이라 절대 URL이 필요합니다 */
  publicBaseUrl: string;
}

export function storageConfig(env = process.env): StorageConfig {
  const driver = env.STORAGE_DRIVER ?? 'local';
  if (driver !== 'local' && driver !== 's3') {
    throw new Error(`STORAGE_DRIVER는 local 또는 s3여야 합니다: ${driver}`);
  }
  return {
    driver,
    localDir: env.STORAGE_LOCAL_DIR ?? 'storage',
    publicBaseUrl:
      env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT ?? 4000}`,
  };
}
