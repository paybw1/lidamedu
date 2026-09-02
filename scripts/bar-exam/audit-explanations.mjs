// 변호사시험 해설 안전망 — 마크다운 해설을 대상으로 인용·표기를 점검.
//
// jagwa/audit-essay-answers.mjs 와 같은 취지지만 대상이 다르다. 저쪽은 DB(problems)의
// 2차 모범답안을, 이쪽은 파일로 쓰는 변호사시험 해설을 본다.
//
//   [FAIL] 사건번호가 cases / case_lower_courts 어디에도 없음 → 인용 금지
//   [FAIL] 특허법 조문 번호가 현행법에 없음                    → 구법 번호·오기 의심
//   [FAIL] 폐기 조어 · 강학상 분류용어 사용
//   [WARN] 근거 없는 단정형 서술 — "판례는/통설은" 이 있는 문단에 사건번호가 없음
//          (DB 미수록 판례를 번호 없이 서술하는 것은 허용되므로 사람이 볼 목록으로만)
//
// ★배점당 자수 상한은 검사하지 않는다 — 그건 답안지(모범답안) 제약이고 해설에는
//   맞지 않는다. 대신 길이는 참고로만 출력한다.
//
//   node scripts/bar-exam/audit-explanations.mjs docs/bar-exam/해설/*.md
import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CASE_RE = /\b(\d{2,4}(?:후|다|허|마|카|누|두|므|재|그|나|하|가합|가단)\d{1,6})\b/g;
const DROPPED_TERMS = ["논점의 정리", "소설문", "대판", "치환가능성", "치환용이성", "치환자명성"];
const DROPPED_PATTERNS = [[/(?<![가-힣])소결(론)?(?![가-힣])/, "소결"]];
const ACADEMIC_TERMS = ["주합발명", "조합발명"];
const ASSERTION_RE = /(판례는|판례의 태도|종전 판례는|통설은|다수설은)/;

const files = process.argv.slice(2);
if (!files.length) {
  console.error("사용: node scripts/bar-exam/audit-explanations.mjs <해설.md ...>");
  process.exit(1);
}

// ── 현행 특허법 조문 목록 ───────────────────────────────────────────────
const A = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const search = await (
  await fetch(
    "https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=law&type=JSON&display=100&search=1&query=" +
      encodeURIComponent("특허법"),
  )
).json();
const hit = A(search?.LawSearch?.law)
  .filter((x) => x.법령명한글 === "특허법")
  .find((x) => x.현행연혁코드 === "현행");
const detail = await (
  await fetch(
    `https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&type=JSON&MST=${hit.법령일련번호}`,
  )
).json();
const ARTICLES = new Set(
  A(detail?.법령?.조문?.조문단위)
    .filter((a) => a.조문여부 === "조문")
    .map((a) => {
      const b = String(a.조문가지번호 ?? "").trim();
      return b && b !== "0" ? `${String(a.조문번호).trim()}의${b}` : String(a.조문번호).trim();
    }),
);
console.log(`현행 특허법 조문 ${ARTICLES.size}개 로드 (시행 ${hit.시행일자})\n`);

let fail = 0;
let warn = 0;

for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const name = f.split(/[\\/]/).pop();
  const issues = [];

  // ① 사건번호 실재 확인
  const nums = [...new Set([...text.matchAll(CASE_RE)].map((m) => m[1]))];
  if (nums.length) {
    const { data: inCases } = await supa
      .from("cases")
      .select("case_number")
      .is("deleted_at", null)
      .in("case_number", nums);
    const { data: inLower } = await supa
      .from("case_lower_courts")
      .select("lower_case_number")
      .in("lower_case_number", nums);
    const known = new Set([
      ...(inCases ?? []).map((r) => r.case_number),
      ...(inLower ?? []).map((r) => r.lower_case_number),
    ]);
    for (const n of nums) {
      if (!known.has(n)) issues.push(["FAIL", `사건번호 ${n} — cases·하급심 어디에도 없음`]);
    }
  }

  // ② 특허법 조문 번호 실재 확인 (法 NNN / 제NNN조 두 표기)
  const arts = new Set();
  for (const m of text.matchAll(/法\s*(\d+)(?:의(\d+))?/g)) arts.add(m[2] ? `${m[1]}의${m[2]}` : m[1]);
  for (const m of text.matchAll(/특허법[^.\n]{0,20}?제\s*(\d+)조(?:의(\d+))?/g))
    arts.add(m[2] ? `${m[1]}의${m[2]}` : m[1]);
  for (const a of arts) {
    if (!ARTICLES.has(a)) issues.push(["FAIL", `특허법 제${a}조 — 현행법에 없음`]);
  }

  // ③ 표기 규칙
  for (const t of [...DROPPED_TERMS, ...ACADEMIC_TERMS]) {
    if (text.includes(t)) issues.push(["FAIL", `금지 용어 «${t}»`]);
  }
  for (const [re, label] of DROPPED_PATTERNS) {
    if (re.test(text)) issues.push(["FAIL", `금지 용어 «${label}»`]);
  }

  // ④ 근거 없는 단정형 서술 (문단 단위)
  for (const para of text.split(/\n\s*\n/)) {
    if (!ASSERTION_RE.test(para)) continue;
    if (CASE_RE.test(para)) continue;
    CASE_RE.lastIndex = 0;
    // 학설 소개("~설이 있으나 다수설은 …")는 교재 서술을 옮긴 것이므로 사건번호가 없어도 된다.
    if (/설\)?(이|은|을|과|와|,)/.test(para)) continue;
    issues.push(["WARN", `단정형 서술에 근거 사건번호 없음 — "${para.replace(/\s+/g, " ").slice(0, 60)}…"`]);
  }

  const f_ = issues.filter((i) => i[0] === "FAIL").length;
  const w_ = issues.filter((i) => i[0] === "WARN").length;
  fail += f_;
  warn += w_;
  console.log(
    `${f_ ? "FAIL" : w_ ? "WARN" : "OK  "} ${name} · ${text.length.toLocaleString()}자 · ` +
      `사건번호 ${nums.length}건 · 조문 ${arts.size}개`,
  );
  for (const [lv, msg] of issues) console.log(`       [${lv}] ${msg}`);
}

console.log(`\n결과: FAIL ${fail} · WARN ${warn}`);
process.exit(fail > 0 ? 1 : 0);
