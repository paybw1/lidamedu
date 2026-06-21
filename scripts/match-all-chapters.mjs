// 전 chapter (1~9 + 변형/모의/예상 chapter들) 매칭.
// 출력:
//   - source/_converted/match-report-all.txt  (사람용 요약)
//   - source/_converted/matched-problems.json (DB seed 용 — 문제 + 정답 + 해설 통합)

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const problemDoc = JSON.parse(readFileSync("source/_converted/problem.json", "utf8"));
const answerDoc = JSON.parse(readFileSync("source/_converted/answer.json", "utf8"));

// 그림 URL 매핑 — upload-explanation-images.mjs 산출물.
const IMAGE_MAP_PATH = "source/_converted/explanation-image-map.json";
const imageMap = existsSync(IMAGE_MAP_PATH)
  ? JSON.parse(readFileSync(IMAGE_MAP_PATH, "utf8"))
  : {};

// "[IMG:imageN]" 마커를 markdown 이미지로 치환. 매핑 없으면 placeholder.
function substituteImages(text, sourceTag) {
  if (!text) return text;
  return text.replace(/\[IMG:(image\d+)\]/g, (_, ref) => {
    const url = imageMap[`${sourceTag}:${ref}`];
    if (url) return `\n\n![](${url})\n\n`;
    return `\n\n_[그림 — wmf, 별도 변환 필요]_\n\n`;
  });
}

const CHAPTER_RE = /^제(\d+)장(?:\s+(.+))?$/;
const PROBLEM_RE = /^(\d{2})\s*['’]\s*(\d{2})\s*(변형|모의|예상)?\s*(단원|종합)?(.*)$/;
const PROBLEM_SPLIT_RE = /^(\d)\s*['’]\s*(\d{2})\s*(변형|모의|예상)?\s*(단원|종합)?\s*(\d)\s*(.*)$/;
const PROBLEM_NO_YEAR_RE = /^(\d{2})\s*(모의|예상)\s*(단원|종합)?(.*)$/;
const CHOICE_RE = /^([①②③④⑤])\s*(.+)$/;
// 박스 항목 마커: 한글 원문자 ㉠..㉭ 또는 한글 괄호문자 ㈎..㈛.
// 한 paragraph 가 마커로 시작하면 박스 항목.
const BOX_MARKER_RE = /^([㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭㈎㈏㈐㈑㈒㈓㈔㈕㈖㈗])\s*(.+)$/;
const ANSWER_HEADER_RE = /^(\d{2})\s*([①②③④⑤])\s*$/;
// 답안집 박스 항목 해설: "㈎ ✕, ..." / "㉠ ○, ..." — 마커는 보통 한글괄호.
const ANSWER_BOX_LINE_RE = /^([㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭㈎㈏㈐㈑㈒㈓㈔㈕㈖㈗])\s*([○✕XO])?\s*[,．、]?\s*(.*)$/;
// 복수 정답: "09 ③⑤"
const ANSWER_MULTI_RE = /^(\d{2})\s*([①②③④⑤]{2,})\s*$/;
// 정답 없음/취소: "05 답없음", "17 없음"
const ANSWER_NONE_RE = /^(\d{2})\s*(?:답\s*)?없음\s*$/;
const ANSWER_PERCHOICE_RE = /^([①②③④⑤]+)\s*(.+)$/;
const NAME_ONLY = /^[가-힣][가-힣\s,·]*$/;
// hint: 숫자/원숫자/의/콤마/공백/하이픈/로마숫자/괄호 + 조문 부속 키워드(본문, 단서, 각호, 전단, 후단 등).
const HINT_ONLY = /^[\d①-⑳의\s,\-Ⅰ-Ⅴ()발진법본문단서각호전후이상이하]+$/;

function compactLines(paragraphs) {
  const out = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const t = (p.text ?? "").trim();
    if (t) out.push({ idx: i, text: t, italic: !!p.italic, kind: p.kind ?? null, cells: p.cells ?? null });
  }
  return out;
}

function isChapterPara(text) {
  const m = text.match(CHAPTER_RE);
  if (m) return parseInt(m[1], 10);
  const m2 = text.match(/제(\d+)장/);
  if (m2 && /[•·]/.test(text)) return parseInt(m2[1], 10);
  return null;
}

// chapter 별 (start, end) 범위 — 같은 chapter 가 여러 번 나오면 첫 등장에서 시작, 다음 다른 chapter 직전까지.
function chapterRanges(lines) {
  const ranges = new Map(); // chapter num -> [start, end]
  let bookHeader = false;
  let curChStart = -1;
  let curCh = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    if (/문\s*[•·]\s*제\s*[•·]\s*편/.test(t) || /정답\s*및\s*해설/.test(t)) bookHeader = true;
    if (!bookHeader) continue;
    const ch = isChapterPara(t);
    if (ch != null) {
      if (curCh != null && ch !== curCh) {
        if (!ranges.has(curCh)) ranges.set(curCh, [curChStart, i]);
        curCh = ch;
        curChStart = i;
      } else if (curCh == null) {
        curCh = ch;
        curChStart = i;
      }
    }
  }
  if (curCh != null && !ranges.has(curCh)) ranges.set(curCh, [curChStart, lines.length]);
  return ranges;
}

