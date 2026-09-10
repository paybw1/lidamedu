// 도해 표에 **정리비교표식 빈칸**(머리칸을 누르면 그 줄·그 칸이 빈칸)을 붙일 수 있는지
// 재 본다 — 읽기만 한다.
//
//   node scripts/dohae/probe-table-blanks.mjs
//
// 판정 기준: 교재는 **라벨 칸에만 회색 음영**을 깐다(DohaeCell.shade) — 그게 곧 목차칸이다.
//   · 첫 줄이 통째로 음영  → 열 목차가 있다(세로줄 빈칸 가능)
//   · 첫 칸열이 음영       → 행 목차가 있다(가로줄 빈칸 가능)
//   둘 다 없으면 이 방식으로는 붙일 자리가 없다(기존 낱말 빈칸이 맡는 자리).
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정 (.env)");
  process.exit(1);
}
const supa = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await supa.from("dohae_units").select("unit_id, unit_key, title, blocks");
if (error) throw error;

const has = (c) => (c?.text ?? "").trim().length > 0;

let tables = 0, cells = 0, contentCells = 0;
let withCol = 0, withRow = 0, withBoth = 0, withNeither = 0;
let diagramBlocks = 0, diagramCells = 0, paras = 0;
const unitsWithUsable = new Set();
const sample = [];

for (const u of data) {
  for (const b of u.blocks ?? []) {
    if (b.type === "diagram") { diagramBlocks += 1; continue; }
    if (b.type === "p" || b.type === "h") { paras += 1; continue; }
    if (b.type !== "table") continue;
    const rows = b.cells ?? [];
    if (!rows.length) continue;
    tables += 1;
    for (const r of rows) for (const c of r) { cells += 1; if (c.diagram) diagramCells += 1; }

    // 첫 줄이 통째로 음영인가 / 첫 칸이 매 줄 음영인가.
    const head = rows[0] ?? [];
    const colHead = head.length > 1 && head.every((c) => c.shade);
    const rowHead =
      rows.length > 1 && rows.slice(colHead ? 1 : 0).every((r) => r[0] && r[0].shade);

    if (colHead && rowHead) withBoth += 1;
    else if (colHead) withCol += 1;
    else if (rowHead) withRow += 1;
    else withNeither += 1;

    if (colHead || rowHead) {
      unitsWithUsable.add(u.unit_id);
      // 가릴 수 있는 칸 = 음영이 아니고 글자가 있는 칸.
      for (const r of rows) for (const c of r) if (!c.shade && has(c) && !c.diagram) contentCells += 1;
      if (sample.length < 6) {
        sample.push(
          `${u.unit_key} ${u.title.slice(0, 18)} — ${rows.length}줄×${head.length}칸 ` +
            `[${colHead ? "열목차" : ""}${colHead && rowHead ? "+" : ""}${rowHead ? "행목차" : ""}] ` +
            `머리: ${head.map((c) => (c.text ?? "").trim().slice(0, 10)).filter(Boolean).slice(0, 5).join(" / ")}`,
        );
      }
    }
  }
}

console.log(`유닛 ${data.length} · 표 ${tables} · 칸 ${cells}`);
console.log(`  머리칸이 있는 표: ${withBoth + withCol + withRow}`);
console.log(`    · 행·열 둘 다 : ${withBoth}`);
console.log(`    · 열 목차만   : ${withCol}`);
console.log(`    · 행 목차만   : ${withRow}`);
console.log(`  머리칸이 없는 표: ${withNeither}`);
console.log(`  → 이 방식으로 가릴 수 있는 칸 ${contentCells} · 해당 유닛 ${unitsWithUsable.size}`);
console.log(`\n붙일 수 없는 것: 이미지 다이어그램 블록 ${diagramBlocks} · 칸 안 도해 ${diagramCells}`);
console.log(`글 블록(문단·소제목) ${paras} — 여기는 기존 낱말 빈칸(feat-2-037)이 맡는다`);
console.log(`\n[표 보기]`);
for (const s of sample) console.log(`  · ${s}`);
