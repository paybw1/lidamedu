// 변호사시험 해설 안전망 — 마크다운 해설을 대상으로 인용·표기를 점검.
//
// jagwa/audit-essay-answers.mjs 와 같은 취지지만 대상이 다르다. 저쪽은 DB(problems)의
// 2차 모범답안을, 이쪽은 파일로 쓰는 변호사시험 해설을 본다.
//
//   [FAIL] 사건번호가 **네 곳** 어디에도 없음 → 인용 금지
//          ① cases ② case_lower_courts ③ 리담 교재 ④ 국가법령정보센터(정확일치)
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

const BOOK_SRC = "f84eebc7-773a-467c-9e37-7579d485ce8e"; // 리담특허법 제25판
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
  const cited = [];

  // ① 사건번호 실재 확인 — ★CLAUDE.md 가 정한 **네 곳 전부**를 본다.
  //   ① cases  ② case_lower_courts  ③ 리담 교재(content_chunks)  ④ 국가법령정보센터.
  //   교재에서 읽은 판례가 cases 에 없는 경우가 흔하다(13회 인용 8건 중 5건이 그랬다).
  //   DB 두 곳만 보면 교재 근거가 확실한 인용까지 FAIL 로 잡혀 도구를 못 믿게 된다.
  const nums = [...new Set([...text.matchAll(CASE_RE)].map((m) => m[1]))];
  for (const n of nums) {
    const where = [];
    const { count: c1 } = await supa
      .from("cases")
      .select("case_id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("case_number", n);
    if (c1) where.push("cases");
    if (!where.length) {
      const { count: c2 } = await supa
        .from("case_lower_courts")
        .select("lower_case_id", { count: "exact", head: true })
        .eq("lower_case_number", n);
      if (c2) where.push("하급심");
    }
    if (!where.length) {
      const { count: c3 } = await supa
        .from("content_chunks")
        .select("chunk_index", { count: "exact", head: true })
        .eq("source_id", BOOK_SRC)
        .ilike("body_text", `%${n}%`);
      if (c3) where.push("교재");
    }
    if (!where.length) {
      // 법령정보센터 — ★사건번호 정확일치만 실재로 인정한다(search=1 필수).
      try {
        const r = await fetch(
          `https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=prec&type=JSON&search=1&query=${encodeURIComponent(n)}`,
        );
        const j = await r.json();
        const list = A(j?.PrecSearch?.prec);
        if (list.some((p) => String(p.사건번호).trim() === n)) where.push("법령정보센터");
      } catch {
        issues.push(["WARN", `사건번호 ${n} — 법령정보센터 조회 실패(네트워크). 없음으로 단정하지 않음`]);
        continue;
      }
    }
    if (!where.length) issues.push(["FAIL", `사건번호 ${n} — 네 곳 어디에도 없음`]);
    else cited.push(`${n}(${where[0]})`);
  }

  // ② 특허법 조문 번호 실재 확인 (法 NNN / 제NNN조 두 표기)
  const arts = new Set();
  // ★앞에 한자가 붙으면 다른 법률(民訴法·民法·發振法·刑訴法 등)이므로 특허법 조문으로 세지 않는다.
  for (const m of text.matchAll(/(?<![一-鿿])法\s*(\d+)(?:의(\d+))?/g))
    arts.add(m[2] ? `${m[1]}의${m[2]}` : m[1]);
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
    // ★g 플래그 정규식의 test() 는 lastIndex 를 남긴다. 초기화를 continue 뒤에 두면
    //   그 줄을 건너뛰어 다음 문단을 엉뚱한 위치부터 검사한다 — 실제로 87후111 을
    //   인용한 문단이 «근거 없음» 으로 잡혔다. 검사 직전에 매번 초기화한다.
    CASE_RE.lastIndex = 0;
    if (CASE_RE.test(para)) continue;
    // 학설을 «소개»하는 문단(“ⅰ) …설, ⅱ) …설이 있으나 다수설은 …”)은 교재 서술을 옮긴
    // 것이므로 사건번호가 없어도 된다.
    // ★다만 «설» 이 들어갔다고 무조건 빼면 안 된다. 그러면 CLAUDE.md 가 금지하는
    //   "통설은 ~이다" 라는 근거 없는 단정까지 통과한다(실측으로 확인). 학설을 열거·대립
    //   시키는 표지가 있을 때만 예외로 둔다.
    if (/설이 있|견해가 있|라는 설|학설/.test(para)) continue;
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
  if (cited.length) console.log(`       근거: ${cited.join(" · ")}`);
}

console.log(`\n결과: FAIL ${fail} · WARN ${warn}`);
process.exit(fail > 0 ? 1 : 0);
