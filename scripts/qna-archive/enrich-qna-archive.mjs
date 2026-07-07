// feat-9-010 ② — 고도화: 정제 + 타깃 자동 매핑 (규칙 기반, DB 읽기 전용)
// 입력: source/_converted/qna-archive.json → 출력: qna-archive-enriched.json + 리포트
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const ROOT = resolve(import.meta.dirname, "../..");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { entries } = JSON.parse(readFileSync(resolve(ROOT, "source/_converted/qna-archive.json"), "utf8"));

const LAW_IDS = { patent: "c19c719c-3631-475c-8353-f5a2b7514714", trademark: "c5f67968-7b8a-45ea-86d8-c748040afb99", design: "afede9be-f47c-48a7-9219-dd09d1122210" };

async function fetchAll(table, select, filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).range(from, from + 999);
    q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// ── 조문 사전: law_code → (정규화 번호 → article_id) ─────────────────────────
const articleMap = {};
for (const [code, lawId] of Object.entries(LAW_IDS)) {
  const rows = await fetchAll("articles", "article_id, article_number", (q) =>
    q.eq("law_id", lawId).eq("level", "article").is("deleted_at", null),
  );
  articleMap[code] = new Map(rows.map((r) => [r.article_number.replace(/\s+/g, ""), r.article_id]));
}
// ── 기출 사전: law_code → (year|round|번호 → problem_id) ─────────────────────
const problemMap = {};
for (const [code, lawId] of Object.entries(LAW_IDS)) {
  const rows = await fetchAll("problems", "problem_id, year, exam_round, problem_number", (q) =>
    q.eq("law_id", lawId).eq("origin", "past_exam").not("year", "is", null).is("deleted_at", null),
  );
  const m = new Map();
  for (const r of rows) {
    const k = `${r.year}|${r.exam_round}|${r.problem_number}`;
    m.set(k, m.has(k) ? "AMBIG" : r.problem_id);
  }
  problemMap[code] = m;
}
// ── 판례 사전: law_code → (case_number → case_id) ────────────────────────────
const caseMap = {};
for (const code of Object.keys(LAW_IDS)) {
  const rows = await fetchAll("cases", "case_id, case_number", (q) =>
    q.eq("subject_laws", `{${code}}`).is("deleted_at", null),
  );
  const m = new Map();
  for (const r of rows) m.set(r.case_number.replace(/\s+/g, ""), m.has(r.case_number.replace(/\s+/g, "")) ? "AMBIG" : r.case_id);
  caseMap[code] = m;
}

