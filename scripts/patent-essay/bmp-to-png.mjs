// 2019년 제4문 도면(BMP) → PNG. 한글에서 뽑은 24비트 무압축 BMP 라 라이브러리가 못 읽는다
// (sharp 는 BMP 미지원). 헤더가 단순해 직접 푼다 — 압축·팔레트 형식이 아니면 확장 금지.
//
//   node scripts/patent-essay/bmp-to-png.mjs
import fs from "node:fs";
import path from "node:path";
import { createCanvas, ImageData } from "@napi-rs/canvas";

const DIR = "tmp/patent-essay/img";

/** 24비트 BI_RGB BMP → {width, height, rgba}. 그 외 형식이면 던진다(조용히 깨진 그림을 만들지 않는다). */
function decodeBmp24(buf) {
  const dataOffset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const heightRaw = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if (bpp !== 24 || compression !== 0) {
    throw new Error(`지원하지 않는 BMP (bpp=${bpp} compression=${compression})`);
  }
  const height = Math.abs(heightRaw);
  const bottomUp = heightRaw > 0; // 양수 = 아래에서 위로 저장
  const rowSize = Math.floor((bpp * width + 31) / 32) * 4; // 4바이트 정렬 패딩
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcY = bottomUp ? height - 1 - y : y;
    let src = dataOffset + srcY * rowSize;
    let dst = y * width * 4;
    for (let x = 0; x < width; x++) {
      rgba[dst] = buf[src + 2]; // BMP 는 BGR 순서
      rgba[dst + 1] = buf[src + 1];
      rgba[dst + 2] = buf[src];
      rgba[dst + 3] = 255;
      src += 3;
      dst += 4;
    }
  }
  return { width, height, rgba };
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.toLowerCase().endsWith(".bmp"))
  .sort((a, b) => (a.match(/\d+(?=\.bmp)/i)?.[0] ?? 0) - (b.match(/\d+(?=\.bmp)/i)?.[0] ?? 0));

let total = 0;
for (const f of files) {
  const { width, height, rgba } = decodeBmp24(fs.readFileSync(path.join(DIR, f)));
  const canvas = createCanvas(width, height);
  canvas.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0);
  const out = path.join(DIR, f.replace(/\.bmp$/i, ".png"));
  const png = canvas.toBuffer("image/png");
  fs.writeFileSync(out, png);
  total += png.length;
  console.log(`${f}  ${width}×${height}  →  ${(png.length / 1024).toFixed(0)}KB`);
}
console.log(`\n합계 ${(total / 1024 / 1024).toFixed(2)}MB`);
