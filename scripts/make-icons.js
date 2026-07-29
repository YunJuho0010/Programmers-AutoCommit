// 개발 도구가 없는 환경에서도 아이콘을 만들 수 있도록, 외부 이미지 라이브러리 없이
// PNG 바이트를 직접 인코딩하는 1회성 스크립트. 파란 배경(브랜드 컬러) + 흰 체크마크.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ACCENT = [0x25, 0x63, 0xeb]; // #2563eb, 옵션/팝업 화면과 동일한 강조색
const WHITE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

function isRounded(x, y, size, radius) {
  // 네 모서리 중 해당 사분면이면 원 밖인지 검사, 아니면 항상 내부
  if (x < radius && y < radius) return Math.hypot(x - radius, y - radius) <= radius;
  if (x >= size - radius && y < radius) return Math.hypot(x - (size - radius), y - radius) <= radius;
  if (x < radius && y >= size - radius) return Math.hypot(x - radius, y - (size - radius)) <= radius;
  if (x >= size - radius && y >= size - radius)
    return Math.hypot(x - (size - radius), y - (size - radius)) <= radius;
  return true;
}

function buildIcon(size) {
  const radius = size * 0.18;
  const strokeWidth = Math.max(1.6, size * 0.11);
  const p1 = [size * 0.27, size * 0.52];
  const p2 = [size * 0.43, size * 0.68];
  const p3 = [size * 0.75, size * 0.32];

  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // 필터 없음
    for (let x = 0; x < size; x++) {
      const inside = isRounded(x + 0.5, y + 0.5, size, radius);
      let rgb = ACCENT;
      if (inside) {
        const d1 = distanceToSegment(x + 0.5, y + 0.5, ...p1, ...p2);
        const d2 = distanceToSegment(x + 0.5, y + 0.5, ...p2, ...p3);
        if (Math.min(d1, d2) <= strokeWidth / 2) rgb = WHITE;
      }
      raw[offset++] = rgb[0];
      raw[offset++] = rgb[1];
      raw[offset++] = rgb[2];
      raw[offset++] = inside ? 255 : 0; // 모서리 바깥은 투명
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  const png = buildIcon(size);
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
  console.log(`icon${size}.png (${png.length} bytes)`);
}
