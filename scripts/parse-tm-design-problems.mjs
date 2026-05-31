// [내지] 리담 상표+디자인 기출문제편 [제3판].hwpx (paragraphs JSON) → problems-merged
// 형식 JSON.
//
// 입력: source/_converted/tm-design-problems.json  (hwpx-to-text 출력)
// 출력: source/_converted/tm-design-problems-parsed.json
//
// 구조 (자동 감지):
//   - 상표법 영역: paragraph "02디자인보호법 기출문제" 이전 / "제2장디자인보호법 …" 이후가 design
//   - 회차 마커: `| NN회(YYYY년도) 기출문제 …|` 다음 줄 `| --- |`
//   - 문제 시작: `^\s*(\d+)\.\s*(.+)` (1-60 정도)
//   - 보기: `^([①②③④⑤])\s*(.+)`
//   - 표 형태 문제: `| ㄱ. ... ㄴ. ... |` — stem 에 그대로 보존
//
// patent 의 parse-problems.mjs 와 출력 schema 호환:
//   { lawCode, problems: [{ year, origin, problemNumber, stem, choices, scope, ... }] }

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const IN = resolve(ROOT, "source/_converted/tm-design-problems.json");
const OUT = resolve(
  ROOT,
  "source/_converted/tm-design-problems-parsed.json",
);

const doc = JSON.parse(readFileSync(IN, "utf8"));
const paragraphs = doc.paragraphs ?? [];

const ROUND_RE = /^\|\s*(\d+)회\(\s*(\d{4})년도\s*\)\s*기출문제\s*(?:\([^)]+\))?\s*\|/;
// 점은 옵션 — 62/63회는 "21." 형태, 그 이전은 "21" 점 없는 형태. (회차 안에서 문제번호
// 21~40 정도이므로 본문 줄에서 잘못 매칭될 위험을 줄이려고 시작 숫자가 1-99 인 것만 인정.)
const PROBLEM_RE = /^(\d{1,2})\.?\s*(.+)$/;
const CHOICE_RE = /^([①②③④⑤])\s*(.+)$/;
const CIRCLE_TO_NUM = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };

// 디자인 영역 시작 마커 (목차에 의해 알려진 paragraph 위치 도 OK)
const DESIGN_AREA_RE = /제2장.*디자인보호법.*기출문제/;

// 머리/꼬리 잡문구
const SKIP_RE =
  /^(제1장.*상표법|제2장.*디자인보호법|理談|기출문제집|LIDAM|문•제•편|Contents)/;

const problems = [];
let lawCode = "trademark"; // 시작 영역
let round = null; // { round, year }
let cur = null; // 현재 문제 누적

function flush() {
  if (cur && cur.stem && cur.choices.length >= 2) {
    problems.push(cur);
  }
  cur = null;
}

for (let i = 0; i < paragraphs.length; i++) {
  const p = paragraphs[i];
  const text = (p.text ?? "").trim();
  if (!text) continue;

  // 디자인 영역 전환
  if (DESIGN_AREA_RE.test(text)) {
    flush();
    lawCode = "design";
    round = null;
    cur = null;
    continue;
  }

  // 회차 마커
  const mRound = ROUND_RE.exec(text);
  if (mRound) {
    flush();
    round = { round: Number(mRound[1]), year: Number(mRound[2]) };
    cur = null;
    continue;
  }
  // 마크다운 표 separator 라인 (회차 마커 직후) 무시
  if (/^\|\s*---/.test(text)) continue;

  if (SKIP_RE.test(text)) continue;

  // 문제 헤더
  const mProb = PROBLEM_RE.exec(text);
  if (mProb && round) {
    flush();
    cur = {
      lawCode,
      year: round.year,
      round: round.round,
      origin: `${round.round}회(${round.year}년도)`,
      problemNumber: Number(mProb[1]),
      stem: mProb[2].trim(),
      choices: [],
      scope: "past_exam",
    };
    continue;
  }

  // 보기
  const mChoice = CHOICE_RE.exec(text);
  if (mChoice && cur) {
    cur.choices.push({
      index: CIRCLE_TO_NUM[mChoice[1]],
      body: mChoice[2].trim(),
    });
    continue;
  }

  // 한 줄에 여러 보기가 같이 있는 경우 (예: "① ㄱ, ㄴ      ② ㄱ, ㄷ ...")
  // ① 로 시작하면서 ② ③ 등도 포함하는 패턴.
  if (cur && /[①②③④⑤]/.test(text)) {
    const parts = text.split(/(?=[①②③④⑤])/).filter((s) => s.trim());
    let added = 0;
    for (const part of parts) {
      const m = CHOICE_RE.exec(part.trim());
      if (m) {
        cur.choices.push({
          index: CIRCLE_TO_NUM[m[1]],
          body: m[2].trim(),
        });
        added += 1;
      }
    }
    if (added > 0) continue;
  }

  // 그 외 — 현재 문제의 stem 또는 마지막 choice 본문 연장
  if (cur) {
    if (cur.choices.length === 0) {
      cur.stem += " " + text;
    } else {
      cur.choices[cur.choices.length - 1].body += " " + text;
    }
  }
}
flush();

// 통계
const stats = {
  total: problems.length,
  trademark: problems.filter((p) => p.lawCode === "trademark").length,
  design: problems.filter((p) => p.lawCode === "design").length,
  byRound: {},
  withFiveChoices: problems.filter((p) => p.choices.length === 5).length,
  withLessChoices: problems.filter((p) => p.choices.length < 5).length,
};
for (const p of problems) {
  const key = `${p.lawCode} ${p.origin}`;
  stats.byRound[key] = (stats.byRound[key] ?? 0) + 1;
}

writeFileSync(OUT, JSON.stringify({ problems, stats }, null, 2), "utf8");
console.log(`✓ ${OUT}`);
console.log(`  total=${stats.total} (trademark=${stats.trademark}, design=${stats.design})`);
console.log(`  5-choice=${stats.withFiveChoices}, <5-choice=${stats.withLessChoices}`);
console.log("  rounds:");
const sortedRounds = Object.entries(stats.byRound).sort();
for (const [k, v] of sortedRounds) {
  console.log(`    ${k}: ${v}`);
}
