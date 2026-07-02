// 2차 기출(주관식) HWPX 추출 JSON → 구조화 문제. (hwpx-to-text.mjs 출력 JSON 을 입력)
//   마커 【 A-1 】 (30점) 로 문제 분할, 박스(| 접두)는 blockquote 로, 하위문항 (N) ...(N점) 유지.
//   출력: [{ label, problemNumber, totalPoints, subjectiveKind, bodyMd }]
// 사용: node scripts/jagwa/parse-essay-2cha.mjs <extracted.json> [--subject 특허 --year 2013 --round 50]
import { readFileSync, writeFileSync } from "node:fs";

const jsonPath = process.argv[2];
const getArg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const j = JSON.parse(readFileSync(jsonPath, "utf8"));
const SEP_ROW = /^[\s|:\-]+$/;
const paras = (j.paragraphs || j)
  .map((p) => (p.text || "").trim())
  .filter((t) => t && !SEP_ROW.test(t)); // 표 구분행 단독 문단 제거

// 문제 마커 — 【 A-1 】(30점)(2010~2013) / 【 문제-1 】(30점)(2014~) 양식 모두 수용.
//   【 】 안 내용을 라벨로, 뒤 (N점)을 배점으로.
const MARKER = /^【\s*([^】]+?)\s*】\s*\(\s*(\d+)\s*점\s*\)/;

const SEP_ONLY = /^[\s|:\-]+$/; // 마크다운 표 구분행(| --- |)

// 박스(표/| 포함) → blockquote. 그 외는 그대로. 하위문항은 굵게 배점.
function fmtParagraph(t) {
  if (t.startsWith("|")) {
    let s = t
      .replace(/\|\s*-{2,}\s*\|/g, " ") // | --- | 구분행 제거
      .replace(/\|/g, " ") // 남은 파이프 제거
      .trim();
    // [명세서]/[청구범위] 헤더·제N항·실시예 N 앞에서 줄바꿈 → 읽기 쉽게
    // [헤더]·청구항(제N항, 단 "제N항에 있어서" 참조는 제외)·실시예 앞에서 줄바꿈.
    s = s
      .replace(/\s*(\[[^\]]+\]|제\s*\d+항(?!\s*에)|실시예\s*\d+(?=은|는|\s))\s*/g, "\n$1 ")
      .trim();
    return s
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x && !SEP_ONLY.test(x))
      .map((x) => `> ${x}`)
      .join("\n");
  }
  // (N점) → **(N점)** 강조
  return t.replace(/\((\d+)\s*점\)/g, "**($1점)**");
}

const problems = [];
let cur = null;
for (const t of paras) {
  const m = MARKER.exec(t);
  if (m) {
    if (cur) problems.push(cur);
    cur = {
      label: m[1].replace(/\s+/g, " ").trim(), // "A-1" 또는 "문제-1"
      totalPoints: Number(m[2]),
      lines: [],
    };
    continue;
  }
  if (cur) cur.lines.push(t);
}
if (cur) problems.push(cur);

const subject = getArg("subject", "");
const year = Number(getArg("year", "0"));
const round = Number(getArg("round", "0"));

const out = problems.map((p, i) => {
  const bodyMd = p.lines.map(fmtParagraph).join("\n\n");
  const hasBoxOrParty = /甲|乙|丙|\[명세서\]|\[청구|\[특허청구/.test(bodyMd);
  return {
    subject,
    year,
    examRoundNo: round,
    label: p.label,
    problemNumber: i + 1,
    totalPoints: p.totalPoints,
    subjectiveKind: hasBoxOrParty ? "case_based" : "theory",
    bodyMd,
  };
});

const outPath = jsonPath.replace(/\.json$/, ".parsed.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`문제 ${out.length}건 → ${outPath}`);
for (const p of out) {
  console.log(`\n===== ${p.label} (${p.totalPoints}점) [${p.subjectiveKind}] #${p.problemNumber} =====`);
  console.log(p.bodyMd.slice(0, 600));
}
