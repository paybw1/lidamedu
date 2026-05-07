// 두 hwpx 파싱 결과(problem.json, answer.json)의 chapter/section 골격을 비교.
// 매칭 키 분포와 sections 순서가 두 책에서 일치하는지 확인.

import { readFileSync } from "node:fs";

const problemDoc = JSON.parse(readFileSync("source/_converted/problem.json", "utf8"));
const answerDoc = JSON.parse(readFileSync("source/_converted/answer.json", "utf8"));

const CHAPTER_RE = /^제(\d+)장\s+(.+)$/;
const SECTION_RE = /^([^()]+?)\s*\(\s*([\d①-⑳의\s,\-]+)\s*\)\s*(\d+)?\s*$/;
const PROBLEM_RE = /^(\d{2})\s*['’]\s*(\d{2})\s*(변형|모의|예상)?\s*(단원|종합)?(.*)$/;
const PROBLEM_NO_YEAR_RE = /^(\d{2})\s*(모의|예상)\s*(단원|종합)?(.*)$/;
const ANSWER_HEADER_RE = /^(\d{2})\s*([①②③④⑤])\s*$/;

function skeleton(paragraphs, headerRegex, kind) {
  const out = [];
  let curCh = null, curChTitle = null, curSec = null, curArt = null;
  let bookHeaderSeen = false;
  for (const p of paragraphs) {
    const text = (p.text ?? "").trim();
    if (!text) continue;
    if (kind === "problem" && /문\s*[•·]\s*제\s*[•·]\s*편/.test(text)) {
      bookHeaderSeen = true;
      continue;
    }
    if (kind === "answer" && /정답\s*및\s*해설/.test(text)) {
      bookHeaderSeen = true;
      continue;
    }
    if (!bookHeaderSeen) continue;

    const ch = text.match(CHAPTER_RE);
    if (ch) {
      curCh = parseInt(ch[1], 10);
      curChTitle = ch[2];
      curSec = null;
      curArt = null;
      out.push({ kind: "chapter", chapter: curCh, title: curChTitle });
      continue;
    }
    const sec = text.match(SECTION_RE);
    if (sec && /[①-⑳\d]/.test(sec[2])) {
      curSec = sec[1].trim();
      curArt = sec[2].trim();
      out.push({ kind: "section", chapter: curCh, section: curSec, articleHint: curArt });
      continue;
    }
    if (kind === "problem") {
      const m = text.match(PROBLEM_RE) || text.match(PROBLEM_NO_YEAR_RE);
      if (m) {
        const num = parseInt(m[1], 10);
        out.push({ kind: "problem", chapter: curCh, section: curSec, n: num });
      }
    } else {
      const m = text.match(ANSWER_HEADER_RE);
      if (m) {
        const num = parseInt(m[1], 10);
        const corr = "①②③④⑤".indexOf(m[2]) + 1;
        out.push({ kind: "answer", chapter: curCh, section: curSec, n: num, correct: corr });
      }
    }
  }
  return out;
}

function normSection(s) { return (s ?? "").replace(/[^가-힣0-9]/g, ""); }

const probSk = skeleton(problemDoc.paragraphs, null, "problem");
const ansSk = skeleton(answerDoc.paragraphs, null, "answer");

function summary(sk, label) {
  const chapters = sk.filter((x) => x.kind === "chapter");
  const sections = sk.filter((x) => x.kind === "section");
  const items = sk.filter((x) => x.kind === "problem" || x.kind === "answer");
  console.log(`\n=== ${label} ===`);
  console.log(`chapters=${chapters.length}, sections=${sections.length}, items=${items.length}`);
  for (const ch of chapters) {
    const chSecs = sk.filter((x) => x.kind === "section" && x.chapter === ch.chapter);
    const chItems = sk.filter((x) => x.kind === items[0].kind && x.chapter === ch.chapter);
    console.log(`  제${ch.chapter}장 ${ch.title} — sections=${chSecs.length}, items=${chItems.length}`);
  }
}

summary(probSk, "PROBLEM book");
summary(ansSk, "ANSWER book");

// Per-chapter section-by-section diff.
const chs = [...new Set([...probSk, ...ansSk].filter((x) => x.kind === "chapter").map((x) => x.chapter))].sort((a, b) => a - b);
for (const c of chs) {
  const probSecs = probSk.filter((x) => x.kind === "section" && x.chapter === c);
  const ansSecs = ansSk.filter((x) => x.kind === "section" && x.chapter === c);
  const probSet = new Map(probSecs.map((s) => [normSection(s.section), s]));
  const ansSet = new Map(ansSecs.map((s) => [normSection(s.section), s]));
  const onlyProb = probSecs.filter((s) => !ansSet.has(normSection(s.section)));
  const onlyAns = ansSecs.filter((s) => !probSet.has(normSection(s.section)));
  if (onlyProb.length || onlyAns.length) {
    console.log(`\n--- 제${c}장 section diff ---`);
    if (onlyProb.length) {
      console.log(`  PROBLEM에만 있음 (${onlyProb.length}):`);
      for (const s of onlyProb) console.log(`    "${s.section}" hint=${s.articleHint}`);
    }
    if (onlyAns.length) {
      console.log(`  ANSWER에만 있음 (${onlyAns.length}):`);
      for (const s of onlyAns) console.log(`    "${s.section}" hint=${s.articleHint}`);
    }
  }
}

// Per-(chapter, section, problemNumber) match check.
function keyOf(o) { return [o.chapter, normSection(o.section), o.n].join("|"); }
const probItems = probSk.filter((x) => x.kind === "problem");
const ansMap = new Map();
for (const a of ansSk.filter((x) => x.kind === "answer")) {
  const k = keyOf(a);
  if (ansMap.has(k)) {
    const cur = ansMap.get(k);
    cur.dupes = (cur.dupes ?? 1) + 1;
  } else {
    ansMap.set(k, a);
  }
}
let matched = 0, missing = 0, dupAns = 0;
for (const p of probItems) {
  const a = ansMap.get(keyOf(p));
  if (a) { matched++; if (a.dupes) dupAns++; }
  else missing++;
}
console.log(`\n매칭 결과 (현재 룰): matched=${matched}/${probItems.length}, missing=${missing}, dup-answer-key=${dupAns}`);
