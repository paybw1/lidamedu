// 제1장 총칙/보칙 — 통일 매칭 파이프라인 검증.
//
// 파싱 규칙 (양 책 공통):
//  - 의미 paragraph(text 비어있지 않은 것) 만 보고 인덱스 i 기준으로 처리.
//  - chapter: "제N장" 단독 행 또는 "제N장 [title]" 패턴. 단, "리담특허법 객관식(Ⅰ)" / "문·제·편" /
//    "LIDAM PATENT LAW" 같은 카피 패턴이 섞인 행도 chapter 로 인식.
//  - section (body 전용): 3-line triplet  [<name><hint>] / [<name>] / [<hint>]
//      validate: 다음 5 라인 안에 첫 problem(문제집) / answer(답안집) marker 가 있어야 한다.
//      → 이 패턴만 section 으로 인식 (parens-style TOC entry 는 모두 무시).
//  - chapter "entry-page TOC" 영역: chapter header 직후, 첫 section triplet 이 나올 때까지의
//    paragraph 는 건너뛴다.
//
// 매칭:
//  - chapter 1 내 problem-book 의 section 순서 = answer-book 의 section 순서.
//  - section 안의 problemNumber 가 일치하는 것끼리 1:1.
//  - 결과 표 출력.

import { readFileSync } from "node:fs";

const problemDoc = JSON.parse(readFileSync("source/_converted/problem.json", "utf8"));
const answerDoc = JSON.parse(readFileSync("source/_converted/answer.json", "utf8"));

const TARGET = 1;

const CHAPTER_RE = /^제(\d+)장(?:\s+(.+))?$/;
const PROBLEM_RE = /^(\d{2})\s*['’]\s*(\d{2})\s*(변형|모의|예상)?\s*(단원|종합)?(.*)$/;
// hwpx 렌더 깨짐 대응: "0'25종합5특허법..." 처럼 problemNumber 가 두 글자로 분리된 경우.
const PROBLEM_SPLIT_RE = /^(\d)\s*['’]\s*(\d{2})\s*(변형|모의|예상)?\s*(단원|종합)?\s*(\d)\s*(.*)$/;
const PROBLEM_NO_YEAR_RE = /^(\d{2})\s*(모의|예상)\s*(단원|종합)?(.*)$/;
const CHOICE_RE = /^([①②③④⑤])\s*(.+)$/;
const ANSWER_HEADER_RE = /^(\d{2})\s*([①②③④⑤])\s*$/;
const ANSWER_PERCHOICE_RE = /^([①②③④⑤]+)\s*(.+)$/;

// triplet 의 line 2 (name) 와 line 3 (hint) 패턴.
// name: 한글로 시작, 한글/공백/콤마/중점/괄호 허용. (괄호는 "(11)" 같은 hint가 name 끝에 붙는 경우 대비)
const NAME_ONLY = /^[가-힣][가-힣\s,·]*$/;
// hint 는 숫자, 원문자, 의, 콤마, 하이픈, 로마 숫자(Ⅰ-Ⅴ), 괄호() 허용. 한자/한글 일부 허용 (발진법 등).
const HINT_ONLY = /^[\d①-⑳의\s,\-Ⅰ-Ⅴ()발진법]+$/;

function isChapterPara(text) {
  // "제N장" 만 단독 또는 "제N장 …" 형태.
  const m = text.match(CHAPTER_RE);
  if (m) return parseInt(m[1], 10);
  // "제N장 • [title] · ..." 같은 줄에서도 chapter 인식
  const m2 = text.match(/제(\d+)장/);
  if (m2 && /[•·]/.test(text)) return parseInt(m2[1], 10);
  return null;
}

function compactLines(paragraphs) {
  const out = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const t = (paragraphs[i].text ?? "").trim();
    if (t) out.push({ idx: i, text: t, italic: !!paragraphs[i].italic });
  }
  return out;
}

// 한 chapter 의 (start_line, end_line) 범위 찾기.
function chapterRange(lines, target) {
  let start = -1, end = lines.length;
  let bookHeader = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    if (/문\s*[•·]\s*제\s*[•·]\s*편/.test(t) || /정답\s*및\s*해설/.test(t)) bookHeader = true;
    if (!bookHeader) continue;
    const ch = isChapterPara(t);
    if (ch === target && start === -1) start = i;
    else if (ch != null && ch !== target && start !== -1) { end = i; break; }
  }
  return { start, end };
}

// 다음 N 라인 안에 marker 가 있는지.
function hasMarkerSoon(lines, from, lookahead, regex) {
  for (let k = from; k < Math.min(from + lookahead, lines.length); k++) {
    if (regex.test(lines[k].text)) return true;
  }
  return false;
}

