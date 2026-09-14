// 리담상표법 객관식 문제집 (제4판) 파서 — 문제·선지·해설·정답을 한 파일에서 뽑는다.
//
// ★제4판의 성격: 「기출문제를 연도별이 아닌 **주제별**로 다시 정리」(머리말). 종전 판은
//   문제편/해설편 2파일이었는데, 제4판은 **문제 바로 아래에 해설**이 붙고 해설 끝에 정답이 있다.
//
// ★★설계: 「문단을 하나씩 보며 상태를 바꾸는」 방식은 변형에 부서진다(실측으로 확인).
//   그래서 **① 문제 머리로 구간을 자르고 ② 구간 안에서 분류**한다. 해설 표기가
//   `| 해 설 |` · `해설①` · `해설㉠` · `| (comment) …` · `| 지문 ①의 경우 …` 로 최소 5종이고,
//   정답이 해설과 **다른 문단**에 있는 경우도 있기 때문이다.
//
// 사용:
//   node scripts/hwpx-to-text.mjs "<제4판.hwpx>" -o tmp/tm4.json
//   node scripts/parse-tm-mcq-4th.mjs tmp/tm4.json -o tmp/tm4-parsed.json

import { readFileSync, writeFileSync } from "node:fs";

const CIRCLE = "①②③④⑤";
const circleIndex = (ch) => CIRCLE.indexOf(ch);

/**
 * 문제 머리의 번호.
 *
 * ★번호와 발문 사이에 **공백이 있기도 없기도** 하고(94~106 은 공백 있음), 발문이
 *   **숫자로 시작**하기도 한다(196 = 「1962001년 한글과…」). 그래서 「번호 뒤에 오는
 *   글자」로 경계를 잡으면 안 된다 — 실제로 그 방식이 14문항을 조용히 빠뜨렸다.
 *   경계의 권위는 **연도 마커**(‘YY 기출)이고, 번호는 책이 1부터 끊김 없이 올라가므로
 *   **기대 번호와 대조**해 검증한다.
 */
