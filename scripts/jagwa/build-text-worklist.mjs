// 자연과학 이미지지문→텍스트 전사 워크리스트.
// 680 문항을 (연도,과목) 배치로 묶고 각 문항의 크롭 이미지 절대경로를 적는다.
// 워크플로우 에이전트가 .txwork/{key}.json 을 Read → 이미지 Read(비전) → .text/{key}.json 작성.
import "dotenv/config";
import fs from "node:fs";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
const ROOT = "C:/project/lidamedu";
const CROPS = `${ROOT}/scripts/jagwa/.crops`;
const OUT = `${ROOT}/scripts/jagwa/.txwork`;
fs.mkdirSync(OUT, { recursive: true });

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

const sql = `select p.problem_id, p.year, p.problem_number, p.science_subject::text subject
from problems p
where p.subject_type='science' and p.origin='past_exam' and p.exam_round='first'
order by p.year, p.science_subject, p.problem_number`;

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
if (!res.ok) { console.log("HTTP", res.status, await res.text()); process.exit(1); }
const rows = await res.json();

const batches = new Map();
const missing = [];
for (const r of rows) {
  const cp = cropPath(r.year, r.problem_number);
  if (!fs.existsSync(cp)) missing.push(`${r.year} q${r.problem_number} -> ${cp}`);
  const key = `${r.year}_${r.subject}`;
  if (!batches.has(key)) batches.set(key, { key, year: r.year, subject: r.subject, items: [] });
  batches.get(key).items.push({ problem_id: r.problem_id, n: r.problem_number, cropPath: cp });
}

const index = [];
for (const b of batches.values()) {
  const bf = `${OUT}/${b.key}.json`;
  fs.writeFileSync(bf, JSON.stringify(b, null, 2));
  index.push({ key: b.key, year: b.year, subject: b.subject, count: b.items.length, batchFile: bf });
}
fs.writeFileSync(`${OUT}/_batches.json`, JSON.stringify(index, null, 2));

console.log(`problems: ${rows.length} | batches: ${index.length} | missing crops: ${missing.length}`);
if (missing.length) console.log(missing.slice(0, 10).join("\n"));
console.log(`wrote ${OUT}/_batches.json (+ ${index.length} batch files)`);
