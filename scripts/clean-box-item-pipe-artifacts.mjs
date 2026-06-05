// 박스 보기(problem_box_items) 본문 끝에 남은 표 잔재 "|" 제거.
// 시드 파서(extractBoxItems)가 markdown table row 의 마지막 보기에서 닫는 "|" 를
// 떼지 않아 "…한다. |" 형태로 저장된 것. 단일 trailing "|" 만 대상(안전).
//
//   node scripts/clean-box-item-pipe-artifacts.mjs            # dry-run
//   node scripts/clean-box-item-pipe-artifacts.mjs --apply

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
console.log(`proj: ${process.env.SUPABASE_URL}`);

const { data: law } = await supa.from("laws").select("law_id").eq("law_code", "patent").single();
const { data: probs } = await supa.from("problems")
  .select("problem_id").eq("law_id", law.law_id).eq("origin", "expected").is("deleted_at", null);
const ids = probs.map((p) => p.problem_id);

const targets = [];
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await supa.from("problem_box_items").select("box_item_id, body_md").in("problem_id", ids.slice(i, i + 100));
  for (const b of data ?? []) {
    if (!/\|/.test(b.body_md)) continue;
    const cleaned = b.body_md.replace(/\s*\|\s*$/, "").replace(/\s+$/, "");
    // 단일 trailing "|" 만(정리 후 "|" 가 남지 않아야) — 그 외는 건너뜀(수동 검토).
    if (/\|/.test(cleaned)) { console.log(`  ⚠ skip(다중/중간 |): ${b.box_item_id}`); continue; }
    if (cleaned !== b.body_md) targets.push({ box_item_id: b.box_item_id, old: b.body_md, new: cleaned });
  }
}

console.log(`\n=== trailing | 제거 대상 ${targets.length}건 ===`);
for (const t of targets.slice(0, 10)) console.log(`  …${JSON.stringify(t.old.slice(-26))} → …${JSON.stringify(t.new.slice(-22))}`);
if (targets.length > 10) console.log(`  … (+${targets.length - 10})`);

if (!APPLY) { console.log(`\n(dry-run — --apply 로 실행)`); process.exit(0); }

let ok = 0;
const CHUNK = 50;
for (let i = 0; i < targets.length; i += CHUNK) {
  for (const t of targets.slice(i, i + CHUNK)) {
    const { error } = await supa.from("problem_box_items").update({ body_md: t.new }).eq("box_item_id", t.box_item_id);
    if (error) console.error(`  실패 ${t.box_item_id}: ${error.message}`); else ok++;
  }
}
console.log(`완료 — ${ok}/${targets.length}`);
