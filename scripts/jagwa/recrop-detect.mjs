// 도표 문제 이미지에서 하단 선지행을 행별 잉크 분석으로 검출해 그 위로 크롭.
// usage: node scripts/jagwa/recrop-detect.mjs <src.png> <out.png>
//   stdout: JSON {height, choicesTop, cropTop, frac}
import sharp from "sharp";

const [src, out] = process.argv.slice(2);
const { data, info } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

const ink = new Array(height).fill(0);
for (let y = 0; y < height; y++) {
  let c = 0;
  for (let x = 0; x < width; x++) if (data[y * width + x] < 140) c++;
  ink[y] = c;
}
const minInk = Math.max(3, Math.round(width * 0.004));
const isInk = (y) => ink[y] > minInk;

// 1) 하단 여백 건너뛰기 → 선지행 바닥
let y = height - 1;
while (y > 0 && !isInk(y)) y--;
// 2) 위로 올라가며 선지행 묶음(2행까지) 추적. 도표↔선지 분리 간격(BIG_GAP) 만나면 멈춤.
const BIG_GAP = Math.round(height * 0.035);
let gap = 0, top = y;
for (let yy = y; yy >= 0; yy--) {
  if (isInk(yy)) { top = yy; gap = 0; }
  else { gap++; if (gap >= BIG_GAP) break; }
}
const cropTop = Math.max(1, top - Math.round(height * 0.012)); // 선지 위 작은 여백

await sharp(src).extract({ left: 0, top: 0, width, height: cropTop }).toFile(out);
console.log(JSON.stringify({ height, choicesTop: top, cropTop, frac: +(cropTop / height).toFixed(4) }));
