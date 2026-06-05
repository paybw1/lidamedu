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
// 예상문제 해설편 — bullet prefix `•목적(1)2`.
const SECTION_BULLET_RE = /^[•·]\s*([^()]+?)\s*\(\s*([\d①-⑳②③④⑤의\s,\-]+)\s*\)\s*(\d+)?\s*$/;
// 예상문제 문제편 — markdown table form `| 행위능력 |  | 3-5, 7의2 |`.
//   첫 cell = section name, 셋째 cell = articleHint, 둘째 cell 은 공백 (TOC 영역의 `| • | ... | ... |` 4컬럼 form 은 제외).
const SECTION_TABLE_RE = /^\|\s*([^|•·]+?)\s*\|\s*\|\s*([\d①-⑳②③④⑤의\s,\-]+?)\s*\|$/;
// problem header — "01’91단원..." / "02’07변형종합..." / "01’24모의단원..."
//   number(2digit) + ['’] + year(2digit) + (변형|모의|예상)? + (단원|종합) + stem
const PROBLEM_RE =
  /^(\d{2})\s*['’]\s*(\d{2})\s*(변형|모의|예상)?\s*(단원|종합)?(.*)$/;
// alternative for non-past-exam: "01모의단원..." / "01예상단원..." (no year mark)
const PROBLEM_NO_YEAR_RE = /^(\d{2})\s*(모의|예상)\s*(단원|종합)?(.*)$/;
// 객관식(Ⅱ) 예상문제 헤더 — 연도·키워드 모두 없음.
// 패턴이 한컴 박스 변환으로 4가지 형태로 깨져 옴:
//   (a) "01다음은…?단원"           — 끝에 마커
//   (b) "05종합다음 보기…"          — 마커가 번호 직후
//   (c) "단원02재외자…"             — 마커가 번호 앞
//   (d) "04甲은…甲이 단원자신의…"   — stem 중간에 마커 끼어듦
// 어느 형태든 다음 paragraph 가 `| 단원 | --- |` 또는 `| 종합 |` 인 게 안정적 시그널.
// 그래서 look-ahead 로 다음 paragraph 검사.
const PROBLEM_EXPECTED_HEAD_RE =
  /^(?:(단원|종합)\s*)?(\d{2})((?:단원|종합)?[^\d①-⑤|].{5,})$/;
const SCOPE_MARKER_RE = /^\|\s*(단원|종합)\s*\|/;
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
    // section header (3 form):
    //   (a) 평문 — "발명(2)4"
    //   (b) bullet — "•발명(2)4" (해설편)
    //   (c) markdown table — "| 발명 |  | 2 |" (문제편) — paragraph 첫 줄만 본다.
    const firstLine = text.split(/\n/)[0];
    const tableMatch = firstLine.match(SECTION_TABLE_RE);
    if (tableMatch) {
      currentSection = tableMatch[1].trim();
      currentArticleHint = tableMatch[2].trim();
      continue;
    }
    const bulletMatch = text.match(SECTION_BULLET_RE);
    if (bulletMatch && /[①-⑳\d]/.test(bulletMatch[2])) {
      currentSection = bulletMatch[1].trim();
      currentArticleHint = bulletMatch[2].trim();
      continue;
    }
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
      } else {
        // 객관식(Ⅱ) 예상문제 — 다음 non-empty paragraph 가 `| 단원 |`/`| 종합 |` markdown 마커여야.
        const expMatch = text.match(PROBLEM_EXPECTED_HEAD_RE);
        if (expMatch) {
          let nextScope = null;
          for (let j = i + 1; j < Math.min(i + 4, paragraphs.length); j++) {
            const nt = (paragraphs[j].text ?? "").trim();
            if (!nt) continue;
            const sm = nt.match(SCOPE_MARKER_RE);
            if (sm) {
              nextScope = sm[1];
              break;
            }
            // 다음 non-empty 가 선지(①) 면 — 마커 없는 헤더. 거짓양성 차단.
            if (/^[①-⑤]/.test(nt)) break;
            // markdown table 시작 (`|`) 이긴 한데 단원/종합이 아니면 break (보기 박스일 수 있음 → 정상)
            if (/^\|/.test(nt)) break;
          }
          if (nextScope || expMatch[1]) {
            problemNumber = parseInt(expMatch[2], 10);
            origin = "expected";
            // 마커 우선순위: 헤더 prefix > 다음 paragraph markdown.
            const scopeKW = expMatch[1] ?? nextScope;
            scope = scopeKW === "단원" ? "unit" : "comprehensive";
            // stem — body 에 끼어든 (단원|종합) 자체 제거 (정중간 케이스).
            stem = expMatch[3].replace(/(단원|종합)/, "").trim();
          }
        }
      }
    }
    if (problemNumber != null && stem != null && stem.length > 5) {
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
        boxItems: [],
      });
      continue;
    }

    // ── stem 연장 + 박스 본문 추출 ──
    // 문제 헤더 등록 직후, 다음 ①/박스 마커가 오기 전 paragraph 는 stem 의 연장으로 본다.
    //   예: "08甲은 다음과 같이 청구범위를…" → "| 1. 프로그램을 수행하는 장치 2. ... |"
    //       → "乙은 동일한 프로그램을 앱으로…" → "| ㈎ 丙이… ㈏ … |" (여기서 박스 마커 매치)
    // 박스 추출 실패한 markdown table 본문도 stem 으로 흡수.
    if (problems.length > 0) {
      const last = problems[problems.length - 1];
      if (last.choices.length === 0 && last.boxItems.length === 0) {
        // markdown table row
        if (/^\|\s/.test(text)) {
          // separator skip — `| --- |`
          if (/^\|\s*-+/.test(text)) continue;
          // scope marker `| 단원 |` / `| 종합 |` — 이미 헤더 단계에서 처리됨.
          if (SCOPE_MARKER_RE.test(text.split(/\n/)[0])) continue;
          // 박스 추출 시도
          const items = extractBoxItems(text);
          if (items.length >= 2) {
            last.boxItems = items;
            continue;
          }
          // 박스 마커 없는 표 본문 → stem 연장.
          const cleaned = text
            .replace(/^\|/, "")
            .replace(/\|/g, " ")
            .replace(/-{3,}/g, " ") // markdown separator dashes 제거
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (cleaned) {
            last.stem += "\n" + cleaned;
            continue;
          }
        }
        // 일반 텍스트 — 선지/박스 마커 시작 아니면 stem 연장.
        if (
          !/^[①②③④⑤]/.test(text) &&
          !/^[㈎㈏㈐㈑㈒㈓㈔㈕㈖㈗㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㈀㈁㈂㈃㈄㈅㈆㈇㈈㈉]/.test(text)
        ) {
          last.stem += "\n" + text;
          continue;
        }
      }
    }

    // ── 선지(단·복수) ──
    // 한 paragraph 에 `① ... ② ... ③ ...` 처럼 여러 선지가 묶여 있을 수 있음 (예상문제 박스형).
    if (problems.length > 0 && /[①②③④⑤]/.test(text)) {
      const last = problems[problems.length - 1];
      const split = splitChoices(text);
      const usedIdx = new Set(last.choices.map((c) => c.index));
      for (const sp of split) {
        if (last.choices.length >= 5) break;
        if (usedIdx.has(sp.index)) continue;
        last.choices.push({ index: sp.index, body: sp.body, italic: !!p.italic });
        usedIdx.add(sp.index);
      }
    }
  }
  return problems;
}

