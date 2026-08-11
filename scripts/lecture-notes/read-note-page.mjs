// 강의노트 PDF 의 특정 페이지를 PNG 로 렌더 — 배포본은 텍스트 레이어가 없어 눈으로 읽어야 한다.
// ★ 인쇄 페이지 번호 ≠ PDF 페이지 번호. 오프셋이 구간마다 다르므로 한 장 렌더해 표제의 인쇄 번호로 보정할 것.
//
//   node scripts/lecture-notes/read-note-page.mjs "source/특허법/리담특허법 강의노트(제10판).pdf" <출력디렉토리> 448 450
import { readFileSync, writeFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";

if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
if (!globalThis.Path2D) globalThis.Path2D = Path2D;
if (!globalThis.ImageData) globalThis.ImageData = ImageData;

const [pdfPath, outDir, ...pages] = process.argv.slice(2);
if (!pdfPath || !outDir || !pages.length) {
  console.log("사용법: <pdf 경로> <출력 디렉토리> <페이지…>");
  process.exit(0);
}
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true }).promise;
console.log("총 페이지:", doc.numPages);
for (const ps of pages) {
  const page = await doc.getPage(Number(ps));
  const base = page.getViewport({ scale: 1 });
  const v = page.getViewport({ scale: 1500 / base.width });
  const canvas = createCanvas(Math.ceil(v.width), Math.ceil(v.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: v }).promise;
  const out = `${outDir}/p${ps}.png`;
  writeFileSync(out, canvas.toBuffer("image/png"));
  console.log("저장:", out);
}
