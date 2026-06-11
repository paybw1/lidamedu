// Apply auto-classified sections (.ocr/sections-<tag>.json) to the year's problems.
// 자동 분류(OCR+키워드)라 ~85% 정확 — null/저신뢰는 미적용(전체 단원에만 노출).
// JAGWA_TAG=<tag> node apply-classified-sections.mjs [--go]
import fs from "node:fs";
import path from "node:path";
import { adminClient } from "./db.mjs";
import { EXAM, TAG } from "./data.mjs";

const GO = process.argv.includes("--go");
const sb = adminClient();
const clsPath = path.join(import.meta.dirname, ".ocr", `sections-${TAG}.json`);
if (!fs.existsSync(clsPath)) { console.log(`[${TAG}] no classification file`); process.exit(0); }
const cls = JSON.parse(fs.readFileSync(clsPath, "utf8"));

const { data: secs } = await sb.from("science_sections").select("section_id, code, science_subject");
const byCode = Object.fromEntries(secs.map((s) => [s.code, s]));

const { data: probs } = await sb.from("problems")
  .select("problem_id, problem_number, science_subject")
  .eq("year", EXAM.year).eq("subject_type", "science").eq("exam_round_no", EXAM.examRoundNo).eq("origin", "past_exam")
  .order("problem_number");

let applied = 0, nullc = 0, mismatch = 0;
for (const p of probs) {
  const c = cls[p.problem_number];
  if (!c || !c.section) { nullc++; continue; }
  const sec = byCode[c.section];
  if (!sec || sec.science_subject !== p.science_subject) { mismatch++; console.log(`q${p.problem_number}: ${c?.section} ✗subject`); continue; }
  if (GO) {
    const { error } = await sb.from("problems").update({ science_section_id: sec.section_id }).eq("problem_id", p.problem_id);
    if (error) { console.log(`q${p.problem_number}: ${error.message}`); continue; }
  }
  applied++;
}
console.log(`[${TAG}] ${GO ? "applied" : "would apply"}=${applied} null(skip)=${nullc} mismatch=${mismatch}`);
