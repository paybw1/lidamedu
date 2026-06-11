// A) Map the 40 자연과학 2010 기출 to science_sections (단원) by topic.
// Pass --go to write; without it prints the plan.
import { adminClient } from "./db.mjs";

const GO = process.argv.includes("--go");
const sb = adminClient();

// problem_number -> section code (by topic, from the extracted content)
const SECTION_BY_N = {
  1: "phy.mech", 2: "phy.mech", 3: "phy.em", 4: "phy.em", 5: "phy.em",
  6: "phy.thermo", 7: "phy.wave", 8: "phy.modern", 9: "phy.modern", 10: "phy.modern",
  11: "chem.organic", 12: "chem.atom", 13: "chem.atom", 14: "chem.atom", 15: "chem.gas",
  16: "chem.gas", 17: "chem.acidbase", 18: "chem.atom", 19: "chem.reaction", 20: "chem.organic",
  21: "bio.cell", 22: "bio.cell", 23: "bio.genetics", 24: "bio.genetics", 25: "bio.physiology",
  26: "bio.genetics", 27: "bio.genetics", 28: "bio.genetics", 29: "bio.ecology", 30: "bio.genetics",
  31: "earth.geology", 32: "earth.geology", 33: "earth.geology", 34: "earth.geology", 35: "earth.geology",
  36: "earth.ocean", 37: "earth.atmosphere", 38: "earth.astro", 39: "earth.astro", 40: "earth.astro",
};

const { data: secs } = await sb.from("science_sections").select("section_id, code, science_subject, label");
const byCode = Object.fromEntries(secs.map((s) => [s.code, s]));

const { data: probs, error } = await sb.from("problems")
  .select("problem_id, problem_number, science_subject, science_section_id")
  .eq("year", 2010).eq("subject_type", "science").eq("exam_round_no", 47).eq("origin", "past_exam")
  .order("problem_number");
if (error) throw error;

let ok = 0, skip = 0, mismatch = 0;
for (const p of probs) {
  const code = SECTION_BY_N[p.problem_number];
  const sec = byCode[code];
  if (!sec) { console.log(`q${p.problem_number}: NO section for code ${code}`); mismatch++; continue; }
  if (sec.science_subject !== p.science_subject) {
    console.log(`q${p.problem_number}: subject mismatch (problem=${p.science_subject} section=${sec.science_subject})`); mismatch++; continue;
  }
  console.log(`q${String(p.problem_number).padStart(2)} ${p.science_subject.padEnd(13)} -> ${sec.label} (${code})${p.science_section_id ? " [already set]" : ""}`);
  if (GO) {
    const { error: uErr } = await sb.from("problems").update({ science_section_id: sec.section_id }).eq("problem_id", p.problem_id);
    if (uErr) { console.log(`  update err: ${uErr.message}`); mismatch++; continue; }
  }
  ok++;
}
console.log(`\n${GO ? "UPDATED" : "PLAN"}: ${ok} mapped, ${mismatch} problems. ${GO ? "" : "Re-run with --go to write."}`);

if (GO) {
  // verify section distribution
  const { data: after } = await sb.from("problems")
    .select("science_subject, science_section_id")
    .eq("year", 2010).eq("subject_type", "science").eq("exam_round_no", 47).eq("origin", "past_exam");
  const nullCount = after.filter((p) => !p.science_section_id).length;
  console.log(`null section_id remaining: ${nullCount}`);
}