function hasMarkerSoon(lines, from, lookahead, regex) {
  for (let k = from; k < Math.min(from + lookahead, lines.length); k++) {
    if (regex.test(lines[k].text)) return true;
  }
  return false;
}

function tryDetectSectionTriplet(lines, i, markerRe) {
  const cur = lines[i];
  // 형태 1: header 표 ([산업상 이용가능성, , 29①본문]) — 1행 표.
  if (cur.kind === "table" && Array.isArray(cur.cells) && cur.cells.length >= 1) {
    const row0 = cur.cells[0].map((x) => String(x ?? "").trim());
    // name 셀(첫번째 비빈 한글) + hint 셀(첫번째 비빈 hint 패턴) 분리.
    let name = "";
    let hint = "";
    for (const cell of row0) {
      if (!cell) continue;
      if (!name && NAME_ONLY.test(cell)) { name = cell; continue; }
      if (!hint && HINT_ONLY.test(cell)) { hint = cell; continue; }
    }
    if (name && hint && hasMarkerSoon(lines, i + 1, 8, markerRe))
      return { name, hint, nextIdx: i + 1 };
  }
  // 형태 2: 단일 paragraph 에 name+hint 가 concat (예: "목적1", "산업상 이용가능성29①본문").
  if (cur.kind !== "table") {
    const single = cur.text.match(
      /^([가-힣][가-힣\s,·]*?)([\d①-⑳의\s,\-Ⅰ-Ⅴ()발진법]+)$/,
    );
    if (single) {
      const name = single[1].trim();
      const hint = single[2].trim();
      if (name && hint && NAME_ONLY.test(name) && HINT_ONLY.test(hint)) {
        if (hasMarkerSoon(lines, i + 1, 8, markerRe))
          return { name, hint, nextIdx: i + 1 };
      }
    }
  }
  // 형태 3: 옛 3-paragraph triplet (혹시 남아있을 수 있음).
  if (i + 2 < lines.length) {
    const a = lines[i].text;
    const b = lines[i + 1].text;
    const c = lines[i + 2].text;
    if (NAME_ONLY.test(b) && HINT_ONLY.test(c)) {
      const expected = b.replace(/\s+/g, "") + c.replace(/\s+/g, "");
      const aNorm = a.replace(/\s+/g, "");
      if (aNorm.startsWith(expected.slice(0, Math.min(expected.length, 8)))) {
        if (hasMarkerSoon(lines, i + 3, 5, markerRe))
          return { name: b, hint: c, nextIdx: i + 3 };
      }
    }
  }
  return null;
}

