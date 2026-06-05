// 박스형(mc_box) 예상문제(origin=expected)의 지문(problem_choices)·박스 보기
// (problem_box_items) 를 모두 OX 불가(ox_ineligible=true) 로 표시.
//
// 박스형은 보기묶음/지문이 단독 진위(OX)로 성립하지 않으므로 OX 풀에서 제외.
// 기존 수동 ox_truth 라벨은 보존(되돌리기 쉽게) — ox_ineligible 만 켠다.
// OX 풀 쿼리는 ox_ineligible=false 만 뽑으므로 라벨이 남아도 풀에는 안 나온다.
//
// 사용:
//   node scripts/mark-box-expected-ox-ineligible.mjs            # dry-run
//   node scripts/mark-box-expected-ox-ineligible.mjs --apply

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
console.log(`대상 프로젝트: ${process.env.SUPABASE_URL}`);

// 박스형 예상문제 problem_id.
const { data: probs, error: pErr } = await supa
  .from("problems")
  .select("problem_id")
  .eq("origin", "expected")
  .eq("format", "mc_box")
  .is("deleted_at", null);
if (pErr) { console.error("problems 조회 실패:", pErr.message); process.exit(1); }
const ids = probs.map((p) => p.problem_id);
console.log(`박스형 예상문제: ${ids.length}건`);

const CHUNK = 100;
async function fetchAll(table, cols) {
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supa
      .from(table).select(cols).in("problem_id", ids.slice(i, i + CHUNK));
    if (error) { console.error(`${table} 조회 실패:`, error.message); process.exit(1); }
    out.push(...(data ?? []));
  }
  return out;
}

const choices = await fetchAll("problem_choices", "choice_id, ox_ineligible, ox_truth");
const boxItems = await fetchAll("problem_box_items", "box_item_id, ox_ineligible, ox_truth");

const chToUpdate = choices.filter((c) => c.ox_ineligible !== true);
const boxToUpdate = boxItems.filter((b) => b.ox_ineligible !== true);
const boxOxTruth = boxItems.filter((b) => b.ox_truth != null).length;
const chOxTruth = choices.filter((c) => c.ox_truth != null).length;

console.log(`\n=== 현황 ===`);
console.log(`  지문(choices)     : 총 ${choices.length}, OX불가 아님 ${chToUpdate.length}, ox_truth 보유 ${chOxTruth}`);
console.log(`  박스보기(box_items): 총 ${boxItems.length}, OX불가 아님 ${boxToUpdate.length}, ox_truth 보유 ${boxOxTruth}`);

if (!APPLY) {
  console.log(`\n(dry-run — 변경 없음. --apply 로 실행. ox_truth 는 보존)`);
  process.exit(0);
}

console.log(`\n=== APPLY — ox_ineligible=true (ox_truth 보존) ===`);
async function applyUpdate(table, idCol, rows) {
  let ok = 0;
  const idList = rows.map((r) => r[idCol]);
  for (let i = 0; i < idList.length; i += CHUNK) {
    const slice = idList.slice(i, i + CHUNK);
    const { error } = await supa
      .from(table).update({ ox_ineligible: true }).in(idCol, slice);
    if (error) { console.error(`${table} update 실패:`, error.message); process.exit(1); }
    ok += slice.length;
  }
  return ok;
}
const chOk = await applyUpdate("problem_choices", "choice_id", chToUpdate);
const boxOk = await applyUpdate("problem_box_items", "box_item_id", boxToUpdate);
console.log(`  지문 ${chOk}건 + 박스보기 ${boxOk}건 OX불가 처리 완료`);
