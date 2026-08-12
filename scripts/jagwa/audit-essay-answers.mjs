// 2차 주관식 모범답안·채점기준 안전망 — DB 저장본을 대상으로 인용·표기·분량을 일괄 점검.
//
// 수험생에게 노출되는 콘텐츠이므로 "그럴듯한 서술"이 검증 없이 남는 것을 막는 것이 목적이다.
// 다음을 검사한다.
//   [FAIL] 판례 사건번호가 cases DB 에 없거나 soft-delete 됨      → 인용 금지(사건번호 없이 법리만 서술)
//   [FAIL] § 조문 번호가 현행 특허법 조문에 없음                   → 구법 번호 잔존·오변환 의심
//   [FAIL] 표기 규칙 위반(표·##### 헤딩·불릿·평문 N)·폐기 조어·본문 §·원문자 괄호 누락)
//   [FAIL] 배점당 자수 상한(200자/점) 초과 — 설문별 및 전체
//   [WARN] 근거 없는 단정형 서술 — "판례는/종전 판례는/통설은" 이 있는 문단에 사건번호가 없음
//          (DB 미수록 판례를 사건번호 없이 서술하는 것은 허용되므로 사람이 확인할 목록으로만 제시)
//
//   node scripts/jagwa/audit-essay-answers.mjs 9d46a510 360db73d      # 문항 접두어 지정
//   node scripts/jagwa/audit-essay-answers.mjs --year 2015            # 연도 전체
//   node scripts/jagwa/audit-essay-answers.mjs --all                  # 답안이 있는 전 문항
//
// 종료코드: FAIL 이 하나라도 있으면 1.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import AdmZip from "adm-zip";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const argv = process.argv.slice(2);
const ALL = argv.includes("--all");
const yearIdx = argv.indexOf("--year");
const YEAR = yearIdx >= 0 ? Number(argv[yearIdx + 1]) : null;
const KEYS = argv.filter((a) => !a.startsWith("--") && a !== String(YEAR));

const CHARS_PER_POINT = 200; // 배점당 자수 상한
// § 바로 앞에 타법명(축약형 포함)이 붙어 있으면 그 법의 조문이므로 대조 대상이 아니다.
//   예) 민소§451①(8) · 민§766 · 民 §404 · 민집§300② · 민사집행법 §300
const OTHER_LAW_PREFIX =
  /(민사소송법|민사집행법|행정소송법|형사소송법|저작권법|공정거래법|실용신안법|상표법|디자인보호법|파리조약|민사소송|민사집행|민소|민집|행소|형소|민법|민|民訴|民|형법)\s*$/;
// 구법 조문을 의도적으로 병기한 경우와, 채점기준의 "존재하지 않는 조문(예: …)" 감점 예시는 제외한다.
const OLD_LAW_HINT = /(구\s*법?|종전)\s*$/;
const NONEXISTENT_HINT = /존재하지 않는 조문/;
const CASE_RE = /\b(\d{2,4}(?:후|다|허|마|카|누|두|므|재|그|나|하|가합|가단)\d{1,6})\b/g;
// "사안의 해결"은 대목차 표제로 쓰이므로 폐기 대상에서 제외한다(2026-08-10 원장 결정).
// ★'소결'은 '취소결정'처럼 다른 낱말 속에 묻힌 경우가 있으므로 낱말 경계로 판정한다
const DROPPED_TERMS = ["논점의 정리", "소설문", "대판", "치환가능성", "치환용이성", "치환자명성"];
const DROPPED_PATTERNS = [[/(?<![가-힣])소결(론)?(?![가-힣])/, "소결"]];
// 강학상 분류용어 — 법령·판례가 쓰지 않는 학설상 명칭이므로 답안에 쓰지 않는다(법리는 요건·효과로 서술)
const ACADEMIC_TERMS = ["주합발명", "조합발명"];

// ── 판례 DB (사건번호 → 유효 여부) ───────────────────────────────
const caseOk = new Map();
for (let from = 0; ; from += 1000) {
  const { data, error } = await supa
    .from("cases")
    .select("case_id, case_number, deleted_at")
    .order("case_id") // ★ 유일 정렬키 없이 range 페이징하면 행이 누락·중복된다
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  for (const c of data) caseOk.set(c.case_number, (caseOk.get(c.case_number) ?? false) || !c.deleted_at);
  if (data.length < 1000) break;
}

