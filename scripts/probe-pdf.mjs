// 강의노트 PDF — pdfjs-dist 로 텍스트 직접 추출이 가능한지 확인.
// 한글이 깨지면 (pdftotext 결과처럼) OCR fallback 필요.
// 깨지지 않으면 OCR 자체가 불필요.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PDF_PATH = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "source",
  "리담특허법 강의노트(제10판).pdf",
);

// pdfjs-dist 5.x — legacy mjs build (Node ESM).
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const buf = readFileSync(PDF_PATH);
console.log(`[info] PDF size: ${(buf.length / 1024 / 1024).toFixed(1)} MB`);

const loadingTask = getDocument({
  data: new Uint8Array(buf),
  // Node 환경: standard fonts 경로
  standardFontDataUrl: resolve(
    fileURLToPath(import.meta.url),
    "..",
    "..",
    "node_modules",
    "pdfjs-dist",
    "standard_fonts",
  ) + "/",
  disableFontFace: true,
  isEvalSupported: false,
  verbosity: 0,
});

const pdf = await loadingTask.promise;
console.log(`[info] pages: ${pdf.numPages}`);

// 샘플로 1, 10, 67, 100 페이지의 텍스트 추출.
const sampleIndices = [1, 10, 67, 100, 200].filter((n) => n <= pdf.numPages);

for (const idx of sampleIndices) {
  const page = await pdf.getPage(idx);
  const tc = await page.getTextContent();
  const items = tc.items.filter(
    (it) => "str" in it && typeof it.str === "string",
  );
  // 좌상단 영역 추정: 페이지 크기 가져오기
  const vp = page.getViewport({ scale: 1 });
  const topLeftItems = items.filter((it) => {
    if (!("transform" in it) || !Array.isArray(it.transform)) return false;
    const [, , , , x, y] = it.transform;
    // y는 PDF 좌표(아래에서 위) → 페이지 높이 - y 가 위에서부터 거리
    const fromTopPercent = (vp.height - y) / vp.height;
    const fromLeftPercent = x / vp.width;
    return fromTopPercent < 0.15 && fromLeftPercent < 0.5;
  });

  console.log(`\n========== page ${idx} ==========`);
  console.log(`viewport: ${vp.width.toFixed(0)} x ${vp.height.toFixed(0)}`);
  console.log(`items: total=${items.length}, topLeft=${topLeftItems.length}`);
  console.log(
    `[전체 본문] ${items
      .map((it) => it.str)
      .join("")
      .slice(0, 200)}`,
  );
  console.log(
    `[좌상단 텍스트] "${topLeftItems
      .map((it) => it.str)
      .join("")
      .slice(0, 120)}"`,
  );
}

await pdf.destroy();
console.log("\n[done]");