const HEAD_NUM_RE = /^(\d{1,3})/;
const YEAR_RE = /[‘'’]\s?(\d{2})\s*기\s*출/;

/** 해설 구간의 시작 신호 — 최소 5종이라 하나로 못 잡는다. */
function isExplanationStart(t) {
  if (/\|\s*해\s*설\s*\|/.test(t)) return true;
  if (/^\s*해\s*설\s*(?=[①-⑤ㄱ-ㅎ㉠-㉪\[])/.test(t)) return true;
  if (/\(comment\)/.test(t)) return true;
  // 판정 마커가 2개 이상이면 해설 본문이다(선지에는 [○]/[×] 가 붙지 않는다).
  const marks = [...t.matchAll(/\[\s*[○Оo×xX✕✖△]\s*\]/g)].length;
  if (marks >= 2) return true;
  if (/^\|\s*지문\s*[①-⑤]/.test(t)) return true;
  return false;
}

/**
 * 한 줄에 병합된 선지를 쪼갠다 — `① ㄱ, ㄴ② ㄱ, ㄷ③ ㄱ, ㅁ`.
 *
 * ★**단조 증가할 때만** 쪼갠다. 본문이 다른 선지를 인용하는 경우(「②의 경우…」)를
 *   선지 경계로 오인하면 지문이 잘리고 선지가 하나 사라진다 — 특허에서 실제로 났던 사고다.
 */
function splitMergedChoices(line) {
  const hits = [...line.matchAll(/([①②③④⑤])/g)];
  if (hits.length <= 1) return null;
  const idxs = hits.map((h) => circleIndex(h[1]));
  for (let k = 1; k < idxs.length; k++) if (idxs[k] !== idxs[k - 1] + 1) return null;
  const out = [];
  for (let k = 0; k < hits.length; k++) {
    const from = hits[k].index + 1;
    const to = k + 1 < hits.length ? hits[k + 1].index : line.length;
    out.push({ index: idxs[k], text: line.slice(from, to).trim() });
  }
  return out;
}

/**
 * 해설 끝의 정답을 뽑는다.
 *
 * ★반드시 **마지막** 것을 쓴다 — 해설 본문에 「…일단 정답은 ⑤로 보아야 한다」 같은
 *   문장이 섞여 있어, 첫 번째 '정답'을 잡으면 엉뚱한 값이 나온다(실측 6건 오탐).
 */
function extractAnswer(chunk) {
  const hits = [...chunk.matchAll(/정\s*답\s*([^|\n]{0,40})/g)];
  if (!hits.length) return { picks: [], raw: null, none: false };
  const raw = hits[hits.length - 1][1].trim();
  const head = raw.split(/[.。]/)[0];
  const picks = [...new Set([...head].filter((c) => CIRCLE.includes(c)).map(circleIndex))].sort(
    (a, b) => a - b,
  );
  return { picks, raw, none: /없\s*음/.test(head) };
}

/** 해설 덩어리를 선지별로 쪼갠다. ①/ㄱ./㉠ 세 표기를 모두 받는다. */
function splitPerChoice(text, choiceCount) {
  const body = text
    .replace(/\|\s*해\s*설\s*\|/g, " ")
    .replace(/^\s*해\s*설\s*/, "")
    .replace(/\(comment\)/g, " ");
  const KO = "ㄱㄴㄷㄹㅁㅂㅅ";
  const CIRC_KO = "㉠㉡㉢㉣㉤㉥㉦";
  const out = new Map();
  // 마커 + [판정] 이 붙은 것만 선지 경계로 본다(인용 오분할 방지).
  const re = new RegExp(
    "([" + CIRCLE + CIRC_KO + "]|[" + KO + "]\\s*\\.)\\s*\\[\\s*([○Оo×xX✕✖△])\\s*\\]",
    "g",
  );
  const marks = [...body.matchAll(re)];
  for (let k = 0; k < marks.length; k++) {
    const tok = marks[k][1].replace(/[\s.]/g, "");
    let idx = circleIndex(tok);
    if (idx < 0) idx = CIRC_KO.indexOf(tok);
    if (idx < 0) idx = KO.indexOf(tok);
    if (idx < 0 || idx >= choiceCount) continue;
    const from = marks[k].index;
    const to = k + 1 < marks.length ? marks[k + 1].index : body.length;
    if (!out.has(idx)) out.set(idx, body.slice(from, to).trim());
  }
  return out;
}

/** 발문 극성 — 「옳지 않은/틀린/아닌」이면 negative. */
function inferPolarity(stem) {
  return /옳지\s*않은|틀린|잘못된|아닌\s*것|아니한\s*것|않는\s*것/.test(stem)
    ? "negative"
    : "positive";
}

function parse(paragraphs) {
  const ps = paragraphs.map((p) => (typeof p === "string" ? p : (p.text ?? "")));

  // ── 1단계: 문제 머리로 구간 자르기 ─────────────────────────────────────────
  const heads = [];
  let expected = 1;
  const mismatches = [];
  ps.forEach((t, i) => {
    const s = t.trim();
    if (!YEAR_RE.test(s)) return;
    const m = HEAD_NUM_RE.exec(s);
    if (!m) return;
    const no = Number(m[1]);
    if (no !== expected) mismatches.push({ para: i, got: no, expected });
    expected = no + 1;
    // ★자른 길이는 **매칭된 문자열**이어야 한다 — 1~9 번은 「01」~「09」로 0이 붙어 있어
    //   String(no).length 로 자르면 발문 앞에 숫자가 한 자 남는다(실측 9건).
    heads.push({ no, para: i, numLen: m[1].length, year: Number(YEAR_RE.exec(s)[1]) });
  });
  if (mismatches.length) {
    // ★한 칸이라도 어긋나면 발문·해설이 통째로 남의 것이 됐을 수 있다. 조용히 넘어가지 않는다.
    console.warn(
      "★번호 불연속 " +
        mismatches.length +
        "건 — " +
        mismatches.map((m) => "¶" + m.para + " 기대 " + m.expected + " → 실제 " + m.got).join(", "),
    );
  }

  // ── 2단계: 구간 안에서 분류 ────────────────────────────────────────────────
  const problems = [];
  for (let h = 0; h < heads.length; h++) {
    const { no, para, year, numLen } = heads[h];
    const end = h + 1 < heads.length ? heads[h + 1].para : ps.length;
    const headText = ps[para].trim();
    const stem = headText.slice(numLen).replace(YEAR_RE, "").trim();

    const choices = [];
    const boxLines = [];
    const explanationParas = [];
    let inExplanation = false;

    for (let i = para + 1; i < end; i++) {
      const t = ps[i].trim();
      if (!t) continue;
      if (!inExplanation && isExplanationStart(t)) inExplanation = true;
      if (inExplanation) {
        explanationParas.push(t);
        continue;
      }
      const merged = splitMergedChoices(t);
      if (merged && /^[①②③④⑤]/.test(t)) {
        choices.push(...merged);
        continue;
      }
      const single = /^([①②③④⑤])\s*(.*)$/s.exec(t);
      if (single) {
        choices.push({ index: circleIndex(single[1]), text: single[2].trim() });
        continue;
      }
      if (choices.length === 0) boxLines.push(t);
      else choices[choices.length - 1].text += "\n" + t;
    }

    const explanationRaw = explanationParas.join("\n");
    const ans = extractAnswer(explanationRaw);
    const perChoice = splitPerChoice(explanationRaw, Math.max(choices.length, 5));

    problems.push({
      no,
      year: year <= 90 ? 2000 + year : 1900 + year,
      stem,
      polarity: inferPolarity(stem),
      box: boxLines.join("\n") || null,
      choices: choices.sort((a, b) => a.index - b.index),
      choiceExplanations: [...perChoice.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([index, md]) => ({ index, md })),
      explanationRaw: explanationRaw || null,
      answers: ans.picks,
      answerRaw: ans.raw,
      answerNone: ans.none,
      paraIndex: para,
    });
  }
  return problems;
}

// ── main ──────────────────────────────────────────────────────────────────────
const [, , inPath, ...rest] = process.argv;
if (!inPath) {
  console.error("사용: node scripts/parse-tm-mcq-4th.mjs <hwpx-to-text.json> [-o out.json]");
  process.exit(1);
}
const oi = rest.indexOf("-o");
const outPath = oi >= 0 ? rest[oi + 1] : null;

const doc = JSON.parse(readFileSync(inPath, "utf8"));
const problems = parse(doc.paragraphs ?? doc);

const nums = problems.map((p) => p.no);
const gaps = [];
for (let n = 1; n <= Math.max(...nums); n++) if (!nums.includes(n)) gaps.push(n);

const checks = {
  "선지≠5": problems.filter((p) => p.choices.length !== 5),
  해설없음: problems.filter((p) => !p.explanationRaw),
  정답없음: problems.filter((p) => p.answers.length === 0 && !p.answerNone),
  "정답=없음(출제오류)": problems.filter((p) => p.answerNone),
  복수정답: problems.filter((p) => p.answers.length > 1),
  선지해설부족: problems.filter(
    (p) => p.explanationRaw && p.choiceExplanations.length < p.choices.length,
  ),
};

console.log("문항:", problems.length, "| 번호:", Math.min(...nums), "~", Math.max(...nums));
console.log("결번:", gaps.length ? gaps.join(",") : "없음");
for (const [k, v] of Object.entries(checks)) {
  console.log(`${k}: ${v.length}` + (v.length && v.length <= 25 ? "  → " + v.map((p) => p.no).join(",") : ""));
}

// ★정답 교차검증 — 해설의 [○]/[×] 와 발문 극성으로 역산한 값이 표기 정답과 맞는가.
//   둘이 어긋나면 파싱이 밀렸거나 교재가 특이한 것이다. 어느 쪽이든 사람이 봐야 한다.
const crossBad = [];
for (const p of problems) {
  if (p.answers.length !== 1 || p.choiceExplanations.length < p.choices.length) continue;
  const wrongOnes = p.choiceExplanations
    .filter((c) => /\[\s*[×xX✕✖]\s*\]/.test(c.md.slice(0, 8)))
    .map((c) => c.index);
  const derived = p.polarity === "negative" ? wrongOnes : p.choiceExplanations
    .filter((c) => /\[\s*[○Оo]\s*\]/.test(c.md.slice(0, 8)))
    .map((c) => c.index);
  if (derived.length === 1 && derived[0] !== p.answers[0]) {
    crossBad.push({ no: p.no, 표기: p.answers[0] + 1, 역산: derived[0] + 1, polarity: p.polarity });
  }
}
console.log(
  "\n정답 교차검증 불일치:",
  crossBad.length,
  crossBad.length && crossBad.length <= 30
    ? "\n  " + crossBad.map((c) => `[${c.no}] 표기 ${c.표기} vs 역산 ${c.역산} (${c.polarity})`).join("\n  ")
    : "",
);

if (outPath) {
  writeFileSync(outPath, JSON.stringify(problems, null, 2), "utf8");
  console.log("\n저장:", outPath);
}