// 박스 마커 family — backfill-box-items.mjs 와 동일.
// kor_circled_jamo: U+3260..U+326D — ㉠ ~ ㉭ (14자). 객관식(Ⅱ) 예상문제 등 일부 문제는
//   ㉩(U+3269) 너머 ㉪㉫㉬㉭ 까지 보기 ≥10 개를 쓰는 케이스가 있어 확장.
const BOX_FAMILIES = [
  { name: "kor_paren_double", chars: "㈎㈏㈐㈑㈒㈓㈔㈕㈖㈗" },
  { name: "kor_circled_jamo", chars: "㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭" },
  { name: "kor_circled_syl", chars: "㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹" },
  { name: "kor_paren", chars: "㈀㈁㈂㈃㈄㈅㈆㈇㈈㈉" },
];

/**
 * markdown table row `| ㉠ A   ㉡ B   ㉢ C |` → [{marker:'㉠', body:'A'}, ...].
 * 적합한 family 1개 선택 (가장 많은 마커 출현). 마커 위치로 split.
 */
function extractBoxItems(rawText) {
  // 표 마커 `| ` 와 `|` 제거.
  let text = rawText.replace(/^\|\s*/, "").replace(/\s*\|\s*$/, "");
  // 여러 줄(separator `| --- |`) 포함 가능 — 첫 줄만.
  text = text.split(/\n/)[0];
  let best = { items: [], count: 0 };
  for (const fam of BOX_FAMILIES) {
    const re = new RegExp(`[${fam.chars}]`, "g");
    const positions = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      positions.push({ marker: m[0], idx: m.index });
    }
    if (positions.length < 2) continue;
    const items = [];
    for (let k = 0; k < positions.length; k++) {
      const cur = positions[k];
      const next = positions[k + 1];
      const bodyStart = cur.idx + cur.marker.length;
      const bodyEnd = next ? next.idx : text.length;
      const body = text.slice(bodyStart, bodyEnd).trim();
      if (body.length > 0) items.push({ marker: cur.marker, body });
    }
    if (items.length > best.count) best = { items, count: items.length };
  }
  return best.items;
}

