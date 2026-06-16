// PDF 페이지 → PNG 렌더(pdfjs + @napi-rs/canvas). 비전 OCR 보조(글리프 깨짐/스캔 PDF용).
// 사용: node scripts/jagwa/pdf-render.mjs "<pdf>" <from> <to> [scale]
import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";

if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
if (!globalThis.Path2D) globalThis.Path2D = Path2D;
if (!globalThis.ImageData) globalThis.ImageData = ImageData;

const path = process.argv[2];
const from = parseInt(process.argv[3] || "1", 10);
const to = parseInt(process.argv[4] || String(from), 10);
const scale = parseFloat(process.argv[5] || "2.0");
const outDir = ".haesol-audit/png";
fs.mkdirSync(outDir, { recursive: true });

const data = new Uint8Array(fs.readFileSync(path));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
const base = path.split(/[\\/]/).pop().replace(/\.[^.]+$/, "").replace(/[^\w가-힣]+/g, "_");
for (let i = from; i <= Math.min(to, doc.numPages); i++) {
  const page = await doc.getPage(i);
  const vp = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  const out = `${outDir}/${base}_p${i}.png`;
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(out);
}
