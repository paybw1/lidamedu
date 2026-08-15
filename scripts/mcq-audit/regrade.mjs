// 정답이 정정된 문항의 과거 풀이 재채점 + 데모 문항 P-1 정리.
//   node scripts/mcq-audit/backups/regrade.mjs [--apply]
// 백업: scripts/mcq-audit/backups/backup-regrade.json
import { writeFileSync } from "node:fs";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const REGRADE = [7754, 8070, 6062]; // 정답이 바뀌었고 풀이 이력이 있는 문항
const DELETE_DEMO = 1; // 최초 시드 데모 문항 (진짜 기출 P-5795 와 신규성 #12 슬롯 중복)

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const backup = { attempts: [], demo: null };

// ── 1. 재채점 ──
const plan = [];
for (const no of REGRADE) {
  const { data: p } = await supa.from("problems").select("problem_id, display_no, year, problem_number").eq("display_no", no).single();
  const { data: cs } = await supa.from("problem_choices").select("choice_index, is_correct").eq("problem_id", p.problem_id);
  const correct = cs.filter((c) => c.is_correct).map((c) => c.choice_index);
  const { data: att } = await supa.from("user_problem_attempts")
    .select("attempt_id, selected_choice_index, is_correct, attempted_at, mode").eq("problem_id", p.problem_id);
  for (const a of att ?? []) {
    backup.attempts.push({ ...a, displayNo: no });
    if (a.selected_choice_index == null) continue; // 선택 기록 없는 건 손대지 않는다
    const want = correct.includes(a.selected_choice_index);
    if (a.is_correct !== want) plan.push({ no, attemptId: a.attempt_id, sel: a.selected_choice_index, from: a.is_correct, to: want, correct });
  }
  console.log(`P-${no} (정답 ${correct.join(",")}) — 풀이 ${att?.length ?? 0}건`);
}
console.log(`\n재채점 대상 ${plan.length}건`);
for (const u of plan) console.log(`  P-${u.no} attempt ${u.attemptId.slice(0, 8)} · 선택 ${u.sel}번 · 정오 ${u.from} → ${u.to}`);

// ── 2. 데모 문항 정리 ──
const { data: demo } = await supa.from("problems")
  .select("problem_id, display_no, deleted_at, review_status").eq("display_no", DELETE_DEMO).single();
const { data: demoMaps } = await supa.from("publication_content_map")
  .select("map_id, edition_id, content_id, content_type, toc_path, sort_key").eq("content_id", demo.problem_id);
backup.demo = { problem: demo, maps: demoMaps };
console.log(`\nP-1 정리 — soft delete(deleted_at) + 워크북 매핑 ${demoMaps?.length ?? 0}건 제거`);

writeFileSync("scripts/mcq-audit/backups/backup-regrade.json", JSON.stringify(backup, null, 1), "utf8");
console.log("백업: scripts/mcq-audit/backups/backup-regrade.json");

if (!APPLY) { console.log("\ndry-run — 반영하려면 --apply"); process.exit(0); }

for (const u of plan) {
  const { error } = await supa.from("user_problem_attempts").update({ is_correct: u.to }).eq("attempt_id", u.attemptId);
  if (error) throw error;
}
const { error: e1 } = await supa.from("problems")
  .update({ deleted_at: new Date().toISOString(), review_status: "rejected", rejected_reason: "최초 시드 데모 문항 — 진짜 기출 P-5795(2021년 12번)와 중복, 워크북 미수록 발문·미검증 사건번호" })
  .eq("problem_id", demo.problem_id);
if (e1) throw e1;
for (const m of demoMaps ?? []) {
  const { error } = await supa.from("publication_content_map").delete().eq("map_id", m.map_id);
  if (error) throw error;
}
console.log(`\n✓ 재채점 ${plan.length}건 · P-1 삭제 + 매핑 ${demoMaps?.length ?? 0}건 제거 완료`);
