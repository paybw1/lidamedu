// [내지] 리담 상표+디자인 기출해설편 → 정답/해설 추출 후 문제편과 매칭.
//
// 입력:
//   source/_converted/tm-design-answers.json         (hwpx-to-text)
//   source/_converted/tm-design-problems-parsed.json (parse-tm-design-problems)
// 출력:
//   source/_converted/tm-design-merged.json
//
// 해설 표기:
//   "23정답⑤"             — 문제번호 + "정답" + 정답 보기 (한 paragraph)
//   "정답" / "해설"        — 단독 라벨 (무시)
//   "해설① [○] ..."       — 정답 보기 해설 (paragraph 시작이 "해설" + 보기 마커)
//   "② [×] ..."           — 다른 보기 해설
//   "㉠ [○] ..."           — 박스 항목 해설 (보기 5개 외 추가)
//
// 디자인 영역: paragraph "제2장 ... 디자인보호법" 헤더 이후.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const ansDoc = JSON.parse(
  readFileSync(resolve(ROOT, "source/_converted/tm-design-answers.json"), "utf8"),
);
const probDoc = JSON.parse(
  readFileSync(
    resolve(ROOT, "source/_converted/tm-design-problems-parsed.json"),
    "utf8",
  ),
);

const ROUND_RE = /^\|\s*(\d+)회\(\s*(\d{4})년도\s*\)\s*정답\s*및\s*해설/;
const DESIGN_AREA_RE = /제2장.*디자인보호법.*(정답|해설)/;
// "23정답⑤" 또는 "23 정답 ⑤" — 숫자(1-99) + "정답" + 보기 마커.
const ANSWER_RE = /^(\d{1,2})\s*정답\s*([①②③④⑤])/;
const CIRCLE_TO_NUM = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
// 보기 해설 — "해설① [○]" 또는 "① [×]" 또는 "②④⑤ [×]" (복수 보기 동시 표시)
const EXPL_RE = /^(?:해설\s*)?([①②③④⑤]+)\s*(?:\[([○×])\])?\s*(.*)$/;
// 박스 항목 해설 (㉠㉡㉢㉣㉤)
const BOX_EXPL_RE = /^(?:해설\s*)?([㉠㉡㉢㉣㉤]+)\s*(?:\[([○×])\])?\s*(.*)$/;
// 잡 노이즈
const SKIP_RE =
  /^(제1장|제2장|理談|기출문제집|LIDAM|정답 및 해설|문•제•편|Contents|^정답$|^해설$)/;

const answers = [];
let lawCode = "trademark";
let round = null;
let cur = null;

function flushCur() {
  if (cur && cur.correctIndex) answers.push(cur);
  cur = null;
}

for (let i = 0; i < ansDoc.paragraphs.length; i++) {
  const text = (ansDoc.paragraphs[i].text ?? "").trim();
  if (!text) continue;

  if (DESIGN_AREA_RE.test(text)) {
    if (lawCode !== "design") {
      flushCur();
      lawCode = "design";
      round = null;
    }
    continue;
  }
  const mRound = ROUND_RE.exec(text);
  if (mRound) {
    flushCur();
    round = { round: Number(mRound[1]), year: Number(mRound[2]) };
    continue;
  }
  if (/^\|\s*---/.test(text)) continue;
  // skip 한 줄짜리 정답/해설 라벨 (단독으로 다른 의미 없음)
  if (text === "정답" || text === "해설") continue;
  if (SKIP_RE.test(text)) continue;

  // 새 정답 헤더
  const mAns = ANSWER_RE.exec(text);
  if (mAns && round) {
    flushCur();
    cur = {
      lawCode,
      year: round.year,
      round: round.round,
      problemNumber: Number(mAns[1]),
      correctIndex: CIRCLE_TO_NUM[mAns[2]],
      explanation: "",
      choiceExplanations: {},
      boxExplanations: {},
    };
    continue;
  }

  // 보기 해설 — 한 paragraph 에 "① [○] body1 ② [×] body2 ③ [○] body3 …" 식으로
  // 다중 보기가 합쳐진 경우(design 2025+ 해설) 도 split 하여 모두 흡수.
  if (cur) {
    const stripped = text.replace(/^해설\s*/, "");
    if (/^[①②③④⑤]/.test(stripped)) {
      const parts = stripped.split(/(?=[①②③④⑤]+\s*\[[○×]\])/);
      let consumed = false;
      for (const part of parts) {
        const m = /^([①②③④⑤]+)\s*(?:\[([○×])\])?\s*([\s\S]*)$/.exec(part.trim());
        if (!m || !/[①②③④⑤]/.test(m[1])) continue;
        const body = m[3].trim();
        for (const ch of m[1]) {
          const idx = CIRCLE_TO_NUM[ch];
          if (idx) cur.choiceExplanations[idx] = body;
        }
        consumed = true;
      }
      if (consumed) continue;
    }
    // 박스 ㉠~㉤
    if (/^[㉠㉡㉢㉣㉤]/.test(stripped)) {
      const parts = stripped.split(/(?=[㉠㉡㉢㉣㉤]+\s*\[[○×]\])/);
      let consumed = false;
      for (const part of parts) {
        const m = /^([㉠㉡㉢㉣㉤]+)\s*(?:\[([○×])\])?\s*([\s\S]*)$/.exec(part.trim());
        if (!m) continue;
        const body = m[3].trim();
        for (const ch of m[1]) cur.boxExplanations[ch] = body;
        consumed = true;
      }
      if (consumed) continue;
    }
    // explanation 본문/연장
    if (cur.explanation) cur.explanation += " " + text;
    else cur.explanation = text;
  }
}
flushCur();

// 문제와 매칭 — (lawCode, year, problemNumber) 키 기준.
function key(p) {
  return `${p.lawCode}|${p.year}|${p.problemNumber}`;
}
const ansMap = new Map(answers.map((a) => [key(a), a]));

const merged = [];
let matched = 0;
let unmatched = 0;
for (const prob of probDoc.problems) {
  const a = ansMap.get(key(prob));
  if (a) {
    matched += 1;
    merged.push({
      ...prob,
      correctIndex: a.correctIndex,
      explanation: a.explanation || null,
      choiceExplanations: a.choiceExplanations,
      boxExplanations:
        Object.keys(a.boxExplanations).length > 0 ? a.boxExplanations : undefined,
    });
  } else {
    unmatched += 1;
    merged.push({ ...prob, correctIndex: null });
  }
}

const stats = {
  problems: probDoc.problems.length,
  answers: answers.length,
  matched,
  unmatched,
  withExplanation: merged.filter((p) => p.explanation).length,
  with5ChoiceExplanations: merged.filter(
    (p) => Object.keys(p.choiceExplanations ?? {}).length === 5,
  ).length,
};

writeFileSync(
  resolve(ROOT, "source/_converted/tm-design-merged.json"),
  JSON.stringify({ problems: merged, stats }, null, 2),
  "utf8",
);
console.log("✓ source/_converted/tm-design-merged.json");
console.log(stats);
if (unmatched > 0) {
  console.log("--- unmatched (first 10) ---");
  for (const p of merged.filter((p) => p.correctIndex == null).slice(0, 10)) {
    console.log(`  ${p.lawCode} ${p.year} #${p.problemNumber}: ${p.stem.slice(0, 50)}`);
  }
}
