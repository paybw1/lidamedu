// 문제 hwpx + 답안 hwpx (이미 hwpx-to-text.mjs 로 paragraph JSON 추출됨) 을 합쳐서
// problems.json 을 생성. DB seed 용.
//
// 출력 구조:
// {
//   problems: [{
//     chapter, section, articleHint,         // 위치 컨텍스트
//     problemNumber,                          // 단원 안에서의 번호 (01, 02, ...)
//     year, origin, scope,                    // 출처/연도/단원·종합
//     stem,                                   // 문제 본문
//     choices: [{ index, body, italic }],    // ① ~ ⑤
//     correctIndex,                           // 정답 (답안 매칭 후)
//     explanation,                            // 해설 본문
//     choiceExplanations: { 1: '...', 2: '...' },  // per-choice 해설
//     choiceTypes: { 1: 'statute'|'precedent'|'theory', ... },  // auto-classify
//   }]
// }

import { readFileSync, writeFileSync } from "node:fs";

const problemPath = process.argv[2] ?? "source/_converted/problem.json";
const answerPath = process.argv[3] ?? "source/_converted/answer.json";
const outPath = process.argv[4] ?? "source/_converted/problems-merged.json";

const problemDoc = JSON.parse(readFileSync(problemPath, "utf8"));
const answerDoc = JSON.parse(readFileSync(answerPath, "utf8"));

// ──────── 문제집 파싱 ────────

const CHAPTER_RE = /^제(\d+)장\s+(.+)$/;
// section header — section name 뒤에 (법조문 ref) + 페이지 번호. 페이지 번호는 optional.
//   "산업상 이용가능성(29①본문)26"
//   "신규성(29①각호)30"
//   "발명(2)4" / "목적(1)2"
const SECTION_RE = /^([^()]+?)\s*\(\s*([\d①-⑳의\s,\-]+)\s*\)\s*(\d+)?\s*$/;
// problem header — "01’91단원..." / "02’07변형종합..." / "01’24모의단원..."
//   number(2digit) + ['’] + year(2digit) + (변형|모의|예상)? + (단원|종합) + stem
const PROBLEM_RE =
  /^(\d{2})\s*['’]\s*(\d{2})\s*(변형|모의|예상)?\s*(단원|종합)?(.*)$/;
// alternative for non-past-exam: "01모의단원..." / "01예상단원..." (no year mark)
const PROBLEM_NO_YEAR_RE = /^(\d{2})\s*(모의|예상)\s*(단원|종합)?(.*)$/;
const CHOICE_RE = /^([①②③④⑤])\s*(.+)$/;

function yearFromYY(yy) {
  const n = parseInt(yy, 10);
  if (Number.isNaN(n)) return null;
  // 91→1991, 07→2007, 24→2024 등
  return n >= 50 ? 1900 + n : 2000 + n;
}

const SOURCE_BY_KEYWORD = {
  변형: "past_exam_variant",
  모의: "mock",
  예상: "expected",
};

function parseProblems(paragraphs) {
  const problems = [];
  let currentChapter = null;
  let currentChapterTitle = null;
  let currentSection = null;
  let currentArticleHint = null;
  let inToc = true; // 첫 chapter 헤더 이후 본격 파싱. TOC 영역 skip.
  let bookHeaderSeen = false;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const text = (p.text ?? "").trim();
    if (!text) continue;

    // "문•제•편" 또는 비슷한 본문 시작 표지 — 이후 TOC 종료.
    if (/문\s*[•·]\s*제\s*[•·]\s*편/.test(text)) {
      bookHeaderSeen = true;
    }

    const chMatch = text.match(CHAPTER_RE);
    if (chMatch) {
      currentChapter = parseInt(chMatch[1], 10);
      currentChapterTitle = chMatch[2];
      // 본격 본문 표지 이전이면 TOC 영역 — skip.
      if (!bookHeaderSeen) continue;
      inToc = false;
      currentSection = null;
      currentArticleHint = null;
      continue;
    }

    if (inToc) continue;

    // 페이지 헤더 / footer 흐릿한 텍스트 skip — bookHeaderSeen 이후엔 chapter title 외 무시.
    // section header
    const secMatch = text.match(SECTION_RE);
    if (secMatch && /[①-⑳\d]/.test(secMatch[2])) {
      currentSection = secMatch[1].trim();
      currentArticleHint = secMatch[2].trim();
      continue;
    }

    // problem header
    let probMatch = text.match(PROBLEM_RE);
    let origin = "past_exam";
    let scope = null;
    let year = null;
    let problemNumber = null;
    let stem = null;
    if (probMatch) {
      const [, num, yy, kind, scopeKW, rest] = probMatch;
      problemNumber = parseInt(num, 10);
      year = yearFromYY(yy);
      origin = kind ? SOURCE_BY_KEYWORD[kind] ?? "past_exam" : "past_exam";
      scope = scopeKW === "단원" ? "unit" : scopeKW === "종합" ? "comprehensive" : null;
      stem = rest.trim();
    } else {
      probMatch = text.match(PROBLEM_NO_YEAR_RE);
      if (probMatch) {
        const [, num, kind, scopeKW, rest] = probMatch;
        problemNumber = parseInt(num, 10);
        origin = SOURCE_BY_KEYWORD[kind] ?? "expected";
        scope = scopeKW === "단원" ? "unit" : scopeKW === "종합" ? "comprehensive" : null;
        stem = rest.trim();
      }
    }
    if (problemNumber != null && stem != null && stem.length > 5) {
      // stem 이 너무 짧으면 다음 paragraph 가 stem 일 가능성 — but 보통 같은 line 에 있음.
      problems.push({
        chapter: currentChapter,
        chapterTitle: currentChapterTitle,
        section: currentSection,
        articleHint: currentArticleHint,
        problemNumber,
        year,
        origin,
        scope,
        stem,
        choices: [],
      });
      continue;
    }

    // choice
    const cMatch = text.match(CHOICE_RE);
    if (cMatch && problems.length > 0) {
      const choiceIdx = "①②③④⑤".indexOf(cMatch[1]) + 1;
      const last = problems[problems.length - 1];
      // 5개 이상이면 무시 (parsing 오류 방지)
      if (last.choices.length < 5) {
        last.choices.push({
          index: choiceIdx,
          body: cMatch[2].trim(),
          italic: !!p.italic,
        });
      }
    }
  }
  return problems;
}

