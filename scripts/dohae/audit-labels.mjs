// 라벨 줄바꿈 전수 점검 — 좁은 칸에서 **뜻 경계가 아닌 자리**로 잘리는 라벨을 찾는다.
//   node tmp/dohae-fix/audit-labels.mjs [표폭px]
// 화면 폭 기준: 팝업 lg(1024) − 학습도구 패널(300) − 여백 ≈ 676, 그보다 좁은 md 는 ≈ 548.
import { readFileSync } from "node:fs";
import { labelSegments } from "../../app/core/lib/korean-wrap.ts";

const TABLE_W = Number(process.argv[2] ?? 548);
const FS = 13.5; // 표 글자 크기(--study-fs = 1)
const NARROW_PCT = 12;
const MIN_PCT = 4;

// 글자 폭 근사 — 한글·한자는 전각, 그 밖은 반각으로 본다.
const width = (s) =>
  [...s].reduce((a, ch) => a + (/[가-힣ㄱ-ㅎ一-龥·ㆍ]/.test(ch) ? FS : FS * 0.52), 0);

function gridStartCols(cells) {
  const pending = [];
  return cells.map((row) => {
    let cur = 0;
    const starts = row.map((c) => {
      while ((pending[cur] ?? 0) > 0) cur++;
      const start = cur;
      for (let k = start; k < start + c.colSpan; k++) pending[k] = c.rowSpan;
      cur = start + c.colSpan;
      return start;
    });
    for (let k = 0; k < pending.length; k++) if (pending[k] > 0) pending[k]--;
    return starts;
  });
}
function columnPercents(cells, sc) {
  let colCount = 0;
  cells.forEach((r, ri) => r.forEach((c, ci) => { colCount = Math.max(colCount, sc[ri][ci] + c.colSpan); }));
  if (colCount < 2) return null;
  const w = new Array(colCount).fill(0);
  cells.forEach((r, ri) => r.forEach((c, ci) => { if (c.colSpan === 1 && (c.width ?? 0) > 0) w[sc[ri][ci]] = Math.max(w[sc[ri][ci]], c.width); }));
  cells.forEach((r, ri) => r.forEach((c, ci) => {
    if (c.colSpan <= 1 || !(c.width ?? 0)) return;
    const start = sc[ri][ci];
    const unknown = [];
    let known = 0;
    for (let k = start; k < Math.min(colCount, start + c.colSpan); k++) { if (w[k] > 0) known += w[k]; else unknown.push(k); }
    if (unknown.length > 0 && c.width > known) for (const k of unknown) w[k] = (c.width - known) / unknown.length;
  }));
  if (w.some((x) => x <= 0)) return null;
  const total = w.reduce((a, b) => a + b, 0);
  const pct = w.map((x) => (x / total) * 100);
  const short = pct.filter((x) => x < MIN_PCT);
  if (short.length > 0 && short.length < pct.length) {
    const need = short.reduce((a, x) => a + (MIN_PCT - x), 0);
    const spare = pct.reduce((a, x) => a + (x >= MIN_PCT ? x - MIN_PCT : 0), 0);
    if (spare > need) for (let i = 0; i < pct.length; i++) pct[i] = pct[i] < MIN_PCT ? MIN_PCT : pct[i] - ((pct[i] - MIN_PCT) / spare) * need;
  }
  return pct;
}

const d = JSON.parse(readFileSync("source/_converted/dohae-patent.json", "utf8"));
const keyOf = (u) => (u.kind === "topic" ? `t${String(u.no).padStart(2, "0")}` : `r${u.refNo.replace(".", "-")}`);
let checked = 0;
const bad = [];
for (const u of d.units)
  u.blocks.forEach((b, bi) => {
    if (b.type !== "table") return;
    const sc = gridStartCols(b.cells);
    const pct = columnPercents(b.cells, sc);
    b.cells.forEach((row, ri) =>
      row.forEach((c, ci) => {
        // 렌더러가 LabelText 를 쓰는 조건과 동일
        if (!c.shade || c.diagram || c.tables?.length || c.boldRanges?.length) return;
        const p = pct
          ? (() => { let s = 0; for (let k = sc[ri][ci]; k < Math.min(pct.length, sc[ri][ci] + c.colSpan); k++) s += pct[k]; return s; })()
          : 100 / (b.cells[0]?.length || 1);
        const pad = p < NARROW_PCT ? 4 : 10;
        const inner = (p / 100) * TABLE_W - pad * 2 - 2;
        for (const line of String(c.text ?? "").split("\n")) {
          if (!line.trim()) continue;
          checked++;
          // 공백도 줄바꿈 기회다 — 조각을 다시 공백으로 쪼개 재 본다.
          const segs = labelSegments(line).flatMap((x) => x.split(" ").filter(Boolean));
          // 각 조각이 칸 안쪽 폭보다 넓으면 그 조각 안에서 임의로 잘린다.
          // 조각이 3자 이상인데 칸을 넘으면 = 더 나눌 자리가 있었을지 모르는 경우
          const over = segs.filter((s) => width(s) > inner && [...s].filter((ch)=>/[가-힣]/.test(ch)).length >= 3);
          if (over.length) bad.push({ k: keyOf(u), bi, ri, ci, p, inner, line, segs, over });
        }
      }),
    );
  });
console.log(`표 폭 ${TABLE_W}px 기준 · 라벨 줄 ${checked}개 검사`);
console.log(`뜻 경계가 아닌 자리에서 잘릴 수 있는 줄: ${bad.length}\n`);
const byLine = new Map();
for (const x of bad) {
  const k = x.line;
  if (!byLine.has(k)) byLine.set(k, { ...x, n: 0, units: new Set() });
  byLine.get(k).n++;
  byLine.get(k).units.add(x.k);
}
[...byLine.values()]
  .sort((a, b) => b.n - a.n)
  .slice(0, 40)
  .forEach((x) =>
    console.log(
      ` ${x.n}회 [${[...x.units].slice(0, 3).join(",")}] 칸 ${x.p.toFixed(1)}%(${Math.round(x.inner)}px) · "${x.line}" → ${x.segs.join("|")} · 넘침 ${x.over.map((s) => `"${s}"(${Math.round(width(s))}px)`).join(" ")}`,
    ),
  );
