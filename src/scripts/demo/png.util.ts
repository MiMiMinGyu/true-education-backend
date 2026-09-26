import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

type Rgb = [number, number, number];

/**
 * 시연용 표지 그림: 위(from) → 아래(to) 그라데이션 배경에 가운데 동그라미 하나(to색).
 * 외부 이미지 라이브러리 없이 PNG를 직접 만듭니다.
 */
export function coverPng(width: number, height: number, from: Rgb, to: Rgb) {
  const cx = width / 2;
  const cy = height * 0.45;
  const r = Math.min(width, height) * 0.22;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3); // 필터 바이트 0 + RGB
    const t = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const inCircle = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      for (let c = 0; c < 3; c++) {
        const value = inCircle
          ? Math.round(to[c] * 0.85)
          : Math.round(from[c] + (to[c] - from[c]) * t * 0.6);
        row[1 + x * 3 + c] = value;
      }
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 비트 깊이
  header[9] = 2; // 트루컬러(RGB)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