/**
 * `① a ② b ③ c` 처럼 한 줄에 묶인 선지를 분리.
 * 마커 위치 기준 split. 마커가 1개면 [{index, body}] 1개.
 *
 * 단조성 가드 — 본문에 다른 marker 가 등장해도 split 오인하지 않도록, 첫 marker N
 * 이후의 marker 들은 N+1, N+2, … 순서로 단조 증가할 때에만 split point 로 채택한다.
 * 예: "③ ②의 경우 …" → split = [③ at 0], ② 는 본문 일부. 본문이 누락되던 결함 차단.
 */
function splitChoices(text) {
  const re = /([①②③④⑤])\s*/g;
  const order = "①②③④⑤";
  const positions = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    positions.push({ marker: m[1], idx: m.index, end: m.index + m[0].length });
  }
  if (positions.length === 0) return [];
  // 단조 증가 sequence 만 split point 로 채택.
  const splits = [positions[0]];
  let prev = order.indexOf(positions[0].marker);
  for (let k = 1; k < positions.length; k++) {
    const i = order.indexOf(positions[k].marker);
    if (i === prev + 1) {
      splits.push(positions[k]);
      prev = i;
    }
  }
  const out = [];
  for (let k = 0; k < splits.length; k++) {
    const cur = splits[k];
    const next = splits[k + 1];
    const bodyStart = cur.end;
    const bodyEnd = next ? next.idx : text.length;
    const body = text.slice(bodyStart, bodyEnd).trim();
    if (body.length === 0) continue;
    const index = order.indexOf(cur.marker) + 1;
    out.push({ index, body });
  }
  return out;
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

    // section header (bullet / plain / table 모두). 답안집은 보통 bullet.
    const bulletMatchA = text.match(SECTION_BULLET_RE);
    if (bulletMatchA && /[①-⑳\d]/.test(bulletMatchA[2])) {
      flush();
      currentSection = bulletMatchA[1].trim();
      currentArticleHint = bulletMatchA[2].trim();
      continue;
    }
    const firstLineA = text.split(/\n/)[0];
    const tableMatchA = firstLineA.match(SECTION_TABLE_RE);
    if (tableMatchA) {
      flush();
      currentSection = tableMatchA[1].trim();
      currentArticleHint = tableMatchA[2].trim();
      continue;
    }
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

    // 해설 본문 시작 marker — "해설" 단독.
    if (text === "해설") continue;
    // "해설①" / "해설②④" — 해설 prefix + 선지 marker 가 한 paragraph 에. perChoice 로.
    // 예상문제 해설편 첫 줄 패턴 (433 paragraphs).
    const haeSeolChoice = text.match(/^해설\s*([①②③④⑤]+)\s*(.+)$/);
    if (haeSeolChoice) {
      const indices = [...haeSeolChoice[1]].map((c) => "①②③④⑤".indexOf(c) + 1);
      const body = haeSeolChoice[2].trim();
      for (const idx of indices) {
        const cur = current.perChoice[idx] ?? "";
        current.perChoice[idx] = cur ? cur + " " + body : body;
      }
      continue;
    }
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

