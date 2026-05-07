// problems-merged.json 에서 5지문 아닌 문제들의 분포·원인 진단.
import { readFileSync, writeFileSync } from "node:fs";
const merged = JSON.parse(readFileSync("source/_converted/problems-merged.json", "utf8")).problems;
const incomplete = merged.filter((p) => p.choices.length !== 5);
console.log(`incomplete: ${incomplete.length} / ${merged.length}`);

// 분포
const byCount = {};
for (const p of incomplete) byCount[p.choices.length] = (byCount[p.choices.length] ?? 0) + 1;
console.log(`choice 수 분포: ${JSON.stringify(byCount)}`);

const byCh = {};
for (const p of incomplete) byCh[p.chapter] = (byCh[p.chapter] ?? 0) + 1;
console.log(`chapter 분포: ${JSON.stringify(byCh)}`);

// 샘플 — 0/1/2지문은 거의 OCR 손실. 4지문은 일부 누락. 6지문은 잘못 합쳐진 경우.
console.log(`\n--- choice 수 별 샘플 ---`);
for (const cnt of Object.keys(byCount).sort((a, b) => +a - +b)) {
  const list = incomplete.filter((p) => p.choices.length === Number(cnt)).slice(0, 3);
  console.log(`\n[${cnt}지문]`);
  for (const p of list) {
    console.log(`  ch${p.chapter}/${p.section}/#${p.problemNumber} (${p.year} ${p.origin})`);
    console.log(`    "${p.stem.slice(0, 80)}"`);
    if (p.choices.length > 0) {
      for (const c of p.choices) console.log(`      ${c.index}: ${c.body.slice(0, 60)}`);
    }
  }
}

// 운영자 보강 큐로 저장
writeFileSync(
  "source/_converted/incomplete-queue.json",
  JSON.stringify({ problems: incomplete }, null, 2),
  "utf8",
);
console.log(`\n✓ source/_converted/incomplete-queue.json (${incomplete.length} entries)`);
