// 워크북 파싱 JSON에서 "번호 리셋"(problemNumber 가 감소)으로 병합된 단원을 탐지.
// 한 section 안에서 번호가 1..N 으로 가다가 다시 작아지면 = 파서가 단원 경계를 놓친 것.
// 읽기 전용 진단. (기출Ⅰ / 예상Ⅱ 각 책 별도)
import { readFileSync } from "node:fs";

function analyze(file, label) {
  const probs = JSON.parse(readFileSync(`source/_converted/${file}`, "utf8")).problems ?? [];
  console.log(`\n===== ${label} (${file}) — ${probs.length}문제 =====`);
  // section 별로 워크북 등장 순서대로 묶기 (JSON 순서 = 워크북 순서)
  const order = [];
  const bySec = new Map();
  for (const p of probs) {
    const s = p.section ?? "(none)";
    if (!bySec.has(s)) { bySec.set(s, []); order.push(s); }
    bySec.get(s).push(p.problemNumber);
  }
  let merged = 0;
  for (const s of order) {
    const nums = bySec.get(s);
    // run 분리: 번호가 이전보다 작거나 같아지면 새 run
    const runs = [];
    let cur = [];
    let prev = -1;
    for (const n of nums) {
      if (n <= prev && cur.length) { runs.push(cur); cur = []; }
      cur.push(n);
      prev = n;
    }
    if (cur.length) runs.push(cur);
    if (runs.length > 1) {
      merged++;
      console.log(`  ⚠ "${s}" — ${runs.length} runs: ${runs.map((r) => `[${r[0]}..${r[r.length - 1]}](${r.length})`).join(" ")}`);
    }
  }
  console.log(`  병합 의심 section: ${merged}`);
}

analyze("problems-merged.json", "기출 Ⅰ");
analyze("expected-merged.json", "예상 Ⅱ");