const problems = parseProblems(problemDoc.paragraphs);
console.log(`✓ 문제집 파싱: ${problems.length} problems`);
const fiveChoice = problems.filter((p) => p.choices.length === 5).length;
console.log(`  · 5지문 정상: ${fiveChoice} (불완전: ${problems.length - fiveChoice})`);

// ──────── 답안집 파싱 ────────

// 답안 entry 시작: "01 ③" / "02 ⑤" — number 2자리 + 공백 + 정답 마커
const ANSWER_HEADER_RE = /^(\d{2})\s*([①②③④⑤])\s*$/;
// per-choice explanation: "① 출원공개..." / "②④ ..." / "①⑤ ..."
const ANSWER_CHOICE_RE = /^([①②③④⑤]+)\s*(.+)$/;

function parseAnswers(paragraphs) {
  const entries = []; // { chapter, section, problemNumber, correctIndex, explanation, perChoice }
  let currentChapter = null;
  let currentSection = null;
  let currentArticleHint = null;
  let bookHeaderSeen = false;
  let inToc = true;
  let current = null; // currently building entry

  const flush = () => {
    if (current) entries.push(current);
    current = null;
  };

  for (const p of paragraphs) {
    const text = (p.text ?? "").trim();
    if (!text) continue;

    if (/정답\s*및\s*해설/.test(text)) {
      bookHeaderSeen = true;
      inToc = false;
      continue;
    }

    const chMatch = text.match(CHAPTER_RE);
    if (chMatch && bookHeaderSeen) {
      flush();
      currentChapter = parseInt(chMatch[1], 10);
      currentSection = null;
      continue;
    }
    if (inToc) continue;

    const secMatch = text.match(SECTION_RE);
    if (secMatch && /[①-⑳\d]/.test(secMatch[2])) {
      flush();
      currentSection = secMatch[1].trim();
      currentArticleHint = secMatch[2].trim();
      continue;
    }

    const aHead = text.match(ANSWER_HEADER_RE);
    if (aHead) {
      flush();
      current = {
        chapter: currentChapter,
        section: currentSection,
        articleHint: currentArticleHint,
        problemNumber: parseInt(aHead[1], 10),
        correctIndex: "①②③④⑤".indexOf(aHead[2]) + 1,
        explanation: "",
        perChoice: {},
      };
      continue;
    }

    if (!current) continue;

    // 해설 본문 시작 marker — "해설" 단독 또는 "해설..." prefix
    if (text === "해설") continue;
    const cMatch = text.match(ANSWER_CHOICE_RE);
    if (cMatch) {
      const indices = [...cMatch[1]].map((c) => "①②③④⑤".indexOf(c) + 1);
      const body = cMatch[2].trim();
      for (const idx of indices) {
        const cur = current.perChoice[idx] ?? "";
        current.perChoice[idx] = cur ? cur + " " + body : body;
      }
      continue;
    }
    // 해설 + 본문이 한 줄에 나오는 케이스 — "해설노하우는...":
    if (/^해설/.test(text)) {
      current.explanation += (current.explanation ? "\n" : "") + text.replace(/^해설\s*/, "");
      continue;
    }
    // 그 외 본문은 explanation 에 누적.
    current.explanation += (current.explanation ? "\n" : "") + text;
  }
  flush();
  return entries;
}

