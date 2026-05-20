// 강의노트 PDF 샘플 페이지를 mupdf-wasm 으로 PNG 추출 → tesseract.js (kor) OCR.
// 좌상단 영역만 잘라 헤더만 OCR — 속도/정확도 모두 유리.
// 결과 정상이면 본 import 스크립트(import-lecture-note-ocr.ts)로 확장.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PDF_PATH = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "source",
  "리담특허법 강의노트(제10판).pdf",
);
const OUT_DIR = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "tmp",
  "ocr-probe",
);
mkdirSync(OUT_DIR, { recursive: true });

// 1) mupdf-wasm 로드
const mupdf = await import("mupdf");

const pdfBuf = readFileSync(PDF_PATH);
console.log(`[info] PDF size: ${(pdfBuf.length / 1024 / 1024).toFixed(1)} MB`);

const doc = mupdf.Document.openDocument(pdfBuf, "application/pdf");
const numPages = doc.countPages();
console.log(`[info] pages: ${numPages}`);

// 샘플 페이지들 — 1-based 사용자 인덱스, mupdf 는 0-based.
const SAMPLES = [1, 67].filter((p) => p <= numPages);
const SCALE = 2.0; // 2x 해상도 → OCR 정확도

// 2) tesseract.js 워커 준비
const { createWorker } = await import("tesseract.js");
console.log("[info] creating tesseract worker (kor)...");
const worker = await createWorker("kor", 1, {
  logger: () => {}, // 진행 로그 끔
});
console.log("[info] worker ready");

for (const pageNum1 of SAMPLES) {
  const t0 = Date.now();
  const page = doc.loadPage(pageNum1 - 1);

  // 전체 페이지를 PNG 로 렌더 (mupdf 는 crop 직접 지원 X — tesseract rectangle 로 영역 지정).
  const matrix = mupdf.Matrix.scale(SCALE, SCALE);
  const pixmap = page.toPixmap(
    matrix,
    mupdf.ColorSpace.DeviceRGB,
    false,
    false,
  );
  const pngBuffer = Buffer.from(pixmap.asPNG());
  const pngWidth = pixmap.getWidth();
  const pngHeight = pixmap.getHeight();

  if (pageNum1 === 67 || pageNum1 === 1) {
    writeFileSync(
      resolve(OUT_DIR, `page-${String(pageNum1).padStart(4, "0")}.png`),
      pngBuffer,
    );
  }

  const tRender = Date.now() - t0;

  // 1) 전체 페이지 OCR — 베이스라인.
  const ocrT0 = Date.now();
  const fullResult = await worker.recognize(pngBuffer);
  const tOcr = Date.now() - ocrT0;
  const text = fullResult.data.text;
  console.log(
    `[page ${pageNum1}] full OCR text first 300 chars:\n  "${text.slice(0, 300).replace(/\n/g, " | ")}"`,
  );

  // 2) rectangle 옵션 단독 테스트
  const rectT0 = Date.now();
  const rectResult = await worker.recognize(pngBuffer, {
    rectangle: {
      left: 0,
      top: 0,
      width: Math.floor(pngWidth * 0.6),
      height: Math.floor(pngHeight * 0.15),
    },
  });
  const tRect = Date.now() - rectT0;
  console.log(
    `[page ${pageNum1}] rect OCR (${Math.floor(pngWidth * 0.6)}x${Math.floor(pngHeight * 0.15)}) in ${tRect}ms: "${rectResult.data.text.slice(0, 200).replace(/\n/g, " | ")}"`,
  );

  console.log(
    `[page ${pageNum1}] render=${tRender}ms full ocr=${tOcr}ms`,
  );

  pixmap.destroy();
  page.destroy();
}

await worker.terminate();
doc.destroy();
console.log(`\n[done] sample PNGs saved to ${OUT_DIR}`);
