// 2차 주관식 모범답안 파일 점검기 — DB 반영 전 초안(.md)을 특허에서 확정된 규칙으로 검사한다 (feat-2-039).
// audit-essay-answers.mjs(DB 저장본 대상)와 같은 규칙을 파일에 적용하고, 상표 고유 항목(자기법 접두·서비스표 등)을 더한다.
//
//   node scripts/jagwa/essay-file-check.mjs --file tmp/essay/tm-2015-1.md --law trademark --points 30 [--rubric tmp/essay/tm-2015-1.rubric.md] [--items tmp/essay/tm-2015-1.items.json]
//
//   [FAIL] 판례 사건번호가 해당 법률의 cases 행에 없음(교재 코퍼스·verified 목록에도 없음)
//   [FAIL] § 조문 번호가 현행 해당 법 조문에 없음
//   [FAIL] 표기 규칙(표·##### 헤딩·불릿·평문 N)·폐기 조어·본문 §·원문자 괄호·자기법 접두·대판 등)
//   [FAIL] 배점당 자수 상한(200자/점) — 설문별(헤딩의 "(N점)")·전체
//   [FAIL] rubric_items 배점 합계 ≠ 총점 / 채점기준 전용 사건번호(답안에 없는 번호 → 오배지)
//   [WARN] 근거 사건번호 없는 판례 서술 / 목표 분량(165자/점) 초과
//   종료코드: FAIL 이 하나라도 있으면 1.
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const opt = (k, d = null) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const FILE = opt("--file");
const LAW = opt("--law", "trademark");
const POINTS = Number(opt("--points", "0"));
const RUBRIC = opt("--rubric");
const ITEMS = opt("--items");
if (!FILE || !POINTS) {
  console.error(
    "사용: --file <md> --law <law_code> --points <총점> [--rubric <md>] [--items <json>]",
  );
  process.exit(2);
}
const md = readFileSync(FILE, "utf8");
const rubric = RUBRIC && existsSync(RUBRIC) ? readFileSync(RUBRIC, "utf8") : "";
const items =
  ITEMS && existsSync(ITEMS) ? JSON.parse(readFileSync(ITEMS, "utf8")) : null;

const CHARS_PER_POINT = 200;
const TARGET_PER_POINT = 165;
const CASE_RE =
  /\b(\d{2,4}(?:후|다|허|마|카|누|두|므|재|그|나|하|가합|가단)\d{1,6})\b/g;