function parseProblemChapter(lines, range, fallbackName) {
  if (!range) return [];
  const [start, end] = range;
  const sections = [];
  let cur = null;
  let i = start + 1;
  // section 없는 chapter (예: 실용신안법) 대비 — 문제가 먼저 나타나면 합성 section 생성.
  const ensureSection = () => {
    if (!cur) {
      cur = { name: fallbackName ?? "(전체)", articleHint: "", problems: [] };
      sections.push(cur);
    }
  };
  while (i < end) {
    const t = lines[i].text;
    const ch = isChapterPara(t);
    if (ch != null) { i++; continue; }

    const tri = tryDetectSectionTriplet(lines, i, /^\d{2}\s*['’]\s*\d{2}|^\d{2}\s*(모의|예상)|^\d\s*['’]\s*\d{2}/);
    if (tri) {
      cur = { name: tri.name, articleHint: tri.hint, problems: [] };
      sections.push(cur);
      i = tri.nextIdx;
      continue;
    }

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
    if (num != null && stem != null && stem.length > 5) {
      ensureSection();
      cur.problems.push({ n: num, year, origin: kind, scope, stem, choices: [], boxItems: [] });
      i++;
      continue;
    }

    // 박스 항목 — choice 보다 먼저 등장. 한 paragraph 안에 마커 2개 이상이면 concat 줄이므로 skip.
    if (cur && cur.problems.length > 0) {
      const last = cur.problems[cur.problems.length - 1];
      if (last.choices.length === 0) {
        const bm = t.match(BOX_MARKER_RE);
        if (bm) {
          const markerCount = (t.match(/[㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭㈎㈏㈐㈑㈒㈓㈔㈕㈖㈗]/g) ?? []).length;
          if (markerCount === 1) {
            if (!last.boxItems.some((x) => x.marker === bm[1])) {
              last.boxItems.push({
                position: last.boxItems.length + 1,
                marker: bm[1],
                body: bm[2].trim(),
              });
            }
            i++;
            continue;
          }
          // 마커 2개+ — concat. 다음 라인들이 단독 마커로 다시 등장하므로 그냥 skip.
          i++;
          continue;
        }
      }
    }

    // choice 처리 — 한 paragraph 에 여러 ① ② ③ 마커가 합쳐진 경우 분할.
    const splits = splitChoiceLine(t);
    if (splits.length > 0 && cur && cur.problems.length > 0) {
      const last = cur.problems[cur.problems.length - 1];
      for (const sp of splits) {
        if (last.choices.length >= 5) break;
        // 이미 같은 index 가 있으면 skip (중복 방지)
        if (last.choices.some((c) => c.index === sp.index)) continue;
        last.choices.push({ index: sp.index, body: sp.body, italic: lines[i].italic });
      }
    }
    i++;
  }
  return sections;
}

// "①㈎, ㈐② ㈎, ㈒③ ㈏, ㈐" → [{1, "㈎, ㈐"}, {2, "㈎, ㈒"}, {3, "㈏, ㈐"}]
function splitChoiceLine(text) {
  // 모든 ①-⑤ 위치 수집.
  const re = /[①②③④⑤]/g;
  const positions = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    positions.push({ idx: m.index, ch: m[0] });
  }
  if (positions.length === 0) return [];
  // 첫 마커 앞에 텍스트가 있으면 (① 시작이 아닌 경우) 무효 — choice 가 아닌 일반 문장.
  if (positions[0].idx > 0) return [];
  // ★ 순차 마커(직전+1)만 분할점으로 인정. 본문 중 비순차 인라인 원문자
  //   (예: 선지 ③ = "②의 경우…")는 그 선지 본문의 일부로 유지 → 선지 소실 방지.
  const splitPts = [positions[0]];
  let expected = "①②③④⑤".indexOf(positions[0].ch) + 1;
  for (let k = 1; k < positions.length; k++) {
    const idx = "①②③④⑤".indexOf(positions[k].ch) + 1;
    if (idx === expected + 1) {
      splitPts.push(positions[k]);
      expected = idx;
    }
  }
  const out = [];
  for (let k = 0; k < splitPts.length; k++) {
    const start = splitPts[k].idx + 1;
    const end = k + 1 < splitPts.length ? splitPts[k + 1].idx : text.length;
    const body = text.slice(start, end).trim();
    if (body) {
      out.push({ index: "①②③④⑤".indexOf(splitPts[k].ch) + 1, body });
    }
  }
  return out;
}

