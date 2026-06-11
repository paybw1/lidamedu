// Independent read-only verification of the 2010 자과 load.
import { adminClient } from "./db.mjs";
import { ANSWERS } from "./data.mjs";
const sb = adminClient();
let problems = false;

// 1) counts by science_subject + integrity
const { data: rows } = await sb.from("problems")
  .select("problem_id, problem_number, science_subject, polarity, body_md, review_status")
  .eq("year", 2010).eq("subject_type", "science").eq("exam_round_no", 47).eq("origin", "past_exam");
const bySubj = {};
for (const r of rows) bySubj[r.science_subject] = (bySubj[r.science_subject] || 0) + 1;
console.log(`problems: ${rows.length}  bySubject=${JSON.stringify(bySubj)}`);

// 2) choices integrity + answer-key match
let badChoices = 0, badAnswer = 0;
for (const r of rows) {
  const { data: ch } = await sb.from("problem_choices").select("choice_index, is_correct").eq("problem_id", r.problem_id).order("choice_index");
  if (ch.length !== 5) { badChoices++; console.log(`  q${r.problem_number}: ${ch.length} choices!`); }
  const correct = ch.filter((c) => c.is_correct).map((c) => c.choice_index).sort();
  const expect = [...ANSWERS[r.problem_number]].sort();
  if (JSON.stringify(correct) !== JSON.stringify(expect)) { badAnswer++; console.log(`  q${r.problem_number}: correct=${correct} expect=${expect}`); }
}
console.log(`choice integrity: ${rows.length - badChoices}/${rows.length} have 5 choices; answer-key match: ${rows.length - badAnswer}/${rows.length}`);

// 3) pack
const { data: pack } = await sb.from("mcq_packs").select("pack_id, title, subject_scope, year, is_published")
  .eq("kind", "past_exam").eq("subject_scope", "science").eq("year", 2010).maybeSingle();
const { count: mapCount } = await sb.from("mcq_pack_problems").select("problem_id", { count: "exact", head: true }).eq("pack_id", pack.pack_id);
console.log(`pack: "${pack.title}" scope=${pack.subject_scope} published=${pack.is_published} mappings=${mapCount}`);

// 4) 학습과목 자연과학 visibility (mirrors listScienceProblems: subject_type+science_subject)
for (const s of ["physics", "chemistry", "biology", "earth_science"]) {
  const { count } = await sb.from("problems").select("problem_id", { count: "exact", head: true })
    .eq("subject_type", "science").eq("science_subject", s).is("deleted_at", null);
  console.log(`  /subjects/science ${s}: ${count} visible`);
}

// 5) image reachability sample
for (const n of [1, 12, 19, 40]) {
  const r = rows.find((x) => x.problem_number === n);
  const url = (r.body_md.match(/\(([^)]+)\)/) || [])[1];
  const resp = await fetch(url, { method: "GET" });
  console.log(`  img q${n}: HTTP ${resp.status}`);
}
console.log(rows.length === 40 && badChoices === 0 && badAnswer === 0 && mapCount === 40 ? "\nALL CHECKS PASS" : "\nCHECK FAILURES ABOVE");
