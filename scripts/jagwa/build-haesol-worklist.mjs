// Build the 해설 generation work-list: 680 science past-exam problems lacking a draft,
// each with answer key (problem_choices.is_correct) + crop image absolute path.
// Writes per-(year,subject) batch files under .haesol/ and a batch index .haesol/_batches.json.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
const ROOT = "C:/project/lidamedu";
const CROPS = `${ROOT}/scripts/jagwa/.crops`;
const OUT = `${ROOT}/scripts/jagwa/.haesol`;
fs.mkdirSync(OUT, { recursive: true });

// year -> crop dir tag (2010 crops live at .crops root; others in per-tag subdirs)
const YEAR_TAG = {
  2010: null, 2011: "2011_48_B", 2012: "2012_49_A", 2013: "2013_50_A", 2014: "2014_51_A",
  2015: "2015_52_A", 2016: "2016_53_A", 2017: "2017_54_A", 2018: "2018_55_A", 2019: "2019_56_B",
  2020: "2020_57_A", 2021: "2021_58_B", 2022: "2022_59_A", 2023: "2023_60_A", 2024: "2024_61_A",
  2025: "2025_62_A", 2026: "2026_63_A",
};
const cropPath = (year, n) => {
  const f = `q${String(n).padStart(2, "0")}.png`;
  return YEAR_TAG[year] ? `${CROPS}/${YEAR_TAG[year]}/${f}` : `${CROPS}/${f}`;
};

const sql = `select p.problem_id, p.year, p.problem_number, p.science_subject::text subject,
  (select array_agg(c.choice_index order by c.choice_index) from problem_choices c where c.problem_id=p.problem_id and c.is_correct) answer_key
from problems p
where p.subject_type='science' and p.origin='past_exam' and p.exam_round='first'
  and not exists (select 1 from problem_explanation_drafts d where d.problem_id=p.problem_id)
order by p.year, p.science_subject, p.problem_number`;

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
if (!res.ok) { console.log("HTTP", res.status, await res.text()); process.exit(1); }
const rows = await res.json();

const batches = new Map();
const missingCrops = [];
for (const r of rows) {
  const cp = cropPath(r.year, r.problem_number);
  if (!fs.existsSync(cp)) missingCrops.push(`${r.year} q${r.problem_number} -> ${cp}`);
  const key = `${r.year}_${r.subject}`;
  if (!batches.has(key)) batches.set(key, { key, year: r.year, subject: r.subject, items: [] });
  batches.get(key).items.push({
    problem_id: r.problem_id, n: r.problem_number, subject: r.subject,
    cropPath: cp, answerKey: r.answer_key,
  });
}

const index = [];
for (const b of batches.values()) {
  const batchFile = `${OUT}/_batch_${b.key}.json`;
  fs.writeFileSync(batchFile, JSON.stringify(b, null, 2));
  index.push({ key: b.key, year: b.year, subject: b.subject, batchFile, count: b.items.length });
}
fs.writeFileSync(`${OUT}/_batches.json`, JSON.stringify(index, null, 2));

console.log(`problems needing 해설: ${rows.length}`);
console.log(`batches: ${index.length}`);
console.log(`missing crops: ${missingCrops.length}`);
if (missingCrops.length) console.log(missingCrops.slice(0, 20).join("\n"));
console.log(`wrote ${OUT}/_batches.json (+ ${index.length} batch files)`);
