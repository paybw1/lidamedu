// fill-truncated-explanations 반영분을 원장(content_revisions) 스냅샷으로 되돌린다.
// ★백업 JSON 은 스크립트를 다시 돌리면 덮어써진다 — 원장이 더 확실한 복원 원천이다.
//   node scripts/mcq-audit/restore-fill.mjs <ISO시각from> <ISO시각to> [--apply]
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const APPLY = process.argv.includes("--apply");
const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!from || !to) { console.error("사용: restore-fill.mjs <from ISO> <to ISO> [--apply]"); process.exit(1); }
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await supa
  .from("content_revisions")
  .select("revision_id, content_id, before_snapshot, after_snapshot, created_at")
  .eq("content_type", "mcq")
  .gte("created_at", from).lte("created_at", to);
if (error) throw error;
const rows = (data ?? []).filter((r) => {
  const b = r.before_snapshot ?? {}, a = r.after_snapshot ?? {};
  return b.choice_id && b.explanation_md !== a.explanation_md;
});
console.log(`복원 대상 ${rows.length}개 선지 (${from} ~ ${to})`);
if (!APPLY) { console.log("dry-run — 되돌리려면 --apply"); process.exit(0); }
for (const r of rows) {
  const { error: e } = await supa.from("problem_choices")
    .update({ explanation_md: r.before_snapshot.explanation_md })
    .eq("choice_id", r.before_snapshot.choice_id);
  if (e) throw e;
}
console.log(`✓ ${rows.length}개 복원 완료`);
