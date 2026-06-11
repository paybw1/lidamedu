// Read-only schema confirm via supabase-js REST (direct pg host is unreachable here).
import { adminClient } from "./db.mjs";

const sb = adminClient();

// 1) columns actually present on `problems` (sample one row, any subject)
const { data: anyProblem, error: e1 } = await sb.from("problems").select("*").limit(1);
if (e1) throw new Error(`problems select failed: ${e1.message}`);
console.log("=== problems columns (from sample row) ===");
console.log(anyProblem?.[0] ? Object.keys(anyProblem[0]).join(", ") : "(table empty)");

// 2) a science problem specifically, to see how science fields are populated
const { data: sci } = await sb
  .from("problems")
  .select("problem_id, body_md, format, origin, exam_round, exam_round_no, year, subject_type, science_subject, science_section_id, polarity, scope, review_status, choice_count")
  .eq("subject_type", "science").limit(2);
console.log("\n=== sample science problems ===");
for (const p of sci || []) console.log(JSON.stringify({ ...p, body_md: (p.body_md || "").slice(0, 50) }));
if (!sci?.length) console.log("(no science problems yet)");

// 3) problem_choices columns
const { data: ch } = await sb.from("problem_choices").select("*").limit(1);
console.log("\n=== problem_choices columns ===");
console.log(ch?.[0] ? Object.keys(ch[0]).join(", ") : "(table empty)");

// 4) mcq_packs + mcq_pack_problems columns
const { data: mp } = await sb.from("mcq_packs").select("*").limit(1);
console.log("\n=== mcq_packs columns ===");
console.log(mp?.[0] ? Object.keys(mp[0]).join(", ") : "(table empty)");
const { data: mpp } = await sb.from("mcq_pack_problems").select("*").limit(1);
console.log("=== mcq_pack_problems columns ===");
console.log(mpp?.[0] ? Object.keys(mpp[0]).join(", ") : "(table empty)");
const { data: pastPacks } = await sb.from("mcq_packs").select("pack_id, kind, subject_scope, year, title").eq("kind", "past_exam");
console.log(`existing past_exam packs: ${pastPacks?.length || 0}`);
for (const p of pastPacks || []) console.log(`  ${p.title} [scope=${p.subject_scope} year=${p.year}]`);

// 5) storage buckets
const { data: buckets, error: be } = await sb.storage.listBuckets();
console.log("\n=== storage buckets ===");
if (be) console.log("listBuckets error:", be.message);
else for (const b of buckets) console.log(`  ${b.id}  public=${b.public}`);

// 6) duplicate guard
const { count } = await sb.from("problems").select("problem_id", { count: "exact", head: true })
  .eq("year", 2010).eq("subject_type", "science").eq("exam_round_no", 47).eq("origin", "past_exam");
console.log(`\n=== existing 2010/47 science past_exam problems: ${count ?? "?"} ===`);
