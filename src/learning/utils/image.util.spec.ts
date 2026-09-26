import { detectImageType } from './image.util';

describe('detectImageType', () => {
  it('PNG·WebP 시그니처를 판별한다', () => {
    expect(
      detectImageType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      ),
    ).toBe('png');
    expect(
      detectImageType(
        Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.from([0x10, 0, 0, 0]),
          Buffer.from('WEBPVP8 '),
        ]),
      ),
    ).toBe('webp');
  });

  it('JPEG·확장자만 바꾼 파일·짧은 파일은 거부한다', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(detectImageType(Buffer.from('<svg xmlns="..."/>'))).toBeNull();
    expect(detectImageType(Buffer.from('RIFF'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});
