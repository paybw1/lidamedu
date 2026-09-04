// 인쇄된 책(PDF)과 개정중 원고(HWPX)를 대조해 **추록·정오표 후보**를 뽑는다.
//
//   node scripts/errata/compare-book-editions.mjs                     # 리담특허법 25판 ↔ 개정중
//   node scripts/errata/compare-book-editions.mjs --pdf a.pdf --hwpx b.hwpx --out tmp/diff
//   node scripts/errata/compare-book-editions.mjs --fresh              # PDF 추출 캐시 무시
//   node scripts/errata/compare-book-editions.mjs --min-gap 60 --sim 0.5
//
// 내는 것 — `--out` 아래 세 벌(기본 `tmp/book-diff/<책이름>/`)
//   changes.csv   쪽·구분·분류·구판 원문·신판 원문 (엑셀용, BOM 포함)
//   changes.html  같은 내용을 바뀐 부분 강조해서 보여 주는 검토용 화면
//   changes.json  다음 단계(검수 화면)가 읽을 원자료
//
// ★기계는 **후보**까지만 낸다. 이게 정오표(오류 정정)인지 추록(개정 반영)인지 다음 판에서만
//   반영할 서술 다듬기인지는 사람이 정한다 — 특히 개정중 원고는 아직 확정 전이다.
// ★못 잡는 것: 그림·도해 이미지 교체, 서식만 바뀐 것(밑줄·굵게), 표의 행·열 재배치.
//   도해 안 글은 판마다 순서가 뒤바뀌어 대조 정확도가 낮다 — 표·도해 쪽은 눈으로 확인할 것.
//
// 규칙(추출·정렬)은 전부 `lib/book-diff.mjs` 에 있다. 여기는 분류·짝짓기·출력만 한다.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import {
  BODY_MIN_HEIGHT,
  MIN_GAP_LEN,
  alignBucket,
  buildStream,
  extractHwpx,
  extractPdf,
  findBackMatter,
  gapsOf,
  normalize,
  similarity,
  trimCommon,
} from "./lib/book-diff.mjs";

const ROOT = process.cwd();
const DEFAULT_DIR = "source/특허법/리담특허법";
const DEFAULT_PDF = `${DEFAULT_DIR}/리담특허법[제25판].pdf`;
const DEFAULT_HWPX = `${DEFAULT_DIR}/리담특허법[제25판]_개정중.hwpx`;

/** 이 정도 닮았으면 삭제+추가가 아니라 **한 군데를 고친 것**으로 본다. */
const PAIR_SIMILARITY = 0.35;
/** 짝을 찾을 때 허용하는 쪽 차이 — 고쳐 쓰면서 줄이 밀린다. */
const PAIR_PAGE_SLACK = 2;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const pdfPath = resolve(ROOT, opt("pdf", DEFAULT_PDF));
const hwpxPath = resolve(ROOT, opt("hwpx", DEFAULT_HWPX));
const bookName = basename(pdfPath).replace(/\.pdf$/i, "");
const outDir = resolve(ROOT, opt("out", `tmp/book-diff/${bookName}`));
const minGap = Number(opt("min-gap", MIN_GAP_LEN));
const minSim = Number(opt("sim", PAIR_SIMILARITY));

for (const [label, p] of [["PDF", pdfPath], ["HWPX", hwpxPath]]) {
  if (!existsSync(p)) {
    console.error(`[중단] ${label} 파일이 없다: ${p}`);
    process.exit(1);
  }
}
mkdirSync(`${outDir}/.cache`, { recursive: true });

// ── 1. 두 판 읽기 ──────────────────────────────────────────────────────
// PDF 추출은 1,200쪽을 매번 다시 읽는다 — 보통은 원고만 바뀌므로 캐시를 둔다.
// ★캐시는 **있는지만** 본다. PDF 를 같은 이름으로 갈아끼웠으면(재쇄 교체) `--fresh` 를 줘야 한다.
//   안 그러면 쪽 번호가 옛 인쇄본에서 나와 발행한 정오표가 조용히 틀어진다.
const cachePath = `${outDir}/.cache/${bookName}.pages.json`;
let pages;
if (!flag("fresh") && existsSync(cachePath)) {
  pages = JSON.parse(readFileSync(cachePath, "utf8"));
  console.log(`구판 PDF ${pages.length}쪽 (캐시)`);
} else {
  process.stdout.write("구판 PDF 읽는 중 ");
  pages = await extractPdf(pdfPath, {
    root: ROOT,
    onPage: (p, total) => {
      if (p % 200 === 0 || p === total) process.stdout.write(`${p}/${total} `);
    },
  });
  writeFileSync(cachePath, JSON.stringify(pages));
  console.log("완료");
}

