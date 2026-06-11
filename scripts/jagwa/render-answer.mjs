// Render the active tag's 정답 PDF pages to RENDER_DIR/ans-NN.png for reading.
// JAGWA_TAG=<tag> node render-answer.mjs [scale]
import * as mupdf from "mupdf";
import fs from "node:fs";
import path from "node:path";
import { EXAM, RENDER_DIR, TAG } from "./data.mjs";

const scale = Number(process.argv[2] ?? "3.2");
fs.mkdirSync(RENDER_DIR, { recursive: true });
const buf = fs.readFileSync(EXAM.answerPdf);
const doc = mupdf.Document.openDocument(new Uint8Array(buf), "application/pdf");
const n = doc.countPages();
console.log(`[${TAG}] answer ${EXAM.answerPdf} pages=${n} scale=${scale}`);
for (let i = 0; i < n; i++) {
  const page = doc.loadPage(i);
  const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
  const out = path.join(RENDER_DIR, `ans-${String(i + 1).padStart(2, "0")}.png`);
  fs.writeFileSync(out, Buffer.from(pix.asPNG()));
  console.log(`  ${out} ${pix.getWidth()}x${pix.getHeight()}`);
  pix.destroy?.(); page.destroy?.();
}
