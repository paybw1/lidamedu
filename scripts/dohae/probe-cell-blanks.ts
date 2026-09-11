// 도해 표 **칸 가리기**(feat-2-037 S7)가 실제로 어디에 얼마나 붙는지 — 화면과 **같은 모델**
// (`lib/dohae-cell-blanks.ts`)로 전 유닛을 잰다. 읽기만 한다.
//
//   npx tsx scripts/dohae/probe-cell-blanks.ts            # 집계
//   npx tsx scripts/dohae/probe-cell-blanks.ts --dead     # 다스릴 칸이 없는 라벨(죽은 손잡이) 보기
//
// 앞선 실측(probe-table-blanks.mjs, 2026-09-10)은 정리비교표 규칙(첫 줄·첫 열만)으로
// 표 184 · 칸 2,372 를 셌다. 그 규칙으로는 둘째 열의 작은 라벨(「주체적」·「대상」…)
// 1,170칸이 전부 죽은 손잡이가 되고 속표 72개는 아예 세지 않았다 — 그래서 규칙을 바꿨다.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "database.types";
import "dotenv/config";

import type { DohaeBlock, DohaeCell } from "~/features/dohae/labels";
import { buildCellBlankModel } from "~/features/dohae/lib/dohae-cell-blanks";
import { isArticleBox } from "~/features/dohae/lib/dohae-blanks";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정 (.env)");
  process.exit(1);
}
const supa = createClient<Database>(url, key, { auth: { persistSession: false } });
const showDead = process.argv.includes("--dead");

const { data, error } = await supa
  .from("dohae_units")
  .select("unit_key, title, blocks")
  .order("unit_key");
if (error) throw error;

let units = 0;
let content = 0;
let heads = 0;
let deadHeads = 0;
let unitsWithContent = 0;
let noContent: string[] = [];
const deadSamples: string[] = [];
const perUnit: number[] = [];

/** 표(속표 포함)의 음영 칸 키를 모은다 — 죽은 손잡이 = 음영인데 groups 에 없는 것. */
function shadedKeys(cells: DohaeCell[][], prefix: string, out: Map<string, string>) {
  cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      const k = `${prefix}.r${r}.c${c}`;
      if (cell.shade && !cell.diagram && cell.text.trim()) out.set(k, cell.text.trim());
      (cell.tables ?? []).forEach((t, ti) => shadedKeys(t, `${k}.t${ti}`, out));
    }),
  );
}

for (const u of data) {
  units += 1;
  const blocks = (u.blocks ?? []) as unknown as DohaeBlock[];
  const model = buildCellBlankModel(blocks);
  content += model.content.length;
  heads += model.groups.size;
  perUnit.push(model.content.length);
  if (model.content.length > 0) unitsWithContent += 1;
  else noContent.push(u.unit_key);

  const shaded = new Map<string, string>();
  blocks.forEach((b, i) => {
    if (b.type === "table" && !isArticleBox(b)) shadedKeys(b.cells, `b${i}`, shaded);
  });
  for (const [k, text] of shaded) {
    if (model.groups.has(k)) continue;
    deadHeads += 1;
    if (deadSamples.length < 40)
      deadSamples.push(`${u.unit_key} ${k} 「${text.replace(/\s+/g, " ").slice(0, 18)}」`);
  }
}

const avg = perUnit.length ? content / perUnit.length : 0;
console.log(`유닛 ${units} · 가릴 수 있는 칸 ${content} (유닛당 ${avg.toFixed(1)}) · 붙는 유닛 ${unitsWithContent}`);
console.log(`목차칸(손잡이) ${heads} · 다스릴 칸이 없는 라벨 ${deadHeads}`);
if (noContent.length) console.log(`붙일 표가 없는 유닛: ${noContent.join(", ")}`);
if (showDead) {
  console.log(`\n[죽은 손잡이 보기 — 오른쪽·아래에 내용칸이 없는 라벨]`);
  for (const s of deadSamples) console.log(`  · ${s}`);
}
