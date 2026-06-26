// .tmp-audit/img 의 그림들을 라벨 몽타주로 묶는다. usage: montage-figs.mjs <list.json> <tag>
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = ".tmp-audit";
const IMG = path.join(OUT, "img");
const list = JSON.parse(fs.readFileSync(process.argv[2] || path.join(OUT, "candidates.json"), "utf8"));
const tag = process.argv[3] || "cand";
const COLS = 4, TW = 360, LH = 22, PER = 16;

for (let b = 0; b * PER < list.length; b++) {
  const batch = list.slice(b * PER, b * PER + PER);
  const tiles = [];
  for (const it of batch) {
    const local = path.join(IMG, `${it.dir}__${it.file}`);
    if (!fs.existsSync(local)) continue;
    const scaled = await sharp(local).resize({ width: TW, withoutEnlargement: false }).flatten({ background: "#fff" }).toBuffer();
    const th = (await sharp(scaled).metadata()).height;
    const tile = await sharp(scaled).extend({ bottom: LH, background: "#fff" }).toBuffer();
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
