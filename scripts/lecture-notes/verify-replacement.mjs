// 읽기전용 검증(①) — 통합본 PDF 폰트 정상본 "파일 교체" 전 재검증.
//   V1 페이지수==603 · Producer(내보낸 도구) · V2 표본 페이지에서 해당 조문 텍스트 추출 + 한글 정상.
// 페이지 대응(슬라이드→페이지)이 기존과 동일한지 확인하는 게 목적. 시각 폰트는 교체 후 육안.
// 사용: node scripts/lecture-notes/verify-replacement.mjs <pdf...>
import { readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STD_FONTS =
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "node_modules",
    "pdfjs-dist",
    "standard_fonts",
  ) + "/";

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

// lecture_pdf_locations(운영 DB)에서 확인한 표본 (1-based page → 그 페이지에 있어야 할 조문)
const SAMPLES = [
  { page: 1, expect: null },
  { page: 300, expect: "제83조" },
  { page: 445, expect: "제148조" },
  { page: 446, expect: "제139조" },
  { page: 448, expect: "제139조" },
  { page: 495, expect: "제136조" },
  { page: 583, expect: "제204조" },
  { page: 603, expect: null },
];

async function pageText(pdf, n) {
  const page = await pdf.getPage(n);
  const tc = await page.getTextContent();
  const s = tc.items.map((it) => ("str" in it ? it.str : "")).join("");
  page.cleanup?.();
  return s;
}

for (const path of process.argv.slice(2)) {
  console.log(`\n######## ${path} ########`);
  let buf;
  try {
    buf = readFileSync(path);
  } catch (e) {
    console.log(`  [열기 실패] ${e.message}`);
    continue;
  }
  console.log(
    `  size: ${(buf.length / 1048576).toFixed(2)} MB | mtime: ${statSync(path).mtime.toISOString()}`,
  );
  let pdf;
  try {
    pdf = await getDocument({
      data: new Uint8Array(buf),
      standardFontDataUrl: STD_FONTS,
      disableFontFace: true,
      isEvalSupported: false,
      verbosity: 0,
    }).promise;
  } catch (e) {
    console.log(`  [PDF 로드 실패] ${e.message}`);
    continue;
  }
  const v1 = pdf.numPages === 603;
  console.log(`  pages: ${pdf.numPages}  ${v1 ? "✅ (==603)" : "❌ (≠603 → 단순교체 불가)"}`);
  try {
    const meta = await pdf.getMetadata();
    console.log(
      `  Producer: ${meta.info?.Producer ?? "?"}  | Creator: ${meta.info?.Creator ?? "?"}`,
    );
  } catch (e) {
    console.log(`  meta: ${e.message}`);
  }
  let hit = 0;
  let need = 0;
  for (const s of SAMPLES) {
    if (s.page > pdf.numPages) {
      console.log(`  p${s.page}: (범위 초과)`);
      continue;
    }
    const txt = await pageText(pdf, s.page);
    const norm = txt.replace(/\s+/g, "");
    const snip = txt.replace(/\s+/g, " ").trim().slice(0, 90);
    if (s.expect) {
      need += 1;
      const ok = norm.includes(s.expect);
      if (ok) hit += 1;
      console.log(`  p${s.page} ${ok ? "✅" : "❌"} ${s.expect} | "${snip}"`);
    } else {
      console.log(`  p${s.page} (sanity) | "${snip}"`);
    }
  }
  console.log(`  V2 표본 일치: ${hit}/${need}  → ${v1 && hit === need ? "PASS ✅" : "확인필요/FAIL ❌"}`);
  await pdf.destroy();
}
console.log("\n[done]");
