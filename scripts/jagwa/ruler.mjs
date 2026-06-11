// Overlay a Y pixel ruler (in scale-2.2 page coords) on each multi-question page
// so cut boundaries can be read off precisely. Downscaled for cheap viewing.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { RENDER_DIR } from "./data.mjs";

const PAGES = [1, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16];
const OUT = "C:/project/lidamedu/scripts/jagwa/.crops/ruler";
fs.mkdirSync(OUT, { recursive: true });

const VW = 760;
for (const page of PAGES) {
  const file = path.join(RENDER_DIR, `p${String(page).padStart(2, "0")}.png`);
  const { width: W, height: H } = await sharp(file).metadata();
  const s = VW / W;
  const VH = Math.round(H * s);
  let lines = "";
  for (let y = 100; y < H; y += 100) {
    const yy = Math.round(y * s);
    lines += `<line x1="0" y1="${yy}" x2="${VW}" y2="${yy}" stroke="red" stroke-width="1.5" opacity="0.55"/>`;
    lines += `<rect x="0" y="${yy - 18}" width="60" height="18" fill="red" opacity="0.8"/>`;
    lines += `<text x="3" y="${yy - 4}" font-family="sans-serif" font-size="15" fill="white">${y}</text>`;
  }
  for (let y = 50; y < H; y += 100) {
    const yy = Math.round(y * s);
    lines += `<line x1="0" y1="${yy}" x2="28" y2="${yy}" stroke="blue" stroke-width="1.5" opacity="0.6"/>`;
  }
  const svg = Buffer.from(`<svg width="${VW}" height="${VH}">${lines}</svg>`);
  const out = path.join(OUT, `p${String(page).padStart(2, "0")}.png`);
  await sharp(file).resize({ width: VW }).composite([{ input: svg }]).flatten({ background: "#fff" }).png().toFile(out);
  console.log(`ruler -> ${out}`);
}