// problems + answers 를 chapter 별 sequence(파일 출현 순서) 로 매칭.
//
// 예상문제 (객관식 Ⅱ) 는 section heading 일부 누락 + 같은 problemNumber
// 가 한 chapter 안에 여러 번 출현 (sub-group 마다 reset) — 키 기반 매칭에서
// 키 충돌이 발생. 두 책이 같은 순서로 출현하므로 chapter 내 N번째 ↔ N번째
// 매칭이 가장 robust.
//
// 키 기반 매칭이 정상 동작하는 (기존 기출 + 상표/디자인) 케이스를 깨지
// 않도록, 먼저 키 매칭 시도 후 미매칭만 sequence fallback.
function normSection(s) {
  return (s ?? "").replace(/[^가-힣0-9]/g, "");
}
function keyOf(o) {
  return [o.chapter, normSection(o.section), o.problemNumber].join("|");
}
// 키 충돌 (동일 키 다중) — 충돌 키는 키매칭에서 제외하고 sequence 로.
const ansKeyCount = new Map();
for (const a of answers) {
  ansKeyCount.set(keyOf(a), (ansKeyCount.get(keyOf(a)) ?? 0) + 1);
}
const probKeyCount = new Map();
for (const p of problems) {
  probKeyCount.set(keyOf(p), (probKeyCount.get(keyOf(p)) ?? 0) + 1);
}
const ansByKey = new Map();
for (const a of answers) {
  const k = keyOf(a);
  if (ansKeyCount.get(k) === 1 && probKeyCount.get(k) === 1) ansByKey.set(k, a);
}

let matchedKey = 0;
const probsToFallback = [];
for (const prob of problems) {
  const a = ansByKey.get(keyOf(prob));
  if (a) {
    matchedKey++;
    applyAnswer(prob, a);
  } else {
    probsToFallback.push(prob);
  }
}

// chapter 내 sequence fallback.
const ansByChSeq = new Map();
for (const a of answers) {
  const k = keyOf(a);
  if (ansKeyCount.get(k) === 1 && probKeyCount.get(k) === 1) continue;
  const arr = ansByChSeq.get(a.chapter) ?? [];
  arr.push(a);
  ansByChSeq.set(a.chapter, arr);
}
const probSeqIdx = new Map();
let matchedSeq = 0;
let unmatched = 0;
for (const prob of probsToFallback) {
  const arr = ansByChSeq.get(prob.chapter) ?? [];
  const idx = probSeqIdx.get(prob.chapter) ?? 0;
  const a = arr[idx];
  if (a) {
    applyAnswer(prob, a);
    matchedSeq++;
    probSeqIdx.set(prob.chapter, idx + 1);
  } else {
    unmatched++;
  }
}

function applyAnswer(prob, a) {
  prob.correctIndex = a.correctIndex;
  prob.explanation = a.explanation;
  prob.choiceExplanations = a.perChoice;
  prob.choiceTypes = {};
  for (const c of prob.choices) {
    const exp = a.perChoice[c.index] ?? a.explanation;
    prob.choiceTypes[c.index] = classifyChoice(exp);
  }
}

const matched = matchedKey + matchedSeq;
console.log(`  · 답안 매칭: ${matched} / ${problems.length} (key=${matchedKey} + seq=${matchedSeq}, 미매칭 ${unmatched})`);

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
