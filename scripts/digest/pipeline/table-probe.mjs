// 표 쪽의 구조만 훑어본다 — 몇 줄·몇 열이고 목차 열이 몇 개인지.
//   node scripts/digest/pipeline/table-probe.mjs
// ★인라인(node -e)으로 돌리지 말 것: 쉘이 정규식 백슬래시를 먹어 colspan 이 전부 1 로 보인다.
import { readFileSync } from "node:fs";

const doc = JSON.parse(readFileSync("scripts/digest/pipeline/정리비교표.json", "utf8"));
const spanOf = (a, n) => Number(a.match(new RegExp(`${n}="(\\d+)"`))?.[1] ?? 1);
const cellsOf = (r) => [...r.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];

for (const p of [4, 5, 6, 7, 8, 9, 12]) {
  const tables = doc.pages[p - 1].tables ?? [];
  console.log(`=== ${p}p  표 ${tables.length}개`);
  tables.forEach((t, ti) => {
    const rows = t.split("<tr>").slice(1).map((r) => r.replace(/<\/tr>[\s\S]*/, ""));
    const r0 = cellsOf(rows[0]);
    const total = r0.reduce((n, m) => n + spanOf(m[1], "colspan"), 0);
    const cells = rows.reduce((n, r) => n + cellsOf(r).length, 0);
    console.log(
      `  [${ti}] 줄 ${rows.length} · 열 ${total} · 칸 ${cells} · 첫칸 colspan=${spanOf(r0[0][1], "colspan")} rowspan=${spanOf(r0[0][1], "rowspan")}`,
    );
    rows.slice(0, 4).forEach((r, ri) => {
      const line = cellsOf(r)
        .map((m) => `${spanOf(m[1], "colspan")}x${spanOf(m[1], "rowspan")}[${m[2].replace(/<br>/g, "/").slice(0, 14)}]`)
        .join(" ");
      console.log(`      ${ri}: ${line}`);
    });
  });
}
