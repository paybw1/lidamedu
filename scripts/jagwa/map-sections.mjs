// Map the active tag's 40 problems to science_sections (단원) using QUESTIONS[].section.
// JAGWA_TAG=<tag> node map-sections.mjs [--go]
import { adminClient } from "./db.mjs";
import { EXAM, QUESTIONS, TAG } from "./data.mjs";

const GO = process.argv.includes("--go");
const sb = adminClient();
const { data: secs } = await sb.from("science_sections").select("section_id, code, science_subject");
const byCode = Object.fromEntries(secs.map((s) => [s.code, s]));
const sectionByN = Object.fromEntries(QUESTIONS.map((q) => [q.n, q.section]));

const { data: probs, error } = await sb.from("problems")
  .select("problem_id, problem_number, science_subject")
  .eq("year", EXAM.year).eq("subject_type", "science").eq("exam_round_no", EXAM.examRoundNo).eq("origin", "past_exam")
  .order("problem_number");
if (error) throw error;

let ok = 0, bad = 0;
for (const p of probs) {
  const code = sectionByN[p.problem_number];
  const sec = code ? byCode[code] : null;
  if (!sec) { console.log(`q${p.problem_number}: no section (code=${code})`); bad++; continue; }
  if (sec.science_subject !== p.science_subject) { console.log(`q${p.problem_number}: subject mismatch ${p.science_subject}/${sec.science_subject}`); bad++; continue; }
  if (GO) {
    const { error: uErr } = await sb.from("problems").update({ science_section_id: sec.section_id }).eq("problem_id", p.problem_id);
    if (uErr) { console.log(`q${p.problem_number} update err: ${uErr.message}`); bad++; continue; }
  }
  ok++;
}
console.log(`[${TAG}] ${GO ? "UPDATED" : "PLAN"}: ${ok} mapped, ${bad} issues.${GO ? "" : " --go to write."}`);
