// Read-only: sample an existing past_exam problem + its choices to copy conventions.
import { adminClient } from "./db.mjs";
const sb = adminClient();

const { data: probs } = await sb.from("problems")
  .select("problem_id, format, origin, exam_round, scope, polarity, review_status, total_points, importance, created_by, choice_count:problem_id")
  .eq("origin", "past_exam").eq("format", "mc_short").limit(3);
console.log("=== sample past_exam mc_short problems (conventions) ===");
for (const p of probs || []) {
  const { problem_id, ...rest } = p; delete rest.choice_count;
  console.log(JSON.stringify(rest));
  const { data: ch } = await sb.from("problem_choices")
    .select("choice_index, is_correct, choice_type, ox_truth, body_md")
    .eq("problem_id", problem_id).order("choice_index");
  console.log(`   choices(${ch?.length}): ` + (ch || []).map((c) => `${c.choice_index}${c.is_correct ? "*" : ""}[type=${c.choice_type},ox=${c.ox_truth}] "${(c.body_md || "").slice(0, 18)}"`).join("  "));
}

// distinct total_points among past_exam first-round, to pick the right value
const { data: tp } = await sb.from("problems").select("total_points").eq("origin", "past_exam").eq("exam_round", "first").limit(200);
const counts = {};
for (const r of tp || []) counts[r.total_points] = (counts[r.total_points] || 0) + 1;
console.log("\n=== total_points distribution (past_exam first) ===", JSON.stringify(counts));

// confirm a valid created_by: list admin profiles
const { data: admins } = await sb.from("profiles").select("profile_id, role, name").eq("role", "admin");
console.log("=== admin profiles ===");
for (const a of admins || []) console.log(`  ${a.profile_id}  ${a.name}`);
