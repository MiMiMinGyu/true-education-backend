export type ImageType = 'png' | 'webp';

export const IMAGE_CONTENT_TYPES: Record<ImageType, string> = {
  png: 'image/png',
  webp: 'image/webp',
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** 확장자·Content-Type은 클라이언트가 바꿀 수 있으므로 파일 앞부분(시그니처)으로 형식을 판별합니다 */
export function detectImageType(data: Buffer): ImageType | null {
  if (data.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  // WebP: "RIFF" + 파일 크기(4바이트) + "WEBP"
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}
