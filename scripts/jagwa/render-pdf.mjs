// Render a (scanned) PDF to per-page PNGs using the bundled mupdf.
// Usage: node render-pdf.mjs <which> <scale> [pageFrom] [pageTo]
//   which = "q" (question PDF) | "a" (answer PDF)
// Paths are embedded to avoid shell-quoting issues with Korean + parentheses.
import * as mupdf from "mupdf";
import fs from "node:fs";
import path from "node:path";

const BASE = "C:/project/lidamedu/source/기출모음(2010~2026)/1차";
const SRC = {
  q: `${BASE}/문제/2010_47_1_자과A.pdf`,
  a: `${BASE}/정답/2010_47_1_정답.pdf`,
};
const OUT_BASE = "C:/project/lidamedu/scripts/jagwa/.render";

const which = process.argv[2] ?? "q";
const scale = Number(process.argv[3] ?? "2.2");
const from = process.argv[4] ? Number(process.argv[4]) : 1;
const toArg = process.argv[5] ? Number(process.argv[5]) : null;

const src = SRC[which];
if (!src) throw new Error(`unknown which=${which}`);
const outDir = path.join(OUT_BASE, which);
fs.mkdirSync(outDir, { recursive: true });

const buf = fs.readFileSync(src);
const doc = mupdf.Document.openDocument(new Uint8Array(buf), "application/pdf");
const n = doc.countPages();
const to = toArg ?? n;
console.log(`source=${src}`);
console.log(`pages=${n} rendering ${from}..${to} at scale=${scale}`);

const mat = mupdf.Matrix.scale(scale, scale);
for (let i = from - 1; i < to; i++) {
  const page = doc.loadPage(i);
  const pix = page.toPixmap(mat, mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pix.asPNG();
  const out = path.join(outDir, `p${String(i + 1).padStart(2, "0")}.png`);
  fs.writeFileSync(out, Buffer.from(png));
  console.log(`  ${out}  ${pix.getWidth()}x${pix.getHeight()}  ${(png.length / 1024).toFixed(0)}KB`);
  pix.destroy?.();
  page.destroy?.();
}
console.log("done");