// 조문 표기 정규화: "제66조의 2"/"98조"/"132의17"/"136조2항" → "66의2"/"98"/"132의17"/"136"
function normArticleNo(raw) {
  const t = (raw ?? "").replace(/\s+/g, "");
  const m = /^제?(\d+)(?:조)?(?:의(\d+))?/.exec(t);
  if (!m) return null;
  return m[2] ? `${m[1]}의${m[2]}` : m[1];
}
// 제목/본문에서 조문 추출 — "제N조(의M)" 우선, 없으면 "N조(의M)"(제 생략) 허용.
//   질문 앞 200자까지. "N조" 뒤에 항/호/문장경계가 오는 도메인 특성상 오탐 낮음.
function extractArticleNo(e) {
  for (const src of [e.title ?? "", e.question.slice(0, 200)]) {
    let m = /제(\d+)조(?:의\s*(\d+))?/.exec(src);
    if (!m) m = /(?:^|[\s\[(,])(\d+)조(?:의\s*(\d+))?/.exec(src);
    if (m) return m[2] ? `${m[1]}의${m[2]}` : m[1];
  }
  return null;
}
// 기출 연도+번호 추출: "2019년 기출 4번", "19년 7번", "2014 변시 2번" 등.
//   연도("년" 표기 또는 4자리) + 12자 내 "N번" — 키워드는 선택.
function extractExamRef(e) {
  const src = `${e.title ?? ""} ${e.question.slice(0, 250)}`;
  let m = /(\d{4}|\d{2})\s*년\s*(?:도)?[^\d]{0,12}(\d{1,2})\s*번/.exec(src);
  if (!m) m = /(20\d{2})[^\d]{0,12}(\d{1,2})\s*번/.exec(src);
  if (!m) return null;
  let y = +m[1];
  if (y < 100) y += 2000;
  if (y < 2004 || y > 2026) return null;
  return { year: y, no: +m[2] };
}
const CASE_NO_RE = /(\d{2,4})\s*(후|허|도|다|마|그)\s*(\d{2,6})/;

const out = [];
const stats = { article: 0, articleFromText: 0, problem: 0, problemAmbig: 0, case: 0, fallback: 0, dropNoAnswer: 0, preRevision: 0 };
const samples = { article: [], problem: [], case: [], fallback: [] };

for (const e of entries) {
  if (!e.answer) { stats.dropNoAnswer++; continue; } // 답변 없는 행 제외(원본 JSON에는 보존)
  const subject = e.subject;
  let target_type = "study_method", target_id = null, mapNote = null;

  // 1) 판례 분류 → 사건번호
  if (e.category === "판례") {
    const m = CASE_NO_RE.exec(`${e.title ?? ""} ${e.question.slice(0, 300)}`);
    const id = m ? caseMap[subject]?.get(`${m[1]}${m[2]}${m[3]}`) : null;
    if (id && id !== "AMBIG") { target_type = "case"; target_id = id; stats.case++; }
  }
  // 2) 문제 분류 → 기출 연도+번호 (1차 우선, 유일 매칭만)
  if (target_type === "study_method" && e.category === "문제") {
    const ref = extractExamRef(e);
    if (ref) {
      const first = problemMap[subject]?.get(`${ref.year}|first|${ref.no}`);
      if (first === "AMBIG") stats.problemAmbig++;
      else if (first) { target_type = "problem"; target_id = first; stats.problem++; mapNote = `${ref.year} 1차 ${ref.no}번`; }
    }
  }
  // 3) 조문 — targetHint 우선, 없으면 제목/본문 추출
  //    ★실용신안법 질문은 특허법 조문 번호와 체계가 달라 조문 매핑 제외(과목 일반 폴백)
  const isUtility = e.subjectRaw === "실용신안법" || /실용신안법/.test(e.sourceFile);
  if (target_type === "study_method" && !isUtility) {
    let no = e.targetHint ? normArticleNo(e.targetHint) : null;
    let fromText = false;
    if (!no) { no = extractArticleNo(e); fromText = !!no; }
    const id = no ? articleMap[subject]?.get(no) : null;
    if (id) {
      target_type = "article"; target_id = id;
      stats.article++;
      if (fromText) stats.articleFromText++;
      mapNote = `제${no.replace("의", "조의")}${no.includes("의") ? "" : "조"}`;
    }
  }
  if (target_type === "study_method") stats.fallback++;
  const preRevision = !!e.askedAt && e.askedAt < "2017-01-01";
  if (preRevision) stats.preRevision++;
  const rec = { ...e, target_type, target_id, mapNote, preRevision };
  out.push(rec);
  const s = samples[target_type === "study_method" ? "fallback" : target_type];
  if (s && s.length < 6) s.push(`[${subject}/${e.category}] ${(e.title ?? e.question).slice(0, 55)} → ${mapNote ?? target_type}`);
}

writeFileSync(resolve(ROOT, "source/_converted/qna-archive-enriched.json"), JSON.stringify({ entries: out }, null, 1));

console.log(`정제 후 ${out.length}건 (답변 없음 제외 ${stats.dropNoAnswer})`);
console.log(`타깃 매핑: 조문 ${stats.article} (본문 추출 ${stats.articleFromText}) / 문제 ${stats.problem} (동점 보류 ${stats.problemAmbig}) / 판례 ${stats.case} / 과목 일반 ${stats.fallback}`);
console.log(`2017년 이전(pre_revision 플래그): ${stats.preRevision}`);
const bySubjectType = {};
for (const r of out) bySubjectType[`${r.subject}/${r.target_type}`] = (bySubjectType[`${r.subject}/${r.target_type}`] || 0) + 1;
console.log("과목×타깃:", JSON.stringify(bySubjectType, null, 1));
for (const [k, arr] of Object.entries(samples)) {
  console.log(`\n샘플 ${k}:`);
  arr.forEach((x) => console.log("  " + x));
}
