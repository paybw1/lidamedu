// 566p 의 일부만 크게 렌더 — 화살촉 방향을 눈으로 확인하려고.
//   node scripts/digest/pipeline/crop566.mjs <출력png> <x0> <y0> <x1> <y1>   (0~1 비율)
import { readFileSync, writeFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";

if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
if (!globalThis.Path2D) globalThis.Path2D = Path2D;
if (!globalThis.ImageData) globalThis.ImageData = ImageData;

const [out, ...box] = process.argv.slice(2);
const [x0, y0, x1, y1] = box.map(Number);
const doc = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync("source/특허법/특허법 강의노트/특허법 강의노트(제10판).pdf")),
  useSystemFonts: true,
}).promise;
const page = await doc.getPage(579);
const base = page.getViewport({ scale: 1 });
const W = 4200; // 크게 뽑아 잘라낸다
const v = page.getViewport({ scale: W / base.width });
const full = createCanvas(Math.ceil(v.width), Math.ceil(v.height));
const fctx = full.getContext("2d");
fctx.fillStyle = "#fff";
fctx.fillRect(0, 0, full.width, full.height);
await page.render({ canvasContext: fctx, viewport: v }).promise;

const cx = Math.round(x0 * full.width), cy = Math.round(y0 * full.height);
const cw = Math.round((x1 - x0) * full.width), ch = Math.round((y1 - y0) * full.height);
const crop = createCanvas(cw, ch);
crop.getContext("2d").drawImage(full, cx, cy, cw, ch, 0, 0, cw, ch);
writeFileSync(out, crop.toBuffer("image/png"));
console.log("저장:", out, cw + "x" + ch);
