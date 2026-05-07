import { readFileSync } from "node:fs";

const problemDoc = JSON.parse(readFileSync("source/_converted/problem.json", "utf8"));
const paragraphs = problemDoc.paragraphs;

// "문•제•편" / "문 제 편" 등 본문 시작 표지 위치 + 첫 chapter 1 위치 + 첫 problem 위치.
const CHAPTER_RE = /^제(\d+)장/;
const PROBLEM_RE = /^(\d{2})\s*['’]\s*(\d{2})/;
const PROBLEM_NO_YEAR_RE = /^(\d{2})\s*(모의|예상)/;

let bookHeaderIdx = -1;
let firstCh1Idx = -1;
let firstProblemIdx = -1;
const chapterEvents = [];
for (let i = 0; i < paragraphs.length; i++) {
  const t = (paragraphs[i].text ?? "").trim();
  if (!t) continue;
  if (bookHeaderIdx === -1 && /문\s*[•·]\s*제\s*[•·]\s*편/.test(t)) bookHeaderIdx = i;
  // 다른 marker 후보들
  const m = t.match(CHAPTER_RE);
  if (m) chapterEvents.push({ i, ch: parseInt(m[1], 10), text: t });
  if (firstCh1Idx === -1 && /^제\s*1\s*장\s*총칙/.test(t)) firstCh1Idx = i;
  if (firstProblemIdx === -1 && (PROBLEM_RE.test(t) || PROBLEM_NO_YEAR_RE.test(t))) firstProblemIdx = i;
}
console.log(`bookHeader "문•제•편" idx=${bookHeaderIdx}`);
console.log(`first 제1장 총칙 idx=${firstCh1Idx}`);
console.log(`first problem idx=${firstProblemIdx}`);

console.log(`\n--- 처음 30개 chapter events ---`);
for (const e of chapterEvents.slice(0, 30)) {
  console.log(`  [${e.i}] ch=${e.ch}  "${e.text.slice(0, 80)}"`);
}

console.log(`\n--- 처음 100 paragraph 미리보기 ---`);
let shown = 0;
for (let i = 0; i < paragraphs.length && shown < 100; i++) {
  const t = (paragraphs[i].text ?? "").trim();
  if (!t) continue;
  console.log(`[${i}] ${t.slice(0, 90)}`);
  shown++;
}
