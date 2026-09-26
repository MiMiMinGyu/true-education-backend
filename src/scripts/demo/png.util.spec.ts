import { inflateSync } from 'node:zlib';
import { detectImageType } from '../../learning/utils/image.util';
import { coverPng } from './png.util';

describe('coverPng', () => {
  it('서버가 받는 PNG 형식이고 크기·픽셀 데이터가 맞다', () => {
    const png = coverPng(4, 3, [255, 255, 255], [0, 0, 0]);
    expect(detectImageType(png)).toBe('png');
    // IHDR: 너비·높이
    expect(png.readUInt32BE(16)).toBe(4);
    expect(png.readUInt32BE(20)).toBe(3);
    // IDAT를 풀면 줄마다 필터 1바이트 + RGB 3바이트 × 너비
    const idatLength = png.readUInt32BE(33);
    const pixels = inflateSync(png.subarray(41, 41 + idatLength));
    expect(pixels.length).toBe(3 * (1 + 4 * 3));
  });
});