// ── 법률별 현행 조문 번호 (§ 약호는 그 문항이 속한 법의 조문을 뜻한다) ──
const { data: laws } = await supa.from("laws").select("law_id, law_code");
const lawCodeById = new Map(laws.map((l) => [l.law_id, l.law_code]));
const articlesByLaw = new Map(laws.map((l) => [l.law_id, new Set()]));
for (let from = 0; ; from += 1000) {
  const { data, error } = await supa
    .from("articles")
    .select("article_id, law_id, article_number")
    .eq("level", "article")
    .is("deleted_at", null)
    .order("article_id") // ★ 유일 정렬키 필수
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  for (const a of data) articlesByLaw.get(a.law_id)?.add(String(a.article_number));
  if (data.length < 1000) break;
}
// ── 교재 코퍼스 ────────────────────────────────────────────────
// 기본서·강의노트에 실린 사건번호는 cases DB 에 없어도 인용을 허용한다(2026-08-09 원장 지시).
// 교재에도 없는 번호만 출처 불명으로 보아 FAIL 로 잡는다.
const bookParts = [];
if (existsSync("tmp/patent-book25.txt")) bookParts.push(readFileSync("tmp/patent-book25.txt", "utf8"));
for (const f of ["tmp/book-corpus/trademark-chunks.json", "tmp/book-corpus/design-chunks.json"]) {
  if (existsSync(f)) bookParts.push(JSON.parse(readFileSync(f, "utf8")).map((c) => c.text ?? c.body ?? "").join("\n"));
}
const NOTE_DIR = "source/특허법/특허법 강의노트";
if (existsSync(NOTE_DIR)) {
  for (const f of readdirSync(NOTE_DIR).filter((x) => x.endsWith(".pptx"))) {
    const zip = new AdmZip(`${NOTE_DIR}/${f}`);
    for (const e of zip.getEntries().filter((x) => /slide\d+\.xml$/.test(x.entryName))) {
      bookParts.push([...e.getData().toString("utf8").matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" "));
    }
  }
}
// 강의노트는 "2012 다 42666" 처럼 공백이 끼어 있어 공백을 제거하고 대조한다.
const BOOK = bookParts.join("\n").replace(/\s+/g, "");
const inBook = (n) => BOOK.includes(n);
// 국가법령정보센터에서 실재를 확인한 사건번호 — cases DB·교재에 없어도 인용을 허용한다.
const VERIFIED = existsSync("scripts/jagwa/verified-case-numbers.json")
  ? new Set(Object.keys(JSON.parse(readFileSync("scripts/jagwa/verified-case-numbers.json", "utf8"))).filter((k) => !k.startsWith("_")))
  : new Set();

// 판례 DB 에 실제로 적재된 과목만 사건번호 대조를 강제한다(민사소송법 판례는 미적재).
const CASE_CHECKED_LAWS = new Set(["patent", "trademark", "design"]);

// ── 대상 문항 ────────────────────────────────────────────────────
let q = supa
  .from("problems")
  .select("problem_id, law_id, year, problem_number, total_points, body_md, model_answer_md, grading_rubric_md")
  .eq("format", "subjective");
if (YEAR) q = q.eq("year", YEAR);
const { data: all, error } = await q.order("year").order("problem_number");
if (error) throw new Error(error.message);

const targets = ALL || YEAR ? all.filter((p) => (p.model_answer_md || "").length > 0) : KEYS.map((k) => {
  const p = all.find((x) => x.problem_id.startsWith(k));
  if (!p) throw new Error(`문항 없음: ${k}`);
  return p;
});
if (!targets.length) {
  console.log("대상 문항이 없습니다. 사용법은 파일 상단 주석 참고.");
  process.exit(0);
}

