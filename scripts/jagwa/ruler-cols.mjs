// Ruler overlay on specific 2019 column images (RENDER_DIR/pNN.png at scale 3.2)
// for precise manual cut reading. Usage: node ruler-cols.mjs 7 10 11 12 13 14
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { RENDER_DIR } from "./data.mjs";

const cols = process.argv.slice(2).map(Number);
const OUT = path.join(RENDER_DIR, "ruler");
fs.mkdirSync(OUT, { recursive: true });
const VW = 380;
for (const c of cols) {
  const file = path.join(RENDER_DIR, `p${String(c).padStart(2, "0")}.png`);
  const { width: W, height: H } = await sharp(file).metadata();
  const s = VW / W;
  const VH = Math.round(H * s);
  let lines = "";
  for (let y = 100; y < H; y += 100) {
    const yy = Math.round(y * s);
    const major = y % 200 === 0;
    lines += `<line x1="0" y1="${yy}" x2="${VW}" y2="${yy}" stroke="red" stroke-width="${major ? 1.2 : 0.6}" opacity="0.5"/>`;
    if (major) {
      lines += `<rect x="0" y="${yy - 14}" width="54" height="14" fill="red" opacity="0.8"/>`;
      lines += `<text x="2" y="${yy - 3}" font-family="sans-serif" font-size="12" fill="white">${y}</text>`;
    }
  }
  const svg = Buffer.from(`<svg width="${VW}" height="${VH}">${lines}</svg>`);
  const out = path.join(OUT, `col${String(c).padStart(2, "0")}.png`);
  await sharp(file).resize({ width: VW }).composite([{ input: svg }]).flatten({ background: "#fff" }).png().toFile(out);
  console.log(`ruler col${c} (${W}x${H}) → ${out}`);
}