const answers = parseAnswers(answerDoc.paragraphs);
console.log(`✓ 답안집 파싱: ${answers.length} answers`);

// ──────── 매칭 + 자동 분류 ────────

// 답안의 per-choice 해설 텍스트로 choice_type 자동 분류.
//   - 法 \d+ / 특허법 제\d+조 / 시행령 제\d+조 → statute
//   - 대법원 \d+ / 헌재 / 판례 / 판결 / 결정 → precedent
//   - 그 외 → theory
const STATUTE_RE = /法\s*\d+|특허법\s*제\s*\d+\s*조|시행령\s*제\s*\d+\s*조|시행규칙|발진법/;
const PRECEDENT_RE = /대법원\s*\d{4}|헌법재판소|헌재\s*\d{4}|선고\s*\d{2,4}\s*[다후카허]\s*\d+|\d{2,4}\.?\s*\d+\.?\s*\d+\.?\s*선고/;

function classifyChoice(text) {
  if (!text) return null;
  if (PRECEDENT_RE.test(text)) return "precedent";
  if (STATUTE_RE.test(text)) return "statute";
  return "theory";
}

// problems + answers 를 (chapter, normalized section, problemNumber) 키로 매칭.
// section 명은 두 책에서 띄어쓰기/구두점이 다를 수 있어 한글/숫자만 남기고 비교.
function normSection(s) {
  return (s ?? "").replace(/[^가-힣0-9]/g, "");
}
function keyOf(o) {
  return [o.chapter, normSection(o.section), o.problemNumber].join("|");
}
const ansByKey = new Map(answers.map((a) => [keyOf(a), a]));

let matched = 0;
let unmatched = 0;
for (const prob of problems) {
  const a = ansByKey.get(keyOf(prob));
  if (a) {
    matched++;
    prob.correctIndex = a.correctIndex;
    prob.explanation = a.explanation;
    prob.choiceExplanations = a.perChoice;
    prob.choiceTypes = {};
    for (const c of prob.choices) {
      const exp = a.perChoice[c.index] ?? a.explanation;
      prob.choiceTypes[c.index] = classifyChoice(exp);
    }
  } else {
    unmatched++;
  }
}
console.log(`  · 답안 매칭: ${matched} / ${problems.length} (미매칭 ${unmatched})`);

// 통계
const byOrigin = problems.reduce((acc, p) => {
  acc[p.origin] = (acc[p.origin] ?? 0) + 1;
  return acc;
}, {});
const byScope = problems.reduce((acc, p) => {
  const k = p.scope ?? "(none)";
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
console.log(`  · origin: ${JSON.stringify(byOrigin)}`);
console.log(`  · scope: ${JSON.stringify(byScope)}`);

writeFileSync(outPath, JSON.stringify({ problems }, null, 2), "utf8");
console.log(`✓ ${outPath}`);
