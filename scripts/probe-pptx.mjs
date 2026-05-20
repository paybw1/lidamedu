// PPTX 슬라이드별 좌상단 텍스트 추출 시도.
// PDF OCR 대안 — pptx 가 텍스트 객체를 보존하면 OCR 자체 불필요.
// adm-zip 으로 zip 풀고 slide{N}.xml 의 <a:t> 노드 + <p:sp>/<a:xfrm>/<a:off> 좌표로 좌상단 텍스트 식별.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import AdmZip from "adm-zip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PPTX = resolve(
  __dirname,
  "..",
  "source",
  "1. 총칙 및 보칙_특허법 강의노트.pptx",
);

const zip = new AdmZip(PPTX);
const entries = zip.getEntries();
const slideEntries = entries
  .filter(
    (e) =>
      e.entryName.startsWith("ppt/slides/slide") &&
      e.entryName.endsWith(".xml"),
  )
  .sort((a, b) => {
    const an = parseInt(a.entryName.match(/slide(\d+)\.xml/)[1], 10);
    const bn = parseInt(b.entryName.match(/slide(\d+)\.xml/)[1], 10);
    return an - bn;
  });

console.log(`[info] PPTX: ${PPTX}`);
console.log(`[info] slides: ${slideEntries.length}`);

// 슬라이드 크기 (presentation.xml 의 <p:sldSz cx=".." cy=".."/>)
const presEntry = entries.find((e) => e.entryName === "ppt/presentation.xml");
let slideW = 9144000;
let slideH = 6858000;
if (presEntry) {
  const xml = presEntry.getData().toString("utf-8");
  const m = xml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
  if (m) {
    slideW = parseInt(m[1], 10);
    slideH = parseInt(m[2], 10);
  }
}
console.log(
  `[info] slide size: ${slideW} x ${slideH} EMU (${(slideW / 914400).toFixed(2)}" x ${(slideH / 914400).toFixed(2)}")`,
);

// 한 슬라이드 XML 에서 shape 들 추출 — 각 shape 의 좌상단 좌표 + 텍스트
function extractShapes(xml) {
  const shapes = [];
  // <p:sp>...</p:sp> 블록 단위 (간단 split)
  const spRegex = /<p:sp[^>]*>([\s\S]*?)<\/p:sp>/g;
  let m;
  while ((m = spRegex.exec(xml)) !== null) {
    const block = m[1];
    // 좌표 — <a:off x="N" y="N"/> 단일 occurrence (첫번째)
    const off = block.match(/<a:off\s+x="(\-?\d+)"\s+y="(\-?\d+)"\s*\/>/);
    if (!off) continue;
    const x = parseInt(off[1], 10);
    const y = parseInt(off[2], 10);
    // 텍스트 — <a:t>...</a:t> 모두 합침
    const texts = [];
    const tRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    let tm;
    while ((tm = tRegex.exec(block)) !== null) {
      const decoded = tm[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      texts.push(decoded);
    }
    if (texts.length === 0) continue;
    shapes.push({ x, y, text: texts.join("") });
  }
  return shapes;
}

// 전체 51 슬라이드 좌상단 텍스트 추출 + 패턴 매칭 시도.
const N = slideEntries.length;

// 패턴 매칭 정규식
const ARTICLE_RE = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/;
const CASE_RE = /(\d{2,4}[가-힣]{1,3}\d{1,8}(?:,\s*\d{2,4}[가-힣]{1,3}\d{1,8})*)/;

const rows = [];
for (let idx = 1; idx <= N; idx++) {
  const entry = slideEntries[idx - 1];
  const xml = entry.getData().toString("utf-8");
  const shapes = extractShapes(xml);

  // 좌상단 영역: x < 35%, y < 25%
  const topLeft = shapes
    .filter((s) => s.x < slideW * 0.35 && s.y < slideH * 0.25)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // 좌상단 텍스트 모두 합쳐서 패턴 검사 (페이지 번호 같은 짧은 숫자만 있는 것은 제외)
  const joined = topLeft
    .map((s) => s.text)
    .filter((t) => t.length > 1) // 한 글자 (페이지 번호) 제거
    .join(" ");

  const articleM = ARTICLE_RE.exec(joined);
  const caseM = CASE_RE.exec(joined);

  let kind = "-";
  let key = "";
  if (articleM) {
    kind = "조문";
    key = articleM[2]
      ? `특허법 제${articleM[1]}조의${articleM[2]}`
      : `특허법 제${articleM[1]}조`;
  } else if (caseM) {
    kind = "판례";
    key = caseM[1];
  } else if (joined.trim()) {
    kind = "기타";
    key = joined.slice(0, 40);
  }

  rows.push({ slide: idx, kind, key, joined: joined.slice(0, 80) });
}

console.log("\n========== 전체 슬라이드 좌상단 패턴 매칭 ==========");
const colW = { slide: 5, kind: 4, key: 30 };
console.log(
  `${"#".padStart(colW.slide)} ${"종류".padEnd(colW.kind)} ${"식별자".padEnd(colW.key)} 원본`,
);
for (const r of rows) {
  console.log(
    `${String(r.slide).padStart(colW.slide)} ${r.kind.padEnd(colW.kind)} ${(r.key || "-").padEnd(colW.key)} ${r.joined}`,
  );
}

// 통계
const stats = rows.reduce(
  (acc, r) => {
    acc[r.kind] = (acc[r.kind] || 0) + 1;
    return acc;
  },
  {},
);
console.log(`\n[stats] ${Object.entries(stats).map(([k, v]) => `${k}=${v}`).join(", ")}`);
