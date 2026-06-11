// Render the active tag's 문제 PDF to per-page PNGs in RENDER_DIR (scale 2.2).
// Tag via JAGWA_TAG (data.mjs). Usage: JAGWA_TAG=2011_48_B node render-pdf.mjs [scale]
import * as mupdf from "mupdf";
import fs from "node:fs";
import path from "node:path";
import { EXAM, RENDER_DIR, TAG } from "./data.mjs";

const scale = Number(process.argv[2] ?? "2.2");
fs.mkdirSync(RENDER_DIR, { recursive: true });
const buf = fs.readFileSync(EXAM.problemPdf);
const doc = mupdf.Document.openDocument(new Uint8Array(buf), "application/pdf");
const n = doc.countPages();
const off = EXAM.pageOffset ?? 0; // 앞쪽 안내/유의사항 페이지 건너뛰기(예: 2022)
console.log(`[${TAG}] ${EXAM.problemPdf} pages=${n} offset=${off} scale=${scale}`);
const mat = mupdf.Matrix.scale(scale, scale);
for (let i = off; i < n; i++) {
  const page = doc.loadPage(i);
  const pix = page.toPixmap(mat, mupdf.ColorSpace.DeviceRGB, false, true);
  const out = path.join(RENDER_DIR, `p${String(i + 1 - off).padStart(2, "0")}.png`);
  fs.writeFileSync(out, Buffer.from(pix.asPNG()));
  pix.destroy?.(); page.destroy?.();
}
console.log(`done → ${RENDER_DIR}`);
