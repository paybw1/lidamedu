// 후보 그림의 '하단 40%'만 잘라 확대 몽타주 — 선지(①②③④⑤) 혼입을 또렷이 본다.
// usage: montage-bottoms.mjs <list.json> <tag>
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = ".tmp-audit";
const IMG = path.join(OUT, "img");
const list = JSON.parse(fs.readFileSync(process.argv[2] || path.join(OUT, "candidates.json"), "utf8"));
const tag = process.argv[3] || "bot";
const COLS = 3, TW = 460, LH = 22, PER = 12, FRAC = 0.42;

for (let b = 0; b * PER < list.length; b++) {
  const batch = list.slice(b * PER, b * PER + PER);
  const tiles = [];
  for (const it of batch) {
    const local = path.join(IMG, `${it.dir}__${it.file}`);
    if (!fs.existsSync(local)) continue;
    const meta = await sharp(local).metadata();
    const top = Math.round(meta.height * (1 - FRAC));
    const strip = await sharp(local)
      .extract({ left: 0, top, width: meta.width, height: meta.height - top })
      .resize({ width: TW })
      .flatten({ background: "#fff" })
      .toBuffer();
    const th = (await sharp(strip).metadata()).height;
    const tile = await sharp(strip).extend({ bottom: LH, background: "#fff" }).toBuffer();
    const svg = Buffer.from(
      `<svg width="${TW}" height="${th + LH}"><text x="4" y="${th + 16}" font-size="14" fill="#cc0000" font-family="sans-serif">${it.dir} ${it.file}</text></svg>`,
    );
    tiles.push({ buf: await sharp(tile).composite([{ input: svg, top: 0, left: 0 }]).toBuffer(), h: th + LH });
  }
  if (!tiles.length) continue;
  const rowH = Math.max(...tiles.map((t) => t.h));
  const rows = Math.ceil(tiles.length / COLS);
  const comp = tiles.map((t, i) => ({ input: t.buf, top: Math.floor(i / COLS) * (rowH + 8), left: (i % COLS) * (TW + 8) }));
  const outp = path.join(OUT, `montage-${tag}-${String(b).padStart(2, "0")}.png`);
  await sharp({ create: { width: COLS * (TW + 8), height: rows * (rowH + 8), channels: 3, background: "#dddddd" } }).composite(comp).png().toFile(outp);
  console.log("montage", outp, batch.length);
}
console.log("done");
