// 정답을 정정한 문항의 ox_truth 재산출 (정오문제 표면이 옛 정답을 따라가고 있어서).
// 규칙 SSOT: app/features/problems/lib/auto-ox.ts
//   부정형("옳지 않은 것은?") → 정답 X, 나머지 O / 긍정형 → 정답 O, 나머지 X
//   node scripts/mcq-audit/backups/fix-ox-truth.mjs [--apply]
import { writeFileSync } from "node:fs";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const TARGETS = [9494, 9495, 6061, 6062, 6063, 7754, 8070];
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: probs, error } = await supa.from("problems")
  .select("problem_id, display_no, polarity, format").in("display_no", TARGETS);
if (error) throw error;

const backup = [];
const updates = [];
for (const p of probs) {
  const { data: cs } = await supa.from("problem_choices")
    .select("choice_id, choice_index, is_correct, ox_truth, ox_ineligible")
    .eq("problem_id", p.problem_id).order("choice_index");
  backup.push({ displayNo: p.display_no, polarity: p.polarity, choices: cs });
  if (p.format !== "mc_short") { console.log(`P-${p.display_no} format=${p.format} — 자동 OX 대상 아님, 건너뜀`); continue; }
  if (!p.polarity) { console.log(`P-${p.display_no} polarity 없음 — 건너뜀`); continue; }
  for (const c of cs) {
    if (c.ox_ineligible) continue;
    const want = p.polarity === "negative" ? (c.is_correct ? "X" : "O") : (c.is_correct ? "O" : "X");
    if (c.ox_truth !== want) updates.push({ displayNo: p.display_no, idx: c.choice_index, choiceId: c.choice_id, from: c.ox_truth, to: want });
  }
}
writeFileSync("scripts/mcq-audit/backups/backup-ox-truth-2.json", JSON.stringify(backup, null, 1), "utf8");
console.log(`백업: scripts/mcq-audit/backups/backup-ox-truth-2.json\n변경 대상 ${updates.length}개`);
for (const u of updates) console.log(`  P-${u.displayNo} 선지${u.idx}  ox_truth ${u.from} → ${u.to}`);
if (!APPLY) { console.log("\ndry-run — 반영하려면 --apply"); process.exit(0); }
for (const u of updates) {
  const { error: e } = await supa.from("problem_choices").update({ ox_truth: u.to }).eq("choice_id", u.choiceId);
  if (e) throw e;
}
console.log(`\n✓ ${updates.length}개 반영 완료`);
