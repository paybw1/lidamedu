// 빈칸 학습 좌표 검사 — 적재본에 박힌 좌표가 실제 표와 맞는지 노드에서 확인한다.
//
//   node scripts/digest/check-blanks.mjs
//
// ★화면에서 눈으로 확인하지 않는다. 이 화면은 브라우저에서 재는 방식으로 세 번 연속
//   실패했다(2026-09-10) — 좌표는 적재 때 박고, 여기서 검사한다.
import { readFileSync } from "node:fs";

import { convert } from "./convert.mjs";

/** 화면 = 쪽(+덩이). import-digests.mjs 의 목록과 같은 뜻이다. */
const SCREENS = [
  { page: 2 }, { page: 3 },
  { page: 4 }, { page: 5 }, { page: 6 }, { page: 7 }, { page: 8 },
  { page: 9, part: 0 }, { page: 9, part: 1 },
  { page: 10 },
  { page: 11, part: 0 }, { page: 11, part: 1 },
  { page: 12 }, { page: 13 },
];

const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const num = (tag, name) => {
  const v = attr(tag, name);
  return v === undefined ? undefined : Number(v);
};
const text = (html) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** 적재본에서 칸을 뽑는다 — 여는 태그와 속살을 함께. */
function cellsOf(html) {
  const out = [];
  const re = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(html))) out.push({ tag: m[1], attrs: m[2], body: m[3] });
  return out;
}

let bad = 0;
const fail = (msg) => { bad += 1; console.log(`  ✗ ${msg}`); };

console.log("화면            내용칸  빈칸가능  목차(행/열/전체)  칸겹침");
for (const s of SCREENS) {
  const key = `${s.page}p${s.part === undefined ? "" : `-${s.part}`}`;
  const html = readFileSync(`scripts/digest/pages/digest-${s.page}p.html`, "utf8");
  const { bodyHtml } = convert(html, s.page, { part: s.part });
  const cells = cellsOf(bodyHtml);

  const tds = cells.filter((c) => c.tag === "td");
  const stampedTd = tds.filter((c) => num(c.attrs, "data-dg-r") !== undefined);
  const heads = cells.filter((c) => attr(c.attrs, "data-dg-blank"));
  const kinds = { row: 0, col: 0, all: 0 };
  for (const h of heads) kinds[attr(h.attrs, "data-dg-blank")] += 1;

  // ① 글자 있는 내용칸은 **빠짐없이** 좌표를 가져야 한다.
  for (const c of tds) {
    const has = num(c.attrs, "data-dg-r") !== undefined;
    if (text(c.body) && !has) fail(`${key} 글자가 있는데 좌표가 없다: ${text(c.body).slice(0, 20)}`);
    if (!text(c.body) && has) fail(`${key} 빈 칸에 좌표가 붙었다`);
  }

  // ② 좌표가 겹치면 한 자리를 둘이 차지한 것 — 격자 계산이 틀렸다는 뜻이다.
  const seen = new Map();
  let overlap = 0;
  for (const c of cells) {
    const r = num(c.attrs, "data-dg-r");
    if (r === undefined) continue;
    const cc = num(c.attrs, "data-dg-c");
    for (let i = r; i < r + num(c.attrs, "data-dg-rs"); i += 1) {
      for (let j = cc; j < cc + num(c.attrs, "data-dg-cs"); j += 1) {
        const k = `${i}:${j}`;
        if (seen.has(k)) { overlap += 1; fail(`${key} 자리 겹침 ${k}: ${seen.get(k)} ↔ ${text(c.body).slice(0, 14)}`); }
        seen.set(k, text(c.body).slice(0, 14));
      }
    }
  }

  // ③ 목차칸의 범위는 뒤집히면 안 된다.
  for (const h of heads) {
    const from = num(h.attrs, "data-dg-from");
    const to = num(h.attrs, "data-dg-to");
    if (attr(h.attrs, "data-dg-blank") === "all") continue;
    if (!(Number.isInteger(from) && Number.isInteger(to) && from <= to)) {
      fail(`${key} 범위가 뒤집혔다: ${text(h.body).slice(0, 12)} ${from}~${to}`);
    }
  }

  console.log(
    `${key.padEnd(14)} ${String(tds.length).padStart(5)} ${String(stampedTd.length).padStart(8)}` +
      `      ${String(kinds.row).padStart(3)}/${String(kinds.col).padStart(2)}/${kinds.all}` +
      `        ${overlap === 0 ? "없음" : `★${overlap}`}`,
  );
}

// ── 4p 알려진 자리로 셈이 맞는지 본다(원장이 예로 든 세 가지).
console.log("\n[4p 특허요건 — 원장이 예로 든 세 경우]");
{
  const { bodyHtml } = convert(readFileSync("scripts/digest/pages/digest-4p.html", "utf8"), 4);
  const cells = cellsOf(bodyHtml);
  const tds = cells
    .filter((c) => c.tag === "td" && num(c.attrs, "data-dg-r") !== undefined)
    .map((c) => ({
      r: num(c.attrs, "data-dg-r"), c: num(c.attrs, "data-dg-c"),
      rs: num(c.attrs, "data-dg-rs"), cs: num(c.attrs, "data-dg-cs"),
      t: text(c.body),
    }));
  const head = (label) =>
    cells.find((c) => attr(c.attrs, "data-dg-blank") && text(c.body).replace(/\s/g, "").startsWith(label));

  const hitRow = (h) => tds.filter((t) => t.r <= num(h.attrs, "data-dg-to") && t.r + t.rs - 1 >= num(h.attrs, "data-dg-from"));
  const hitCol = (h) => tds.filter((t) => t.c <= num(h.attrs, "data-dg-to") && t.c + t.cs - 1 >= num(h.attrs, "data-dg-from"));

  const show = (label, kind, want) => {
    const h = head(label);
    if (!h) return fail(`4p 목차칸을 찾지 못했다: ${label}`);
    const got = attr(h.attrs, "data-dg-blank");
    if (got !== kind) return fail(`4p ${label} 은 ${kind} 이어야 하는데 ${got}`);
    const n = kind === "all" ? tds.length : kind === "row" ? hitRow(h).length : hitCol(h).length;
    const ok = want === undefined || n === want;
    if (!ok) fail(`4p ${label} 빈칸 수 ${n} ≠ 기대 ${want}`);
    console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(6)} ${kind.padEnd(4)} → 빈칸 ${n}칸`);
  };
  show("특허요건", "all");
  show("의의", "row", 10);
  show("진보성", "col");
  show("판단", "row");
}

console.log(bad === 0 ? "\n어긋난 곳 없음" : `\n★어긋난 곳 ${bad}건`);
process.exit(bad === 0 ? 0 : 1);
