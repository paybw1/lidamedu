// 2차 기출 강사별 해설 PDF → 텍스트 추출 (feat-2-034 Stage 1).
// source/2차 기출 강사별 해설/{회차}회/*.pdf → tmp/instructor-explanations/{회차}/{원본명}.txt
// + manifest.json (회차·과목 판별, 글자수, 스캔 의심 플래그)
//
//   node scripts/jagwa/extract-instructor-pdfs.mjs

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import * as mupdf from "mupdf";

const SRC = "source/2차 기출 강사별 해설";
const OUT = "tmp/instructor-explanations";
// 회차 = 연도 - 1963 (48회=2011 … 62회=2025)
const ROUND_TO_YEAR = (round) => round + 1963;

// 파일명 → 과목 추정. 못 찾으면 본문 텍스트에서 재시도.
const SUBJECT_PATTERNS = [
  ["patent", /특허/],
  ["trademark", /상표/],
  ["design", /디자인|디보/],
  ["civil-procedure", /민소|민사소송/],
];
// 파일명만으로 과목이 안 나오는 강사 이름 힌트 (59회 파일명에서 확인된 소속 과목).
const INSTRUCTOR_HINTS = [
  ["trademark", /이슬기/],
  ["patent", /남솔잎/],
];

function guessSubject(name, text) {
  for (const [code, re] of SUBJECT_PATTERNS) if (re.test(name)) return code;
  for (const [code, re] of INSTRUCTOR_HINTS) if (re.test(name)) return code;
  // 본문 첫 3000자에서 과목명 등장 빈도로 판별.
  const head = text.slice(0, 3000);
  let best = null;
  let bestCount = 0;
  for (const [code, re] of SUBJECT_PATTERNS) {
    const count = (head.match(new RegExp(re.source, "g")) ?? []).length;
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return bestCount >= 2 ? best : null;
}

function extractPdfText(path) {
  const doc = mupdf.Document.openDocument(readFileSync(path), "application/pdf");
  const pages = doc.countPages();
  let text = "";
  for (let i = 0; i < pages; i++) {
    const page = doc.loadPage(i);
    text += page.toStructuredText().asText() + "\n";
  }
  return { text, pages };
}

const manifest = [];
for (const dirent of readdirSync(SRC, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const round = Number(dirent.name.replace(/회$/, ""));
  if (Number.isNaN(round)) continue;
  const outDir = join(OUT, dirent.name);
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(join(SRC, dirent.name))) {
    const srcPath = join(SRC, dirent.name, file);
    const entry = {
      round,
      year: ROUND_TO_YEAR(round),
      file,
      subject: null,
      pages: 0,
      chars: 0,
      suspectScan: false,
      error: null,
    };
    if (!/\.pdf$/i.test(file)) {
      entry.error = "not-pdf(hwp 등 — 별도 처리)";
      manifest.push(entry);
      continue;
    }
    try {
      const { text, pages } = extractPdfText(srcPath);
      const cleaned = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
      entry.pages = pages;
      entry.chars = cleaned.length;
      // 페이지당 200자 미만이면 이미지 스캔 의심.
      entry.suspectScan = pages > 0 && cleaned.length / pages < 200;
      entry.subject = guessSubject(file, cleaned);
      writeFileSync(join(outDir, basename(file, ".pdf") + ".txt"), cleaned, "utf8");
    } catch (err) {
      entry.error = String(err?.message ?? err);
    }
    manifest.push(entry);
  }
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

// 요약 출력
const bad = manifest.filter((m) => m.error || m.suspectScan || !m.subject);
console.log(`추출 ${manifest.length}건 (문제 ${bad.length}건)`);
console.log("\n회차|과목별 파일 수:");
const agg = new Map();
for (const m of manifest) {
  if (m.error || m.suspectScan) continue;
  const k = `${m.round}|${m.subject ?? "?"}`;
  agg.set(k, (agg.get(k) ?? 0) + 1);
}
for (const [k, v] of [...agg].sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true })))
  console.log(" ", k, v);
console.log("\n요주의(오류/스캔의심/과목불명):");
for (const m of bad)
  console.log(
    ` ${m.round}회 ${m.file} — ${m.error ?? (m.suspectScan ? `스캔의심(${m.pages}p/${m.chars}자)` : "과목불명")}`,
  );
