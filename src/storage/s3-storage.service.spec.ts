import { PutObjectCommand } from '@aws-sdk/client-s3';
import { S3StorageService } from './s3-storage.service';

describe('S3StorageService', () => {
  const send = jest.fn();
  const storage = new S3StorageService(
    { send } as never,
    { bucket: 'yeoul-files', keyPrefix: 'files/' },
    'https://d123.cloudfront.net',
  );

  beforeEach(() => send.mockReset().mockResolvedValue({}));

  it('접두사를 붙인 키로 형식·캐시 헤더와 함께 올린다', async () => {
    const body = Buffer.from('png');
    await storage.put('drawings/1/a.png', body, 'image/png');

    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'yeoul-files',
      Key: 'files/drawings/1/a.png',
      Body: body,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    });
  });

  it('URL은 CloudFront 주소 + /files/키 (S3 객체 키와 같은 경로)', () => {
    expect(storage.urlFor('tts/3/p001-1-abcd1234.mp3')).toBe(
      'https://d123.cloudfront.net/files/tts/3/p001-1-abcd1234.mp3',
    );
  });

  it.each(['', '/drawings/a.png', '../escape.png', 'drawings/../../x.png'])(
    '이상한 키(%j)는 올리지 않는다',
    async (key) => {
      await expect(
        storage.put(key, Buffer.from('x'), 'image/png'),
      ).rejects.toThrow('올바르지 않은 저장소 키');
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('S3 오류는 그대로 올려 보낸다(호출한 쪽이 처리)', async () => {
    send.mockRejectedValue(new Error('AccessDenied'));
    await expect(
      storage.put('drawings/1/a.png', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow('AccessDenied');
  });
});