const items = extractHwpx(hwpxPath);
const back = findBackMatter(pages, items);
const contentPages = pages.filter((p) => p.page < back.pdfPage);
const contentItems = items.filter((i) => i.seq < back.hwpxSeq);
console.log(
  `신판 원고 ${items.length}조각 · 본문 범위 = PDF 1~${back.pdfPage - 1}쪽 / 원고 ${contentItems.length}조각` +
    (back.pdfPage === Infinity ? " (색인 못 찾음 — 전체를 본문으로 본다)" : " (색인부터는 뺀다)"),
);

// ── 2. 맞춰 보기 ──────────────────────────────────────────────────────
// 본문(큰 글씨)과 각주·표(작은 글씨)는 **서로 다른 흐름**이다. 한 줄로 이으면 순서가 깨진다.
const bodyStream = buildStream(contentPages, (l) => l.h >= BODY_MIN_HEIGHT);
const smallStream = buildStream(contentPages, (l) => l.h < BODY_MIN_HEIGHT);
const pick = (kind) => contentItems.filter((i) => i.kind === kind);
const shapeTexts = pick("shape").map((i) => i.text);

const bodyCover = [];
const smallCover = []; // ★각주와 표 칸은 한 흐름을 나눠 쓴다 — 덮개도 같이 쌓아야 한다
const bodyRes = alignBucket(pick("body"), bodyStream, bodyCover, shapeTexts);
const noteRes = alignBucket(pick("note"), smallStream, smallCover);
const tableRes = alignBucket(pick("table"), smallStream, smallCover, shapeTexts);

const bodyGaps = gapsOf(bodyCover, bodyStream, minGap);
const smallGaps = gapsOf(smallCover, smallStream, minGap);

const rate = (r) => `${r.total ? (((r.anchored + r.shortHit) / r.total) * 100).toFixed(1) : "0"}%`;
console.log(
  [
    "",
    `[본문]  신판 ${bodyRes.total}조각 · 구판에서 같은 순서로 찾음 ${rate(bodyRes)}`,
    `[각주]  신판 ${noteRes.total}조각 · ${rate(noteRes)}`,
    `[표 칸] 신판 ${tableRes.total}조각 · ${rate(tableRes)}`,
  ].join("\n"),
);

// ── 3. 분류·짝짓기 ────────────────────────────────────────────────────
const BUCKET = { body: "본문", note: "각주", table: "표" };

/**
 * 삭제 후보와 추가 후보를 닮은 정도로 묶어 "수정" 한 건으로 만든다.
 * ★버킷을 가로질러 짝을 찾는다 — 각주에 있던 서술을 본문으로 올린 곳이 있다(p.92 실사례).
 *   흐름 안에서만 짝지으면 같은 한 번의 손질이 삭제 1건 + 추가 1건으로 두 번 잡힌다.
 */
function pairUp(gaps, added) {
  const rows = [];
  const usedAdded = new Set();
  for (const gap of gaps) {
    let best = null;
    added.forEach((a, i) => {
      if (usedAdded.has(i)) return;
      if (a.page != null && Math.abs(a.page - gap.page) > PAIR_PAGE_SLACK) return;
      const s = similarity(gap.normText, a.text);
      if (s >= minSim && (!best || s > best.s)) best = { i, a, s };
    });
    if (!best) {
      rows.push({ page: gap.page, bucket: gap.bucket, type: "삭제", similarity: 0, before: gap.text, after: "" });
      continue;
    }
    usedAdded.add(best.i);
    const to = BUCKET[best.a.kind];
    rows.push({
      page: gap.page,
      bucket: gap.bucket.includes(to) ? to : `${gap.bucket}→${to}`,
      type: "수정",
      similarity: Number(best.s.toFixed(2)),
      before: gap.text,
      after: best.a.text,
    });
  }
  added.forEach((a, i) => {
    if (usedAdded.has(i)) return;
    rows.push({ page: a.page ?? 0, bucket: BUCKET[a.kind], type: "추가", similarity: 0, before: "", after: a.text });
  });
  return rows;
}

const changes = pairUp(
  [
    ...bodyGaps.map((g) => ({ ...g, bucket: "본문" })),
    ...smallGaps.map((g) => ({ ...g, bucket: "각주·표" })),
  ].sort((a, b) => a.page - b.page),
  [...bodyRes.added, ...noteRes.added, ...tableRes.added],
).sort((a, b) => a.page - b.page || a.bucket.localeCompare(b.bucket) || a.type.localeCompare(b.type));

