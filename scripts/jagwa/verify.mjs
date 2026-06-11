// Independent read-only verification of the active tag's load.
// JAGWA_TAG=<tag> node verify.mjs
import { adminClient } from "./db.mjs";
import { EXAM, ANSWERS, TAG } from "./data.mjs";
const sb = adminClient();

const { data: rows } = await sb.from("problems")
  .select("problem_id, problem_number, science_subject, science_section_id, body_md")
  .eq("year", EXAM.year).eq("subject_type", "science").eq("exam_round_no", EXAM.examRoundNo).eq("origin", "past_exam");
const bySubj = {};
for (const r of rows) bySubj[r.science_subject] = (bySubj[r.science_subject] || 0) + 1;
const noSection = rows.filter((r) => !r.science_section_id).length;
console.log(`[${TAG}] problems=${rows.length} bySubject=${JSON.stringify(bySubj)} noSection=${noSection}`);

let badCh = 0, badAns = 0;
for (const r of rows) {
  const { data: ch } = await sb.from("problem_choices").select("choice_index, is_correct").eq("problem_id", r.problem_id).order("choice_index");
  if (ch.length !== 5) { badCh++; console.log(`  q${r.problem_number}: ${ch.length} choices`); }
  const correct = ch.filter((c) => c.is_correct).map((c) => c.choice_index).sort();
  const expect = [...(ANSWERS[r.problem_number] ?? [])].sort();
  if (JSON.stringify(correct) !== JSON.stringify(expect)) { badAns++; console.log(`  q${r.problem_number}: correct=${correct} expect=${expect}`); }
}
const { data: pack } = await sb.from("mcq_packs").select("pack_id, title, is_published")
  .eq("kind", "past_exam").eq("subject_scope", "science").eq("year", EXAM.year).maybeSingle();
const { count: mapCount } = pack ? await sb.from("mcq_pack_problems").select("problem_id", { count: "exact", head: true }).eq("pack_id", pack.pack_id) : { count: 0 };
console.log(`choices ok=${rows.length - badCh}/${rows.length}  answers ok=${rows.length - badAns}/${rows.length}  pack="${pack?.title}"(${mapCount})`);

for (const n of [rows[0]?.problem_number, rows[rows.length - 1]?.problem_number].filter(Boolean)) {
  const r = rows.find((x) => x.problem_number === n);
  const url = (r.body_md.match(/\(([^)]+)\)/) || [])[1];
  const resp = await fetch(url);
  console.log(`  img q${n}: HTTP ${resp.status}`);
}
console.log(rows.length === 40 && badCh === 0 && badAns === 0 && mapCount === 40 && noSection === 0 ? "ALL CHECKS PASS" : "REVIEW ABOVE");