// section triplet 인식. 반환 idx 는 "다음 줄"(triplet 다음 라인 인덱스).
function tryDetectSectionTriplet(lines, i, markerRe) {
  if (i + 2 >= lines.length) return null;
  const a = lines[i].text;
  const b = lines[i + 1].text;
  const c = lines[i + 2].text;
  // 라인 1 = name + hint 한줄. 검증: name (B) 와 hint (C) 가 concat 되었거나 "name<hint>" 가 a 와 일치.
  if (!NAME_ONLY.test(b)) return null;
  if (!HINT_ONLY.test(c)) return null;
  const expected = b.replace(/\s+/g, "") + c.replace(/\s+/g, "");
  const aNorm = a.replace(/\s+/g, "");
  // a 가 b+c 의 concat 으로 시작하거나 매우 유사한지 검증.
  if (!aNorm.startsWith(expected.slice(0, Math.min(expected.length, 10)))) return null;
  // 다음 5 라인 안에 marker.
  if (!hasMarkerSoon(lines, i + 3, 5, markerRe)) return null;
  return { name: b, hint: c, nextIdx: i + 3 };
}

// 문제집 chapter 파싱.
function parseProblemChapter(paragraphs, target) {
  const lines = compactLines(paragraphs);
  const { start, end } = chapterRange(lines, target);
  if (start === -1) return { sections: [], note: "chapter not found" };

  const sections = [];
  let cur = null;
  let i = start + 1;
  while (i < end) {
    const t = lines[i].text;
    // 다른 chapter 페이지 헤더 만나면 무시 (이미 range 로 막혀 있긴 함)
    const ch = isChapterPara(t);
    if (ch != null && ch !== target) { i++; continue; }

    const tri = tryDetectSectionTriplet(lines, i, /^\d{2}\s*['’]\s*\d{2}|^\d{2}\s*(모의|예상)/);
    if (tri) {
      cur = { name: tri.name, articleHint: tri.hint, problems: [] };
      sections.push(cur);
      i = tri.nextIdx;
      continue;
    }

    // problem header
    let m = t.match(PROBLEM_RE);
    let kind = "past_exam", scope = null, year = null, num = null, stem = null;
    if (m) {
      num = parseInt(m[1], 10);
      const yy = parseInt(m[2], 10);
      year = yy >= 50 ? 1900 + yy : 2000 + yy;
      kind = m[3] === "변형" ? "past_exam_variant" : m[3] === "모의" ? "mock" : m[3] === "예상" ? "expected" : "past_exam";
      scope = m[4] === "단원" ? "unit" : m[4] === "종합" ? "comprehensive" : null;
      stem = (m[5] ?? "").trim();
    } else if ((m = t.match(PROBLEM_SPLIT_RE))) {
      // 분리된 problemNumber: "0'25종합5..." → "05"
      num = parseInt(m[1] + m[5], 10);
      const yy = parseInt(m[2], 10);
      year = yy >= 50 ? 1900 + yy : 2000 + yy;
      kind = m[3] === "변형" ? "past_exam_variant" : m[3] === "모의" ? "mock" : m[3] === "예상" ? "expected" : "past_exam";
      scope = m[4] === "단원" ? "unit" : m[4] === "종합" ? "comprehensive" : null;
      stem = (m[6] ?? "").trim();
    } else {
      m = t.match(PROBLEM_NO_YEAR_RE);
      if (m) {
        num = parseInt(m[1], 10);
        kind = m[2] === "모의" ? "mock" : "expected";
        scope = m[3] === "단원" ? "unit" : m[3] === "종합" ? "comprehensive" : null;
        stem = (m[4] ?? "").trim();
      }
    }
    if (num != null && stem != null && stem.length > 5 && cur) {
      cur.problems.push({ n: num, year, origin: kind, scope, stem, choices: [] });
      i++;
      continue;
    }

    const cm = t.match(CHOICE_RE);
    if (cm && cur && cur.problems.length > 0) {
      const last = cur.problems[cur.problems.length - 1];
      if (last.choices.length < 5) {
        last.choices.push({ index: "①②③④⑤".indexOf(cm[1]) + 1, body: cm[2].trim(), italic: lines[i].italic });
      }
    }
    i++;
  }
  return { sections };
}

// 답안집 chapter 파싱.
function parseAnswerChapter(paragraphs, target) {
  const lines = compactLines(paragraphs);
  const { start, end } = chapterRange(lines, target);
  if (start === -1) return { sections: [], note: "chapter not found" };

  const sections = [];
  let cur = null, curAns = null;
  let i = start + 1;
  while (i < end) {
    const t = lines[i].text;
    const ch = isChapterPara(t);
    if (ch != null && ch !== target) { i++; continue; }

    const tri = tryDetectSectionTriplet(lines, i, /^\d{2}\s*[①②③④⑤]\s*$/);
    if (tri) {
      if (curAns && cur) cur.answers.push(curAns);
      curAns = null;
      cur = { name: tri.name, articleHint: tri.hint, answers: [] };
      sections.push(cur);
      i = tri.nextIdx;
      continue;
    }

    const ah = t.match(ANSWER_HEADER_RE);
    if (ah && cur) {
      if (curAns) cur.answers.push(curAns);
      curAns = {
        n: parseInt(ah[1], 10),
        correct: "①②③④⑤".indexOf(ah[2]) + 1,
        explanation: "",
        perChoice: {},
      };
      i++;
      continue;
    }

    if (!curAns) { i++; continue; }
    if (t === "해설") { i++; continue; }

    const pc = t.match(ANSWER_PERCHOICE_RE);
    if (pc) {
      const idxs = [...pc[1]].map((c) => "①②③④⑤".indexOf(c) + 1);
      const body = pc[2].trim();
      for (const idx of idxs) {
        const e = curAns.perChoice[idx] ?? "";
        curAns.perChoice[idx] = e ? e + " " + body : body;
      }
      i++;
      continue;
    }
    if (/^해설/.test(t)) {
      curAns.explanation += (curAns.explanation ? "\n" : "") + t.replace(/^해설\s*/, "");
      i++;
      continue;
    }
    curAns.explanation += (curAns.explanation ? "\n" : "") + t;
    i++;
  }
  if (curAns && cur) cur.answers.push(curAns);
  return { sections };
}

// ─── 매칭 + 출력 ───
const probRes = parseProblemChapter(problemDoc.paragraphs, TARGET);
const ansRes = parseAnswerChapter(answerDoc.paragraphs, TARGET);

console.log(`\n=== 제${TARGET}장 (총칙/보칙) ===`);
console.log(`PROBLEM book: ${probRes.sections.length} sections, ${probRes.sections.reduce((a, s) => a + s.problems.length, 0)} problems`);
console.log(`ANSWER  book: ${ansRes.sections.length} sections, ${ansRes.sections.reduce((a, s) => a + s.answers.length, 0)} answers`);

console.log(`\n--- Section 정렬 ---`);
const maxN = Math.max(probRes.sections.length, ansRes.sections.length);
let allOK = true;
for (let i = 0; i < maxN; i++) {
  const ps = probRes.sections[i];
  const as = ansRes.sections[i];
  const pName = ps ? `${ps.name}(${ps.articleHint}) ×${ps.problems.length}` : "—";
  const aName = as ? `${as.name}(${as.articleHint}) ×${as.answers.length}` : "—";
  const ok = ps && as && ps.problems.length === as.answers.length;
  if (!ok) allOK = false;
  console.log(`  [${String(i+1).padStart(2,"0")}] ${ok ? "✓" : "✗"}  PROB: ${pName.padEnd(40)} | ANS: ${aName}`);
}

console.log(`\n--- 매칭 결과 ---`);
let matched = 0, mismatched = 0;
for (let si = 0; si < probRes.sections.length; si++) {
  const ps = probRes.sections[si];
  const as = ansRes.sections[si];
  if (!as) {
    console.log(`\n  [Section ${si+1}] ${ps.name} — 답안 section 없음 (×${ps.problems.length} unmatched)`);
    mismatched += ps.problems.length;
    continue;
  }
  console.log(`\n  [Section ${si+1}] ${ps.name}(${ps.articleHint})  prob=${ps.problems.length} ans=${as.answers.length}`);
  const ansByN = new Map(as.answers.map((a) => [a.n, a]));
  for (const prob of ps.problems) {
    const ans = ansByN.get(prob.n);
    if (!ans) {
      console.log(`    × #${String(prob.n).padStart(2,"0")} — 답안 없음 | "${prob.stem.slice(0,60).replace(/\s+/g," ")}"`);
      mismatched++;
      continue;
    }
    const stemP = prob.stem.slice(0, 55).replace(/\s+/g, " ");
    const expP = (ans.explanation || Object.values(ans.perChoice)[0] || "").slice(0, 55).replace(/\s+/g, " ");
    console.log(`    ✓ #${String(prob.n).padStart(2,"0")} ${prob.year ?? ""}-${(prob.origin || "").slice(0,4)} 정답=${ans.correct}`);
    console.log(`       문제: ${stemP}`);
    console.log(`       해설: ${expP}`);
    matched++;
  }
}
console.log(`\n총: matched=${matched}, mismatched=${mismatched}, total=${matched+mismatched}`);
console.log(allOK ? "\n✓ 모든 section 정렬·개수 일치" : "\n⚠ section 정렬·개수 불일치 — 위 표 확인");