// ── 검사 ─────────────────────────────────────────────────────────
function checkNotation(md) {
  const bad = [];
  if (/^\|/m.test(md)) bad.push("표");
  if (/^#####/m.test(md)) bad.push("##### 헤딩");
  if (/^\s*-\s/m.test(md)) bad.push("불릿 목록");
  if (/^\s*\d+\)\s/m.test(md)) bad.push("평문 N) 시작 줄");
  if (/^[①-⑳]\s\*\*(?!\()/m.test(md)) bad.push("원문자 제목 괄호 누락");
  for (const t of DROPPED_TERMS) if (md.includes(t)) bad.push(`폐기 표기 '${t}'`);
  for (const [re, t] of DROPPED_PATTERNS) if (re.test(md)) bad.push(`폐기 표기 '${t}'`);
  for (const t of ACADEMIC_TERMS) if (md.includes(t)) bad.push(`강학상 용어 '${t}'`);
  for (const line of md.split("\n")) {
    let depth = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "(") depth++;
      else if (c === ")") depth = Math.max(0, depth - 1);
      else if (c === "§" && depth === 0) {
        bad.push(`본문 § — ${line.slice(Math.max(0, i - 16), i + 8).trim()}`);
        break;
      }
    }
  }
  return [...new Set(bad)];
}

