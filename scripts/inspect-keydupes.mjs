// 답안집 dup-key의 패턴 — 같은 (chapter, section, problemNumber)가 왜 여러번 나오는지.
import { readFileSync } from "node:fs";

const answerDoc = JSON.parse(readFileSync("source/_converted/answer.json", "utf8"));

const CHAPTER_RE = /^제(\d+)장\s+(.+)$/;
const SECTION_RE = /^([^()]+?)\s*\(\s*([\d①-⑳의\s,\-]+)\s*\)\s*(\d+)?\s*$/;
const ANSWER_HEADER_RE = /^(\d{2})\s*([①②③④⑤])\s*$/;

const events = [];
let curCh = null, curSec = null, curArt = null, bookHeaderSeen = false;
let paraIdx = -1;
for (const p of answerDoc.paragraphs) {
  paraIdx++;
  const text = (p.text ?? "").trim();
  if (!text) continue;
  if (/정답\s*및\s*해설/.test(text)) { bookHeaderSeen = true; continue; }
  if (!bookHeaderSeen) continue;
  const ch = text.match(CHAPTER_RE);
  if (ch) { curCh = parseInt(ch[1], 10); curSec = null; curArt = null; events.push({ type: "ch", paraIdx, chapter: curCh, title: ch[2] }); continue; }
  const sec = text.match(SECTION_RE);
  if (sec && /[①-⑳\d]/.test(sec[2])) { curSec = sec[1].trim(); curArt = sec[2].trim(); events.push({ type: "sec", paraIdx, chapter: curCh, section: curSec, articleHint: curArt }); continue; }
  const a = text.match(ANSWER_HEADER_RE);
  if (a) { events.push({ type: "ans", paraIdx, chapter: curCh, section: curSec, articleHint: curArt, n: parseInt(a[1], 10), correct: "①②③④⑤".indexOf(a[2])+1 }); continue; }
}

// Group by (chapter, normSection, n) and count occurrences.
function ns(s){return (s??"").replace(/[^가-힣0-9]/g,"");}
const groups = new Map();
for (const e of events.filter(x=>x.type==="ans")) {
  const k = `${e.chapter}|${ns(e.section)}|${e.n}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}
const dupes = [...groups.entries()].filter(([,v])=>v.length>1);
console.log(`총 키 그룹: ${groups.size}, 중복 키: ${dupes.length}`);
console.log(`샘플 dup keys (제1장 총칙):`);
for (const [k, list] of dupes.filter(([k])=>k.startsWith("1|")).slice(0,5)) {
  console.log(`  ${k} (${list.length}회):`);
  for (const e of list) console.log(`    paraIdx=${e.paraIdx} sec="${e.section}"(${e.articleHint}) ans=${e.correct}`);
}

// 제1장 총칙 — section 이동 흐름
console.log(`\n--- 제1장 총칙 events (앞 80개) ---`);
const ch1 = events.filter(e => e.chapter === 1);
for (const e of ch1.slice(0, 80)) {
  if (e.type === "ch") console.log(`[ch] paraIdx=${e.paraIdx} ${e.title}`);
  else if (e.type === "sec") console.log(`  [sec] paraIdx=${e.paraIdx} "${e.section}"(${e.articleHint})`);
  else if (e.type === "ans") console.log(`    [ans ${e.n}] paraIdx=${e.paraIdx} corr=${e.correct}`);
}