const count = (t) => changes.filter((c) => c.type === t).length;
const touchedPages = new Set(changes.map((c) => c.page));
console.log(
  `\n변경 후보 ${changes.length}건 — 수정 ${count("수정")} · 추가 ${count("추가")} · 삭제 ${count("삭제")}` +
    ` / 손댄 쪽 ${touchedPages.size}쪽`,
);

// ── 4. 내보내기 ───────────────────────────────────────────────────────
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = [
  ["쪽(구판)", "구분", "분류", "닮은정도", "구판 원문", "신판 원문"].map(csvCell).join(","),
  ...changes.map((c) =>
    [c.page || "", c.bucket, c.type, c.similarity || "", c.before, c.after].map(csvCell).join(","),
  ),
].join("\r\n");
writeFileSync(`${outDir}/changes.csv`, `﻿${csv}`, "utf8");

const esc = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

/** 수정 행은 앞뒤 같은 부분을 죽이고 달라진 가운데만 칠한다. */
function diffCells(row) {
  if (row.type !== "수정" || !row.before || !row.after) return [esc(row.before), esc(row.after)];
  const { head, beforeMid, afterMid, tail } = trimCommon(row.before, row.after);
  if (normalize(head).length < 4 && normalize(tail).length < 4) return [esc(row.before), esc(row.after)];
  const wrap = (mid) => `${esc(head)}<mark>${esc(mid)}</mark>${esc(tail)}`;
  return [wrap(beforeMid), wrap(afterMid)];
}

const TYPE_CLASS = { 추가: "add", 삭제: "del", 수정: "mod" };
// ★charset 을 빼면 브라우저가 로컬 파일을 UTF-8 로 안 읽어 한글이 깨진다.
const html = `<meta charset="utf-8">
<title>${esc(bookName)} — 판 대조</title>
<style>
  :root { color-scheme: light dark; --line: #d4d4d8; --muted: #71717a; --add: #dcfce7; --del: #fee2e2; --mod: #fef3c7; }
  @media (prefers-color-scheme: dark) {
    :root { --line: #3f3f46; --muted: #a1a1aa; --add: #14532d; --del: #7f1d1d; --mod: #713f12; }
  }
  body { font: 14px/1.7 "Malgun Gothic", system-ui, sans-serif; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: var(--muted); margin-bottom: 16px; }
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid var(--line); padding: 8px 10px; vertical-align: top; text-align: left; }
  th { position: sticky; top: 0; background: Canvas; }
  td.page { font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.text { max-width: 46ch; }
  mark { background: var(--mod); }
  tr.add td.type { background: var(--add); }
  tr.del td.type { background: var(--del); }
  tr.mod td.type { background: var(--mod); }
</style>
<h1>${esc(bookName)} ↔ 개정중 원고</h1>
<p class="meta">변경 후보 ${changes.length}건 (수정 ${count("수정")} · 추가 ${count("추가")} · 삭제 ${count("삭제")})
 · 손댄 쪽 ${touchedPages.size}쪽 · 쪽 번호는 <b>인쇄된 ${esc(bookName)} 기준</b><br>
 그림·도해 교체와 서식(밑줄·굵게) 변경은 이 대조로 잡히지 않는다. 표·도해 쪽은 눈으로 확인할 것.</p>
<div class="wrap"><table>
<tr><th>쪽</th><th>구분</th><th>분류</th><th>구판(인쇄본)</th><th>신판(개정중)</th></tr>
${changes
  .map((c) => {
    const [before, after] = diffCells(c);
    return `<tr class="${TYPE_CLASS[c.type]}"><td class="page">${c.page || "-"}</td><td>${esc(c.bucket)}</td>` +
      `<td class="type">${c.type}</td><td class="text">${before}</td><td class="text">${after}</td></tr>`;
  })
  .join("\n")}
</table></div>`;
writeFileSync(`${outDir}/changes.html`, html, "utf8");

writeFileSync(
  `${outDir}/changes.json`,
  JSON.stringify(
    {
      book: bookName,
      pdf: pdfPath,
      hwpx: hwpxPath,
      contentPages: back.pdfPage === Infinity ? pages.length : back.pdfPage - 1,
      match: {
        body: rate(bodyRes),
        note: rate(noteRes),
        table: rate(tableRes),
      },
      changes,
    },
    null,
    1,
  ),
  "utf8",
);

console.log(`\n→ ${outDir}/changes.csv`);
console.log(`→ ${outDir}/changes.html  (브라우저로 열어 검토)`);
console.log(`→ ${outDir}/changes.json`);
