// 진단: HWP 원본 텍스트(precedents_raw.txt)의 판례 헤더 전수 추출 →
// precedents.json 에 빠진 항목을 찾는다.
// parse-hwp-text.mjs 의 RE_CASE_HEAD 가 놓친 헤더 변형:
//   ① 전원합의체  ② 법원명 누락(서울민사지방법원 등)
//   ③ 축약 병합번호(,2880)  ④ 사건유형 괄호 변형([..] / 무괄호 / 없음)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const lines = readFileSync(
  resolve("source/_converted/precedents_raw.txt"),
  "utf-8",
).split(/\r?\n/);
const json = JSON.parse(
  readFileSync(resolve("source/_converted/precedents.json"), "utf-8"),
);

// 헤더 = ^{seq} {법원} {날짜} (선고|자)? {사건번호} {tail}
const RE_HEAD =
  /^(?<seq>\d+)\s+(?<court>[가-힣]+(?:법원|재판소|심판원)|헌재)\s+(?<y>\d{4})\.\s*(?<mo>\d{1,2})\.\s*(?<da>\d{1,2})\.\s*(?:선고|자)?\s*(?<caseNo>\d{2,4}[가-힣]+\d+)(?<tail>.*)$/;

function caseTypeFromTail(tail) {
  let m = tail.match(/【([^】]+)】/);
  if (m) return m[1].trim();
  m = tail.match(/\[([^\]]+)\]/);
  if (m) return m[1].trim();
  const t = tail
    .replace(/,\s*\d+/g, "")
    .replace(/전원합의체|판결|결정|심결|선고|자|파기환송|파기자판/g, "")
    .replace(/\(병합\)/g, "")
    .trim();
  return t || null;
}

const headers = [];
for (const raw of lines) {
  const s = raw.replace(/&#9642;/g, "▪").trim();
  const m = s.match(RE_HEAD);
  if (!m) continue;
  const g = m.groups;
  headers.push({
    seq: Number(g.seq),
    court: g.court,
    date: `${g.y}-${String(+g.mo).padStart(2, "0")}-${String(+g.da).padStart(2, "0")}`,
    caseNumber: g.caseNo,
    caseType: caseTypeFromTail(g.tail),
    isEnBanc: /전원합의체/.test(g.tail),
    line: s.slice(0, 130),
  });
}

const byNum = new Map();
for (const h of headers) {
  if (!byNum.has(h.caseNumber)) byNum.set(h.caseNumber, []);
  byNum.get(h.caseNumber).push(h);
}
const dups = [...byNum.entries()].filter(([, v]) => v.length > 1);
const jsonNums = new Set(json.map((x) => x.caseNumber));
const missingNums = [...byNum.keys()].filter((n) => !jsonNums.has(n));

console.log(`총 헤더 라인        : ${headers.length}`);
console.log(`고유 사건번호       : ${byNum.size}`);
console.log(`precedents.json 항목: ${json.length}`);
console.log(`\n중복 사건번호(헤더 2회 이상): ${dups.length}`);
for (const [n, v] of dups) {
  console.log(`  ${n} ×${v.length} — seq ${v.map((x) => x.seq).join(", ")}`);
}
console.log(`\n=== precedents.json 누락 사건번호: ${missingNums.length} ===`);
for (const n of missingNums) {
  for (const h of byNum.get(n)) {
    console.log(
      `  #${h.seq}\t${h.court}\t${h.date}\t${h.caseNumber}\t유형:${h.caseType ?? "(없음)"}\t전합:${h.isEnBanc ? "Y" : "N"}`,
    );
  }
}

// 정상성 점검 — json 의 caseNumber 가 헤더에 없는가 (오파싱 검출).
const headerNums = new Set(byNum.keys());
const jsonOnly = json.filter((x) => !headerNums.has(x.caseNumber));
console.log(`\n헤더에 없는 json 항목(오파싱 의심): ${jsonOnly.length}`);
for (const x of jsonOnly) console.log(`  ${x.caseNumber} ${x.court}`);

// 헤더후보지만 RE_HEAD 미매칭 (놓친 변형 검출).
const unmatched = [];
for (const raw of lines) {
  const s = raw.replace(/&#9642;/g, "▪").trim();
  if (
    /^\d+\s+[가-힣]/.test(s) &&
    /\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\./.test(s) &&
    !RE_HEAD.test(s)
  ) {
    unmatched.push(s.slice(0, 120));
  }
}
console.log(`\nRE_HEAD 미매칭 헤더후보: ${unmatched.length}`);
for (const s of unmatched) console.log("  >>", s);
