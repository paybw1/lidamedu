// 이미지를 상단 frac 비율로 크롭. 에이전트 자가검증 재크롭용.
// usage: node scripts/jagwa/recrop-at.mjs <src.png> <frac 0~1> <out.png>
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const [src, fracStr, out] = process.argv.slice(2);
const frac = Number(fracStr);
if (!src || !out || !(frac > 0 && frac <= 1)) {
  console.log("usage: recrop-at.mjs <src> <frac 0~1> <out>");
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
const m = await sharp(src).metadata();
const h = Math.max(1, Math.min(m.height, Math.round(m.height * frac)));
await sharp(src).extract({ left: 0, top: 0, width: m.width, height: h }).toFile(out);
console.log(`cropped ${m.width}x${h} (orig h=${m.height}, frac ${frac}) -> ${out}`);
