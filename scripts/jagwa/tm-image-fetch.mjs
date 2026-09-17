// 상표 2차 발문의 견본 이미지를 받아 PNG 로 변환 — 작성 에이전트가 Read 로 볼 수 있게 (feat-2-039).
// 입력 = tmp/essay/input/tm-<year>-<no>.json 의 images[], 출력 = tmp/essay/img/tm-<year>-<no>-<n>.png
// 저장소 원본이 bmp 라 bmp-js 로 디코드 후 sharp(raw) 로 PNG 인코딩. png/jpg 는 sharp 가 바로 읽는다.
//
//   node scripts/jagwa/tm-image-fetch.mjs            # 전체
//   node scripts/jagwa/tm-image-fetch.mjs 2017 3     # 한 문항
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import bmp from "bmp-js";
import sharp from "sharp";

const IN = "tmp/essay/input";
const OUT = "tmp/essay/img";
mkdirSync(OUT, { recursive: true });
const [onlyYear, onlyNo] = process.argv.slice(2).map(Number);

async function toPng(buf, url) {
  if (/\.bmp(\?|$)/i.test(url)) {
    const d = bmp.decode(buf);
    // bmp-js 는 ABGR 순서로 준다 → RGBA 로 바꾼다
    const rgba = Buffer.alloc(d.width * d.height * 4);
    for (let i = 0; i < d.width * d.height; i++) {
      rgba[i * 4] = d.data[i * 4 + 3];
      rgba[i * 4 + 1] = d.data[i * 4 + 2];
      rgba[i * 4 + 2] = d.data[i * 4 + 1];
      rgba[i * 4 + 3] = 255;
    }
    return sharp(rgba, { raw: { width: d.width, height: d.height, channels: 4 } })
      .png()
      .toBuffer();
  }
  return sharp(buf).png().toBuffer();
}

let done = 0;
let skipped = 0;
const failed = [];
for (const f of readdirSync(IN).sort()) {
  const p = JSON.parse(readFileSync(`${IN}/${f}`, "utf8"));
  if (onlyYear && p.year !== onlyYear) continue;
  if (onlyNo && p.no !== onlyNo) continue;
  for (const img of p.images ?? []) {
    const out = `${OUT}/tm-${p.year}-${p.no}-${img.n}.png`;
    if (existsSync(out)) {
      skipped += 1;
      continue;
    }
    try {
      const res = await fetch(img.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(out, await toPng(buf, img.url));
      done += 1;
    } catch (e) {
      failed.push(`${out} ← ${img.url}: ${e.message}`);
    }
  }
}
console.log(`converted ${done}, skipped(existing) ${skipped}, failed ${failed.length}`);
for (const l of failed) console.log("  " + l);
