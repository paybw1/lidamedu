// 세로 밴드 크롭: node figcrop-band.mjs <src> <topFrac> <botFrac> <out>
// topFrac/botFrac = 0~1 (이미지 높이 비율). [top..bot] 밴드를 잘라 out 에 저장.
import sharp from "sharp";
const [, , src, topF, botF, out] = process.argv;
if (!src || topF == null || botF == null || !out) {
  console.error("usage: figcrop-band.mjs <src> <topFrac> <botFrac> <out>");
  process.exit(1);
}
const m = await sharp(src).metadata();
let t = Math.max(0, Math.min(1, Number(topF)));
let b = Math.max(0, Math.min(1, Number(botF)));
if (b <= t) { console.error("botFrac must be > topFrac"); process.exit(1); }
const top = Math.round(m.height * t);
const bot = Math.round(m.height * b);
const h = Math.max(1, bot - top);
await sharp(src).extract({ left: 0, top, width: m.width, height: h }).toFile(out);
console.log(`${src} [${t.toFixed(3)}..${b.toFixed(3)}] -> ${out} (${m.width}x${h})`);