function parseAnswerChapter(lines, range, fallbackName) {
  if (!range) return [];
  const [start, end] = range;
  const sections = [];
  let cur = null, curAns = null;
  let i = start + 1;
  const ensureSection = () => {
    if (!cur) {
      cur = { name: fallbackName ?? "(전체)", articleHint: "", answers: [] };
      sections.push(cur);
    }
  };
  while (i < end) {
    const t = lines[i].text;
    const ch = isChapterPara(t);
    if (ch != null) { i++; continue; }

    const tri = tryDetectSectionTriplet(lines, i, /^\d{2}\s*(?:[①②③④⑤]+|답?없음)\s*$/);
    if (tri) {
      if (curAns && cur) cur.answers.push(curAns);
      curAns = null;
      cur = { name: tri.name, articleHint: tri.hint, answers: [] };
      sections.push(cur);
      i = tri.nextIdx;
      continue;
    }

    const ah = t.match(ANSWER_HEADER_RE);
    if (ah) {
      ensureSection();
      if (curAns) cur.answers.push(curAns);
      curAns = {
        n: parseInt(ah[1], 10),
        correct: "①②③④⑤".indexOf(ah[2]) + 1,
        correctList: ["①②③④⑤".indexOf(ah[2]) + 1],
        explanation: "",
        perChoice: {},
        perBoxItem: {},
      };
      i++;
      continue;
    }
    // 복수 정답 ("09 ③⑤")
    const am = t.match(ANSWER_MULTI_RE);
    if (am) {
      ensureSection();
      if (curAns) cur.answers.push(curAns);
      const list = [...am[2]].map((c) => "①②③④⑤".indexOf(c) + 1);
      curAns = {
        n: parseInt(am[1], 10),
        correct: list[0], // 표기상 첫 번째를 대표 정답으로
        correctList: list,
        explanation: "",
        perChoice: {},
        perBoxItem: {},
      };
      i++;
      continue;
    }
    // 정답 없음 ("05 답없음", "17 없음")
    const an = t.match(ANSWER_NONE_RE);
    if (an) {
      ensureSection();
      if (curAns) cur.answers.push(curAns);
      curAns = {
        n: parseInt(an[1], 10),
        correct: null,
        correctList: [],
        explanation: "",
        perChoice: {},
        perBoxItem: {},
        noAnswer: true,
      };
      i++;
      continue;
    }

    if (!curAns) { i++; continue; }
    if (t === "해설") { i++; continue; }

    // 박스 항목 해설 — "㈎ ✕, ..." / "㉠ ○, ..."
    const bx = t.match(ANSWER_BOX_LINE_RE);
    if (bx && bx[3] && bx[3].length > 0) {
      const marker = bx[1];
      const truthSign = bx[2] || ""; // ✕ or ○ or empty
      const body = bx[3].trim();
      const oxTruth = truthSign === "○" || truthSign === "O" ? "O" : truthSign === "✕" || truthSign === "X" ? "X" : null;
      const cur = curAns.perBoxItem[marker] ?? { explanation: "", oxTruth: null };
      cur.explanation = cur.explanation ? cur.explanation + " " + body : body;
      if (oxTruth && !cur.oxTruth) cur.oxTruth = oxTruth;
      curAns.perBoxItem[marker] = cur;
      i++;
      continue;
    }

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
  return sections;
}

const probLines = compactLines(problemDoc.paragraphs);
const ansLines = compactLines(answerDoc.paragraphs);
const probRanges = chapterRanges(probLines);
const ansRanges = chapterRanges(ansLines);

const allChapters = [...new Set([...probRanges.keys(), ...ansRanges.keys()])].sort((a, b) => a - b);

// per-choice 해설로 choice type 자동 분류 (statute / precedent / theory).
const STATUTE_RE =
  /法\s*\d+|특허법\s*제\s*\d+\s*조|법\s*제\s*\d+\s*조|시행령\s*제\s*\d+\s*조|시행규칙|발진법|제\s*\d+\s*조\s*제\s*\d+\s*항|^제\s*\d+\s*조/;
const PRECEDENT_RE =
  /대법원\s*\d{4}|헌법재판소|헌재\s*\d{4}|특허법원\s*\d{4}|선고\s*\d{2,4}\s*[다후카허]\s*\d+|\d{4}\s*[도후카허]\s*\d+|\d{2,4}\.\s*\d+\.\s*\d+\s*선고/;
function classifyChoice(text) {
  if (!text) return null;
  if (PRECEDENT_RE.test(text)) return "precedent";
  if (STATUTE_RE.test(text)) return "statute";
  return "theory";
}

const report = [];
const seederProblems = []; // problems-merged.json 호환 (seed-problems.mjs 가 읽음)
let totalProb = 0, totalMatched = 0, totalUnmatched = 0;
let totalProbBook = 0, totalAnsBook = 0;

// chapter 9 (실용신안법) 등 section-less chapter 의 fallback 이름.
const CHAPTER_FALLBACK_NAME = {
  8: "조약",
  9: "실용신안법",
};
for (const chN of allChapters) {
  const fallback = CHAPTER_FALLBACK_NAME[chN] ?? null;
  const probSecs = parseProblemChapter(probLines, probRanges.get(chN), fallback);
  const ansSecs = parseAnswerChapter(ansLines, ansRanges.get(chN), fallback);
  const pCount = probSecs.reduce((a, s) => a + s.problems.length, 0);
  const aCount = ansSecs.reduce((a, s) => a + s.answers.length, 0);
  totalProbBook += pCount;
  totalAnsBook += aCount;

  report.push(`\n=== 제${chN}장 ===`);
  report.push(`PROB: ${probSecs.length} sections, ${pCount} problems`);
  report.push(`ANS:  ${ansSecs.length} sections, ${aCount} answers`);

  const maxN = Math.max(probSecs.length, ansSecs.length);
  for (let i = 0; i < maxN; i++) {
    const ps = probSecs[i];
    const as = ansSecs[i];
    const pInfo = ps ? `${ps.name}(${ps.articleHint}) ×${ps.problems.length}` : "—";
    const aInfo = as ? `${as.name}(${as.articleHint}) ×${as.answers.length}` : "—";
    const ok = ps && as && ps.problems.length === as.answers.length;
    report.push(`  [${String(i+1).padStart(2,"0")}] ${ok ? "✓" : "✗"}  P: ${pInfo.padEnd(40)} | A: ${aInfo}`);
  }

  let chMatched = 0, chUnmatched = 0;
  for (let si = 0; si < probSecs.length; si++) {
    const ps = probSecs[si];
    const as = ansSecs[si];
    totalProb += ps.problems.length;
    if (!as) {
      chUnmatched += ps.problems.length;
      continue;
    }
    const ansByN = new Map(as.answers.map((a) => [a.n, a]));
    for (const prob of ps.problems) {
      const ans = ansByN.get(prob.n);
      if (!ans) {
        chUnmatched++;
        continue;
      }
      chMatched++;
      // choice 별 해설 + 자동 분류.
      const choiceTypes = {};
      for (const c of prob.choices) {
        const exp = ans.perChoice[c.index] ?? ans.explanation;
        choiceTypes[c.index] = classifyChoice(exp);
      }
      // 박스 항목별 해설/OX truth 합치기.
      const boxItems = (prob.boxItems ?? []).map((bi) => {
        const perBox = ans.perBoxItem?.[bi.marker] ?? {};
        return {
          position: bi.position,
          marker: bi.marker,
          body: bi.body,
          explanation: perBox.explanation ?? null,
          oxTruth: perBox.oxTruth ?? null,
          choiceType: classifyChoice(perBox.explanation ?? bi.body),
        };
      });
      const isBoxFormat = boxItems.length > 0;
      // 이미지 마커 → URL 치환.
      const stemSub = substituteImages(prob.stem, "problem");
      const explanationSub = substituteImages(ans.explanation, "answer");
      const perChoiceSub = {};
      for (const k of Object.keys(ans.perChoice ?? {})) {
        perChoiceSub[k] = substituteImages(ans.perChoice[k], "answer");
      }
      const choicesSub = prob.choices.map((c) => ({ ...c, body: substituteImages(c.body, "problem") }));
      const boxItemsSub = boxItems.map((bi) => ({
        ...bi,
        body: substituteImages(bi.body, "problem"),
        explanation: substituteImages(bi.explanation, "answer"),
      }));
      seederProblems.push({
        chapter: chN,
        chapterTitle: null,
        section: ps.name,
        articleHint: ps.articleHint,
        problemNumber: prob.n,
        year: prob.year,
        origin: prob.origin,
        scope: prob.scope,
        stem: stemSub,
        choices: choicesSub,
        boxItems: boxItemsSub,
        format: isBoxFormat ? "mc_box" : null, // null 이면 seeder 가 stem 으로 inferFormat
        correctIndex: ans.correct,
        correctList: ans.correctList ?? (ans.correct != null ? [ans.correct] : []),
        noAnswer: !!ans.noAnswer,
        explanation: explanationSub,
        choiceExplanations: perChoiceSub,
        choiceTypes,
      });
    }
  }
  totalMatched += chMatched;
  totalUnmatched += chUnmatched;
  report.push(`  → matched=${chMatched}, unmatched=${chUnmatched}`);
}

report.push(`\n========= 전체 =========`);
report.push(`문제집 총 problem: ${totalProbBook}`);
report.push(`답안집 총 answer:  ${totalAnsBook}`);
report.push(`매칭 성공: ${totalMatched} / ${totalProb} (${((totalMatched/totalProb)*100).toFixed(1)}%)`);
report.push(`미매칭:    ${totalUnmatched}`);

const reportPath = "source/_converted/match-report-all.txt";
writeFileSync(reportPath, report.join("\n"), "utf8");
console.log(`✓ ${reportPath}`);

const jsonPath = "source/_converted/problems-merged.json";
writeFileSync(jsonPath, JSON.stringify({ problems: seederProblems }, null, 2), "utf8");
console.log(`✓ ${jsonPath} (${seederProblems.length} problems, seeder 포맷)`);

console.log(report.slice(-6).join("\n"));