const DROPPED_TERMS = [
  "논점의 정리",
  "소설문",
  "대판",
  "치환가능성",
  "치환용이성",
  "치환자명성",
  "사안의 해결",
  "소문항",
  "물음(",
  "종합 결론",
  "논점 정리",
];
const DROPPED_PATTERNS = [
  [/(?<![가-힣])소결(론)?(?![가-힣])/, "소결"],
  [/^###?#?\s*\d*\.?\s*논점\s*$/m, "표제 '논점'"],
  [/^####\s*\(\d+\)\s*조문\s*$/m, "표제 '조문'"],
  [/설문\s*\(?\d\)?\s*의\s*해결/, "표제 '설문(N)의 해결'"],
];
const ACADEMIC_TERMS = [
  "주합발명",
  "조합발명",
  "협의의 동일성",
  "광의의 동일성",
];
const OWN_PREFIX = {
  patent: /특\s*§|特\s*§|法\s*§|法\s*제\d+조|특허법\s*§/,
  trademark: /상\s*§|商\s*§|法\s*§|法\s*제\d+조|상표법\s*§/,
  design: /디\s*§|法\s*§|法\s*제\d+조|디자인보호법\s*§/,
};
const OTHER_LAW_PREFIX =
  /(민사소송법|민사집행법|행정소송법|형사소송법|저작권법|공정거래법|실용신안법|특허법|상표법|디자인보호법|파리조약|부정경쟁방지법|부경법|민사소송|민사집행|민소|민집|행소|형소|민법|민|民訴|民|형법|특|디|상)\s*$/;

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ── 판례(해당 법률 행) ──
const caseOk = new Map();
for (let from = 0; ; from += 1000) {
  const { data, error } = await supa
    .from("cases")
    .select("case_number, deleted_at, subject_laws")
    .contains("subject_laws", [LAW])
    .order("case_id")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  for (const c of data)
    caseOk.set(
      c.case_number,
      (caseOk.get(c.case_number) ?? false) || !c.deleted_at,
    );
  if (data.length < 1000) break;
}
// 교재 코퍼스·법령정보센터 확인 목록
const bookParts = [];
const corpus =
  {
    patent: ["tmp/patent-book25.txt"],
    trademark: ["tmp/book-corpus/trademark-chunks.json"],
    design: ["tmp/book-corpus/design-chunks.json"],
  }[LAW] ?? [];
for (const f of corpus) {
  if (!existsSync(f)) continue;
  bookParts.push(
    f.endsWith(".json")
      ? JSON.parse(readFileSync(f, "utf8"))
          .map((c) => c.text ?? "")
          .join("\n")
      : readFileSync(f, "utf8"),
  );
}
const BOOK = bookParts.join("\n").replace(/\s+/g, "");
const VERIFIED = existsSync("scripts/jagwa/verified-case-numbers.json")
  ? new Set(
      Object.keys(
        JSON.parse(
          readFileSync("scripts/jagwa/verified-case-numbers.json", "utf8"),
        ),
      ).filter((k) => !k.startsWith("_")),
    )
  : new Set();

// ── 현행 조문 번호 ──
const { data: laws } = await supa.from("laws").select("law_id, law_code");
const lawId = laws.find((l) => l.law_code === LAW)?.law_id;
const articleNos = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await supa
    .from("articles")
    .select("article_id, article_number")
    .eq("law_id", lawId)
    .eq("level", "article")
    .is("deleted_at", null)
    .order("article_id")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  for (const a of data) articleNos.add(String(a.article_number));
  if (data.length < 1000) break;
}

function checkNotation(text, name) {
  const bad = [];
  if (name === "답안" && /^\|/m.test(text)) bad.push("표");
  if (/^#####/m.test(text)) bad.push("##### 헤딩");
  if (name === "답안" && /^\s*-\s/m.test(text)) bad.push("불릿 목록");
  if (/^\s*\d+\)\s/m.test(text)) bad.push("평문 N) 시작 줄");
  if (/^[①-⑳]\s\*\*(?!\()/m.test(text)) bad.push("원문자 제목 괄호 누락");
  if (/^#\s/m.test(text) && !/^#\s.*모범답안\s*$/m.test(text))
    bad.push("h1 은 문서 제목만");
  for (const t of DROPPED_TERMS)
    if (text.includes(t)) bad.push(`폐기 표기 '${t}'`);
  for (const [re, t] of DROPPED_PATTERNS)
    if (re.test(text)) bad.push(`폐기 표기 '${t}'`);
  for (const t of ACADEMIC_TERMS)
    if (text.includes(t)) bad.push(`강학상 용어 '${t}'`);
  if (OWN_PREFIX[LAW]?.test(text)) bad.push("자기법 접두(상§·法 등) 잔존");
  if (/특허청(?!구)/.test(text)) bad.push("'특허청' → 지식재산처");
  if (
    LAW === "trademark" &&
    /서비스표권|지정서비스업(?!\s*\(구법)/.test(text) &&
    !/구법|2016년 개정 전/.test(text)
  )
    bad.push(
      "구 용어 서비스표·지정서비스업(현행: 상표·지정상품) — 구법 대응 서술이 아니면 정정",
    );
  if (/§\s*\d+(?:의\d+)?\s*조/.test(text)) bad.push("'§N조' 오표기");
  if (/§\d+(?:의\d+)?[①-⑳]*[Ⅰ-Ⅻ]/.test(text))
    bad.push("괄호 안 호 로마자(→ (N))");
  if (/[①-⑳]\s*\*\*[^*\n]*\*\*[^\n]*\n\n[①-⑳]/.test(text)) {
    /* 인라인 원문자 항목은 줄바꿈 허용 */
  }
  for (const line of text.split("\n")) {
    if (name !== "답안") break;
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
    // 괄호 안 정식 표기(제N조 …) — 약호로 써야 함
    for (const m of line.matchAll(/\(([^()]*)\)/g)) {
      if (
        /제\d+조/.test(m[1]) &&
        !/조약|의정서|협정|규칙|시행령|시행규칙|헌법|부정경쟁방지법|형법|상법/.test(
          m[1],
        )
      ) {
        bad.push(`괄호 안 정식 표기 — (${m[1].slice(0, 30)})`);
        break;
      }
    }
  }
  return [...new Set(bad)];
}

function checkNumbering(text) {
  const bad = [];
  let cur = null;
  const flush = () => {
    if (cur && !cur.hasSub && cur.circleAt)
      bad.push(`${cur.title} — (1) 없이 원문자 시작`);
    cur = null;
  };
  for (const line of text.split("\n")) {
    if (/^###\s/.test(line)) {
      flush();
      cur = {
        title: line.replace(/^#+\s*/, "").slice(0, 24),
        hasSub: false,
        circleAt: null,
      };
    } else if (/^##\s/.test(line)) flush();
    else if (cur) {
      if (/^####\s*\(/.test(line)) cur.hasSub = true;
      else if (/^[①-⑳]\s/.test(line) && !cur.circleAt)
        cur.circleAt = line.slice(0, 20);
    }
  }
  flush();
  // 설문 헤딩 형식·설문별 마무리 = 결론
  const heads = [...text.matchAll(/^## ([ⅠⅡⅢⅣⅤⅥⅦ]+)\.\s*설문.*$/gm)];
  if (!heads.length) bad.push("설문 헤딩(## Ⅰ. 설문 …) 없음");
  heads.forEach((h, i) => {
    const sec = text.slice(
      h.index,
      i + 1 < heads.length ? heads[i + 1].index : text.length,
    );
    const h3 = [...sec.matchAll(/^###\s+\d+\.\s*(.+)$/gm)].map((m) =>
      m[1].trim(),
    );
    if (h3.length && !/결론/.test(h3[h3.length - 1]))
      bad.push(
        `설문 ${i + 1} 마지막 목차가 '결론'이 아님: ${h3[h3.length - 1]}`,
      );
  });
  return bad;
}

function caseNumbers(text) {
  return [...new Set([...text.matchAll(CASE_RE)].map((m) => m[1]))];
}
function checkCases(text) {
  const missing = [];
  for (const n of caseNumbers(text)) {
    if (BOOK.includes(n) || VERIFIED.has(n)) continue;
    if (!caseOk.has(n)) missing.push(`${n} (${LAW} 행·교재 모두 미수록)`);
    else if (!caseOk.get(n)) missing.push(`${n} (삭제된 행)`);
  }
  return missing;
}
function checkArticles(text) {
  const missing = new Set();
  for (const m of text.matchAll(/§\s*(\d+)(의\d+)?/g)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const stripped = before.replace(
      /(?:§\s*\d+(?:의\d+)?\s*[①-⑳]*(?:\([^)]*\))?\s*[,·、]?\s*)+$/,
      "",
    );
    if (OTHER_LAW_PREFIX.test(before) || OTHER_LAW_PREFIX.test(stripped))
      continue;
    const wide = text.slice(Math.max(0, m.index - 200), m.index);
    if (/(구\s*법?|종전)\s*$/.test(before) || /구\s*법[^\n]{0,200}$/.test(wide))
      continue;
    const num = m[2] ? `${m[1]}${m[2]}` : m[1];
    if (!articleNos.has(num)) missing.add(`§${num}`);
  }
  return [...missing];
}
function checkUngrounded(text) {
  const hits = [];
  for (const para of text.split(/\n{2,}/)) {
    if (/^#{1,4}\s/.test(para.trim())) continue;
    if (!/판례는|종전 판례|판례의 태도|통설/.test(para)) continue;
    if (CASE_RE.test(para)) {
      CASE_RE.lastIndex = 0;
      continue;
    }
    CASE_RE.lastIndex = 0;
    hits.push(para.replace(/\s+/g, " ").slice(0, 70) + "…");
  }
  return hits;
}
function checkLength(text) {
  const out = [];
  const heads = [...text.matchAll(/^## [ⅠⅡⅢⅣⅤⅥⅦ]+\.\s*설문.*$/gm)];
  let sumPts = 0;
  heads.forEach((h, i) => {
    const sec = text.slice(
      h.index,
      i + 1 < heads.length ? heads[i + 1].index : text.length,
    );
    const mm = h[0].match(/\((\d+)점\)/);
    if (!mm) return;
    const pt = Number(mm[1]);
    sumPts += pt;
    const per = sec.length / pt;
    out.push({
      label: `설문(${i + 1}) ${sec.length}자 / ${pt}점 = ${per.toFixed(0)}자/점`,
      fail: per > CHARS_PER_POINT,
      warn: per > TARGET_PER_POINT * 1.1,
    });
  });
  if (sumPts && sumPts !== POINTS)
    out.push({ label: `설문 배점 합 ${sumPts} ≠ 총점 ${POINTS}`, fail: true });
  const per = text.length / POINTS;
  out.push({
    label: `전체 ${text.length}자 / ${POINTS}점 = ${per.toFixed(0)}자/점 (목표 ${TARGET_PER_POINT}·상한 ${CHARS_PER_POINT})`,
    fail: per > CHARS_PER_POINT,
    warn: per > TARGET_PER_POINT * 1.1,
  });
  return out;
}

const fails = [];
const warns = [];
for (const [name, text] of [
  ["답안", md],
  ["채점기준", rubric],
]) {
  if (!text) continue;
  const c = checkCases(text);
  if (c.length) fails.push(`${name} 판례 인용: ${c.join(", ")}`);
  const a = checkArticles(text);
  if (a.length) fails.push(`${name} 조문 미존재: ${a.join(", ")}`);
  const n = checkNotation(text, name);
  if (n.length) fails.push(`${name} 표기: ${n.join(" / ")}`);
}
const num = checkNumbering(md);
if (num.length) fails.push(`넘버링: ${num.join(" / ")}`);
for (const l of checkLength(md)) {
  if (l.fail) fails.push(`분량: ${l.label}`);
  else if (l.warn) warns.push(`분량: ${l.label}`);
  else console.log(`  ${l.label}`);
}
const ung = checkUngrounded(md);
if (ung.length)
  warns.push(
    `근거 사건번호 없는 판례 서술 ${ung.length}건 — 사람이 교재 대조:\n    ${ung.join("\n    ")}`,
  );
if (rubric) {
  const onlyGr = caseNumbers(rubric).filter(
    (n) => !caseNumbers(md).includes(n),
  );
  if (onlyGr.length)
    fails.push(
      `채점기준 전용 사건번호(답안에 없음 → 오배지): ${onlyGr.join(", ")}`,
    );
}
if (items) {
  const sum = items.reduce((s, it) => s + Number(it.points || 0), 0);
  if (sum !== POINTS) fails.push(`rubric_items 배점 합 ${sum} ≠ ${POINTS}`);
  if (!items.length) fails.push("rubric_items 비어 있음");
  for (const it of items) if (!it.label) fails.push("rubric_items label 없음");
}
console.log(
  `\n=== ${FILE} (${LAW}, ${POINTS}점) — 인용 판례 ${caseNumbers(md).length}건: ${caseNumbers(md).join(", ")}`,
);
for (const f of fails) console.log(`  [FAIL] ${f}`);
for (const w of warns) console.log(`  [WARN] ${w}`);
if (!fails.length) console.log("  FAIL 0");
process.exit(fails.length ? 1 : 0);
