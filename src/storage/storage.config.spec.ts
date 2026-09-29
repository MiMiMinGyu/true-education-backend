import { storageConfig } from './storage.config';

describe('storageConfig', () => {
  const s3Env = {
    STORAGE_DRIVER: 's3',
    S3_BUCKET: 'yeoul-files',
    AWS_REGION: 'ap-northeast-2',
    PUBLIC_BASE_URL: 'https://d123.cloudfront.net/',
  };

  it('기본값은 로컬 드라이버와 localhost 주소', () => {
    expect(storageConfig({})).toEqual({
      driver: 'local',
      localDir: 'storage',
      publicBaseUrl: 'http://localhost:4000',
    });
  });

  it('S3 드라이버: 기본 접두사 files/, 주소 끝 / 제거', () => {
    expect(storageConfig(s3Env)).toEqual({
      driver: 's3',
      localDir: 'storage',
      publicBaseUrl: 'https://d123.cloudfront.net',
      s3: { bucket: 'yeoul-files', keyPrefix: 'files/', endpoint: undefined },
    });
  });

  it.each([
    ['/uploads/', 'uploads/'],
    ['', ''],
  ])('S3_KEY_PREFIX %j → %j', (prefix, expected) => {
    expect(
      storageConfig({ ...s3Env, S3_KEY_PREFIX: prefix }).s3?.keyPrefix,
    ).toBe(expected);
  });

  it('S3 드라이버에 필수 설정이 빠지면 시작하지 않는다(그림 URL이 localhost가 되는 것 방지)', () => {
    expect(() =>
      storageConfig({ STORAGE_DRIVER: 's3', AWS_REGION: 'ap-northeast-2' }),
    ).toThrow('S3_BUCKET, PUBLIC_BASE_URL');
  });

  it('알 수 없는 드라이버는 거부한다', () => {
    expect(() => storageConfig({ STORAGE_DRIVER: 'gcs' })).toThrow(
      'local 또는 s3',
    );
  });
});
