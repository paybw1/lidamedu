import { readFileSync } from "node:fs";

const answerDoc = JSON.parse(readFileSync("source/_converted/answer.json", "utf8"));
const paragraphs = answerDoc.paragraphs;

// 1장 총칙 답안 블록 사이의 paragraph 직접 출력 (160~480 범위 일부).
const ranges = [
  [150, 270],
  [260, 350],
  [340, 425],
  [415, 490],
];
for (const [from, to] of ranges) {
  console.log(`\n=== paraIdx ${from}..${to} ===`);
  for (let i = from; i <= to && i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const t = (p.text ?? "").trim();
    if (!t) continue;
    const flag = (p.italic ? "I" : "") + (p.bold ? "B" : "");
    console.log(`[${i}|${flag.padEnd(2," ")}] ${t.slice(0, 140)}`);
  }
}
