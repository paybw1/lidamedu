// 리담상표법(제20판) 통독·검색 도구 — 모범답안 작성 전 '절 단위 통독'용 (feat-2-039, 읽기 전용).
// 코퍼스 = tmp/book-corpus/trademark-chunks.json (build-book-corpus.mjs 산출, 청크 순서 = 교재 순서).
// 검색으로 나온 조각만 보고 답안을 쓰지 말고, 해당 절을 청크 번호 순서대로 읽을 것(CLAUDE.md Non-negotiable 11).
//
//   node scripts/jagwa/tm-book-read.mjs --toc                 # heading 목차(청크 범위)
//   node scripts/jagwa/tm-book-read.mjs --find 불사용         # 키워드가 있는 청크 목록(요약)
//   node scripts/jagwa/tm-book-read.mjs 410 418               # 구간 통독
//   node scripts/jagwa/tm-book-read.mjs --heading "취소심판"   # heading 에 키워드가 든 청크 전부
import { readFileSync } from "node:fs";

const CORPUS = "tmp/book-corpus/trademark-chunks.json";
const SOURCE = "리담상표법(제20판)";
const chunks = JSON.parse(readFileSync(CORPUS, "utf8")).filter(
  (c) => c.source === SOURCE,
);
const num = (c) => Number(c.id.split("#")[1]);
const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : null;
};

if (argv.includes("--toc")) {
  let last = null;
  let start = 0;
  const rows = [];
  for (const c of chunks) {
    if (c.heading !== last) {
      if (last !== null) rows.push([start, num(c) - 1, last]);
      last = c.heading;
      start = num(c);
    }
  }
  rows.push([start, num(chunks[chunks.length - 1]), last]);
  for (const [a, b, h] of rows)
    console.log(`${String(a).padStart(4)}–${String(b).padEnd(4)} ${h}`);
  process.exit(0);
}

const find = opt("--find");
if (find) {
  const kws = find
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const c of chunks) {
    const hit = kws.filter((k) => c.text.includes(k));
    if (hit.length !== kws.length) continue;
    const i = c.text.indexOf(kws[0]);
    const snip = c.text
      .slice(Math.max(0, i - 60), i + 120)
      .replace(/\s+/g, " ");
    console.log(`#${num(c)} [${c.heading}] …${snip}…`);
  }
  process.exit(0);
}

const heading = opt("--heading");
if (heading) {
  for (const c of chunks) {
    if (!c.heading.includes(heading)) continue;
    console.log(`\n===== #${num(c)} [${c.heading}] =====\n${c.text}`);
  }
  process.exit(0);
}

const from = Number(argv[0]);
const to = Number(argv[1] ?? argv[0]);
if (!Number.isFinite(from)) {
  console.error(
    "사용: --toc | --find <kw[,kw]> | --heading <kw> | <from> [to]",
  );
  process.exit(1);
}
for (const c of chunks) {
  const n = num(c);
  if (n < from || n > to) continue;
  console.log(`\n===== #${n} [${c.heading}] =====\n${c.text}`);
}
