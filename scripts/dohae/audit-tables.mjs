// 도해 표 전수 검사 — 원본 서식이 제대로 옮겨졌는지, 표 구조가 깨지지 않았는지 훑는다.
// 렌더(dohae-popup.tsx)와 같은 계산을 복제해 화면에 나올 결과를 그대로 판정한다.
//
//   node scripts/dohae/audit-tables.mjs            # 요약 + 이상 항목
//   node scripts/dohae/audit-tables.mjs --all      # 이상 항목 전부 나열

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const book = JSON.parse(
  readFileSync(resolve(ROOT, "source/_converted/dohae-patent.json"), "utf8"),
);
const ALL = process.argv.includes("--all");
const len = (s) => s.replace(/\s/g, "").length;

/**
 * 렌더와 동일 — rowspan 을 물고 내려가며 각 칸의 실제 격자 열을 구한다.
 * rowWidths 는 **앞 행에서 내려온 칸까지 포함한** 그 행의 실제 열 수다
 * (자기 칸만 세면 rowspan 이 있는 표가 전부 '어긋남' 으로 잡힌다).
 */
function gridLayout(cells) {
  const pending = [];
  const starts = [];
  const rowWidths = [];
  for (const row of cells) {
    let cur = 0;
    starts.push(
      row.map((c) => {
        while ((pending[cur] ?? 0) > 0) cur++;
        const s = cur;
        for (let k = s; k < s + c.colSpan; k++) pending[k] = c.rowSpan;
        cur = s + c.colSpan;
        return s;
      }),
    );
    let last = -1;
    for (let k = 0; k < pending.length; k++) if (pending[k] > 0) last = k;
    rowWidths.push(last + 1);
    for (let k = 0; k < pending.length; k++) if (pending[k] > 0) pending[k]--;
  }
  return { starts, rowWidths };
}

/** 렌더와 동일 — 원본 칸 너비에서 열 비율. 못 구하면 null. */
function columnPercents(cells, starts) {
  let n = 0;
  cells.forEach((row, ri) =>
    row.forEach((c, ci) => (n = Math.max(n, starts[ri][ci] + c.colSpan))),
  );
  if (n < 2) return null;
  const w = new Array(n).fill(0);
  cells.forEach((row, ri) =>
    row.forEach((c, ci) => {
      if (c.colSpan === 1 && (c.width ?? 0) > 0)
        w[starts[ri][ci]] = Math.max(w[starts[ri][ci]], c.width);
    }),
  );
  cells.forEach((row, ri) =>
    row.forEach((c, ci) => {
      if (c.colSpan <= 1 || !(c.width ?? 0)) return;
      const s = starts[ri][ci];
      const unknown = [];
      let known = 0;
      for (let k = s; k < Math.min(n, s + c.colSpan); k++) {
        if (w[k] > 0) known += w[k];
        else unknown.push(k);
      }
      if (unknown.length > 0 && c.width > known)
        for (const k of unknown) w[k] = (c.width - known) / unknown.length;
    }),
  );
  if (w.some((x) => x <= 0)) return null;
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.round((x / total) * 1000) / 10);
}

const stat = {
  tables: 0,
  nested: 0,
  cells: 0,
  shade: 0,
  center: 0,
  bold: 0,
  widthOk: 0,
  widthSingle: 0,
};
const issues = { ragged: [], noWidth: [], shadeLong: [], plainAllShade: [] };

function audit(cells, label, depth) {
  stat.tables++;
  if (depth > 0) stat.nested++;
  const { starts, rowWidths } = gridLayout(cells);

  // ① 행마다 열 합계가 같은가 — 다르면 표가 어긋나 보인다(파싱 손상 신호).
  const maxW = Math.max(...rowWidths);
  if (rowWidths.some((w) => w !== maxW))
    issues.ragged.push(`${label} 열수 ${rowWidths.join(",")}`);

  // ② 열 비율 산출 가능 여부
  const pct = columnPercents(cells, starts);
  if (pct) stat.widthOk++;
  else if (maxW < 2) stat.widthSingle++;
  else issues.noWidth.push(`${label} 열${maxW}`);

  // ③ 서식 분포 + 이상 징후
  let shadeInTable = 0;
  cells.forEach((row) =>
    row.forEach((c) => {
      stat.cells++;
      if (c.shade) {
        stat.shade++;
        shadeInTable++;
        // 음영 칸이 아주 길면 라벨이 아니라 본문일 가능성 — 원본 확인 대상.
        // 한 칸짜리 표는 교재의 조문 원문 박스라 원래 음영이다(별도 렌더) — 제외.
        const isArticleBox = cells.length === 1 && cells[0].length === 1;
        if (!isArticleBox && len(c.text) > 120)
          issues.shadeLong.push(`${label} ${len(c.text)}자 "${c.text.slice(0, 40)}"`);
      }
      if (c.align === "center") stat.center++;
      if (c.bold) stat.bold++;
    }),
  );
  // ④ 전 칸이 음영 = 라벨/본문 구분이 사라진 표(원본이 그런 경우도 있으나 눈으로 볼 것)
  if (cells.length > 1 && shadeInTable === stat.cells) {
    /* 전체 누적과 비교하면 안 되므로 아래에서 별도 계산 */
  }
  const cellsInTable = cells.reduce((a, r) => a + r.length, 0);
  if (cellsInTable > 3 && shadeInTable === cellsInTable)
    issues.plainAllShade.push(`${label} 칸${cellsInTable} 전부 음영`);

  cells.forEach((row) =>
    row.forEach((c) => (c.tables ?? []).forEach((t) => audit(t, `${label}»중첩`, depth + 1))),
  );
}

for (const u of book.units) {
  const label = `${u.kind === "topic" ? `t${u.no}` : `참고 ${u.refNo}`} ${u.title.slice(0, 22)}`;
  for (const b of u.blocks) if (b.type === "table") audit(b.cells, label, 0);
}

console.log("── 도해 표 전수 검사 ──");
console.log(
  `표 ${stat.tables} (중첩 ${stat.nested}) · 칸 ${stat.cells}\n` +
    `열 비율: 산출 ${stat.widthOk} · 한 칸짜리(대상외) ${stat.widthSingle} · 실패 ${issues.noWidth.length}\n` +
    `원본 서식: 음영 ${stat.shade} · 가운데 ${stat.center} · 굵게 ${stat.bold}`,
);

const show = (name, list) => {
  console.log(`\n[${name}] ${list.length}건`);
  for (const x of ALL ? list : list.slice(0, 8)) console.log("  " + x);
  if (!ALL && list.length > 8) console.log(`  … 나머지 ${list.length - 8}건 (--all)`);
};
show("행마다 열 수가 다름(표 어긋남)", issues.ragged);
show("열 비율 산출 실패", issues.noWidth);
show("음영 칸이 120자 초과(라벨 아닐 수 있음)", issues.shadeLong);
show("표 전체가 음영", issues.plainAllShade);

const bad = issues.ragged.length + issues.noWidth.length;
console.log(`\n${bad === 0 ? "✓ 구조·너비 이상 없음" : `✗ 구조/너비 이상 ${bad}건`}`);
