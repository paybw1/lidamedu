// 단원 미매핑(null) 문항 수동 검수 결과 적용 (OCR 발문 판독 기반). --go 로 기록.
// 2022 q1-4 는 시험 유의사항 페이지가 잘못 크롭된 것 → 제외(별도 재적재로 수정).
import { adminClient } from "./db.mjs";

const GO = process.argv.includes("--go");
const sb = adminClient();

// year -> { problem_number: science_sections.code } (발문 판독으로 분류)
const MAP = {
  2011: { 17: "chem.organic", 23: "bio.cell", 27: "bio.physiology", 31: "earth.geology", 36: "earth.astro", 40: "earth.geology" },
  2012: { 8: "phy.mech", 23: "bio.cell", 28: "bio.physiology", 29: "bio.genetics", 39: "earth.geology" },
  2013: { 12: "chem.organic", 18: "chem.atom", 22: "bio.physiology", 30: "bio.evolution", 31: "earth.geology" },
  2014: { 18: "chem.organic" },
  2015: { 14: "chem.atom" },
  2016: { 18: "chem.atom" },
  2017: { 20: "chem.organic", 33: "earth.geology", 34: "earth.geology" },
  2018: { 11: "chem.atom", 30: "bio.evolution" },
  2019: { 13: "chem.atom", 19: "chem.organic", 27: "bio.physiology", 28: "bio.ecology", 30: "bio.ecology" },
  2020: { 28: "bio.genetics" },
  2021: { 25: "bio.physiology" },
  2022: { 16: "chem.atom", 21: "bio.cell", 27: "bio.genetics", 38: "earth.geology" }, // q1-4 = 유의사항(재적재로 수정)
  2023: { 4: "phy.thermo", 30: "bio.evolution", 32: "earth.geology" },
  2024: { 35: "earth.geology" },
  2025: { 18: "chem.organic" },
  2026: { 30: "bio.cell" },
};

const { data: secs } = await sb.from("science_sections").select("section_id, code, science_subject");
const byCode = Object.fromEntries(secs.map((s) => [s.code, s]));

let applied = 0, miss = 0;
for (const [year, qmap] of Object.entries(MAP)) {
  for (const [pn, code] of Object.entries(qmap)) {
    const sec = byCode[code];
    const { data: prob } = await sb.from("problems").select("problem_id, science_subject")
      .eq("year", Number(year)).eq("subject_type", "science").eq("origin", "past_exam").eq("exam_round", "first").eq("problem_number", Number(pn)).maybeSingle();
    if (!prob) { console.log(`${year} q${pn}: problem not found`); miss++; continue; }
    if (sec.science_subject !== prob.science_subject) { console.log(`${year} q${pn}: ${code} subj mismatch (${prob.science_subject})`); miss++; continue; }
    if (GO) {
      const { error } = await sb.from("problems").update({ science_section_id: sec.section_id }).eq("problem_id", prob.problem_id);
      if (error) { console.log(`${year} q${pn}: ${error.message}`); miss++; continue; }
    }
    applied++;
  }
}
console.log(`${GO ? "applied" : "would apply"}=${applied} miss=${miss}`);