// 넘버링 규칙: ## Ⅰ. → ### 1. → #### (1) → 원문자 인라인.
// `### N.` 바로 아래에 `#### (n)` 없이 줄머리 원문자가 오는 것은 한 단계를 건너뛴 것이다.
function checkNumbering(md) {
  const bad = [];
  const lines = md.split("\n");
  let cur = null; // { title, hasSub, circleAt }
  const flush = () => {
    if (cur && !cur.hasSub && cur.circleAt) bad.push(`${cur.title} — (1) 없이 원문자 시작`);
    cur = null;
  };
  for (const line of lines) {
    if (/^###\s/.test(line)) {
      flush();
      cur = { title: line.replace(/^#+\s*/, "").slice(0, 24), hasSub: false, circleAt: null };
    } else if (/^##\s/.test(line)) {
      flush();
    } else if (cur) {
      if (/^####\s*\(/.test(line)) cur.hasSub = true;
      else if (/^[①-⑳]\s/.test(line) && !cur.circleAt) cur.circleAt = line.slice(0, 20);
    }
  }
  flush();
  return bad;
}

function checkCases(md) {
  const missing = new Set();
  for (const m of md.matchAll(CASE_RE)) {
    const n = m[1];
    if (inBook(n) || VERIFIED.has(n)) continue; // 교재(기본서·강의노트)에 실린 사건번호는 허용
    if (!caseOk.has(n)) missing.add(`${n} (DB·교재 모두 미수록)`);
    else if (!caseOk.get(n)) missing.add(`${n} (DB 삭제·교재 미수록)`);
  }
  return [...missing];
}

function checkArticles(md, lawId) {
  const own = articlesByLaw.get(lawId);
  if (!own || !own.size) return []; // 조문 미적재 법률은 대조 생략
  const missing = new Set();
  for (const m of md.matchAll(/§\s*(\d+)(의\d+)?/g)) {
    const before = md.slice(Math.max(0, m.index - 40), m.index);
    // "민법 §271, §704" 처럼 나열된 경우 뒤쪽 조문에는 법명이 붙지 않으므로, 앞의 조문 나열을 걷어내고 본다.
    const stripped = before.replace(/(?:§\s*\d+(?:의\d+)?\s*[①-⑳]*(?:\([^)]*\))?\s*[,·、]?\s*)+$/, "");
    // "부당이득의 민법 요건(§741)" 처럼 법명과 § 사이에 몇 글자가 끼는 경우도 타법 조문으로 본다.
    const nearLaw = /(?:^|[^가-힣])(민사소송법|민사집행법|행정소송법|형사소송법|저작권법|공정거래법|실용신안법|상표법|디자인보호법|파리조약|민소|민집|행소|형소|민법|형법|民)[^§]{0,12}$/;
    if (OTHER_LAW_PREFIX.test(before) || OTHER_LAW_PREFIX.test(stripped) || nearLaw.test(before)) continue; // 타법 조문
    const wide = md.slice(Math.max(0, m.index - 200), m.index);
    if (OLD_LAW_HINT.test(before) || /구\s*법[^\n]{0,200}$/.test(wide)) continue; // 구법 조문 병기
    if (NONEXISTENT_HINT.test(wide)) continue; // 감점 예시로 든 가상의 조문
    const num = m[2] ? `${m[1]}${m[2]}` : m[1];
    if (!own.has(num)) missing.add(`§${num}`);
  }
  return [...missing];
}

function checkUngrounded(md) {
  const hits = [];
  for (const para of md.split(/\n{2,}/)) {
    if (/^#{1,4}\s/.test(para.trim())) continue; // 헤딩 줄은 서술이 아님
    if (!/판례는|종전 판례|판례의 태도|통설/.test(para)) continue;
    if (CASE_RE.test(para)) { CASE_RE.lastIndex = 0; continue; }
    CASE_RE.lastIndex = 0;
    hits.push(para.replace(/\s+/g, " ").slice(0, 70) + "…");
  }
  return hits;
}

function checkLength(p, md) {
  const out = [];
  const pts = [...(p.body_md || "").matchAll(/\*\*\((\d+)점\)\*\*/g)].map((m) => Number(m[1]));
  // 설문 분할 = '## Ⅰ. 설문' 헤딩 기준 (--- 구분자 유무 무관 — 구분자 없는 답안이 다수라
  // --- split 방식은 전체가 설문(1)로 뭉쳐 허위 FAIL 을 만들었다).
  const heads = [...md.matchAll(/^## [ⅠⅡⅢⅣⅤⅥⅦ]+\.\s*설문.*$/gm)];
  const secs = heads.map((m, i) =>
    md.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : md.length),
  );
  // 배점 = 설문 헤딩 자체의 "(N점)" 우선. 없으면 발문 배점 마커와 개수가 일치할 때만
  // 순서 짝짓기 — 발문에 소문항 배점이 섞이면(개수 불일치) 잘못 짝짓지 말고 건너뛴다.
  const headPts = heads.map((m) => {
    const mm = m[0].match(/\((\d+)점\)/);
    return mm ? Number(mm[1]) : null;
  });
  const positionalOk = secs.length === pts.length;
  secs.forEach((s, i) => {
    const pt = headPts[i] ?? (positionalOk ? pts[i] : null);
    if (!pt) return;
    const per = s.length / pt;
    out.push({
      label: `설문(${i + 1}) ${s.length}자 / ${pt}점 = ${per.toFixed(0)}자/점`,
      fail: per > CHARS_PER_POINT,
    });
  });
  const per = md.length / p.total_points;
  out.push({ label: `전체 ${md.length}자 / ${p.total_points}점 = ${per.toFixed(0)}자/점`, fail: per > CHARS_PER_POINT });
  return out;
}

let failCount = 0;
for (const p of targets) {
  const md = p.model_answer_md || "";
  const rubric = p.grading_rubric_md || "";
  const head = `${p.year} 문제${p.problem_number} ${p.problem_id.slice(0, 8)}`;
  const fails = [];
  const warns = [];

  const lawCode = lawCodeById.get(p.law_id) ?? "(미상)";
  for (const [name, text] of [["답안", md], ["채점기준", rubric]]) {
    if (!text) continue;
    const c = checkCases(text);
    if (c.length) {
      const line = `${name} 판례 인용: ${c.join(", ")}`;
      if (CASE_CHECKED_LAWS.has(lawCode)) fails.push(line);
      else warns.push(`${line} — ${lawCode} 판례는 DB 미적재 과목이므로 사람이 확인`);
    }
    const a = checkArticles(text, p.law_id);
    if (a.length) fails.push(`${name} 조문 인용(현행 ${lawCode} 조문에 없음): ${a.join(", ")}`);
  }
  const n = checkNotation(md);
  if (n.length) fails.push(`답안 표기 규칙: ${n.join(" / ")}`);
  const num = checkNumbering(md);
  if (num.length) fails.push(`답안 넘버링 규칙: ${num.join(" / ")}`);
  const lens = checkLength(p, md);
  for (const l of lens) if (l.fail) fails.push(`분량 상한 초과 — ${l.label}`);
  warns.push(...checkUngrounded(md).map((h) => `근거 사건번호 없는 판례 서술: ${h}`));

  const mark = fails.length ? "✗" : "✓";
  console.log(`\n${mark} ${head}`);
  for (const l of lens) console.log(`    ${l.fail ? "✗" : "·"} ${l.label}`);
  for (const f of fails) console.log(`    [FAIL] ${f}`);
  for (const w of warns) console.log(`    [WARN] ${w}`);
  if (fails.length) failCount++;
}

console.log(`\n대상 ${targets.length}문항 · FAIL ${failCount}문항`);
if (failCount) process.exitCode = 1;
