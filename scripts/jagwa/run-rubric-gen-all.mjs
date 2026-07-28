// 채점기준·모범답안 전량 생성 러너 (feat-2-034 Stage 3).
// manifest 의 (회차, 과목) 조합별로 gen-rubric-model-answers.mjs 를 실행.
// 조합 간 동시 3개(캐시는 조합 내 공유), 조합 내 문제는 직렬. 이미 생성된 문제는 스킵(멱등).
//
//   node scripts/jagwa/run-rubric-gen-all.mjs

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync("tmp/instructor-explanations/manifest.json", "utf8"),
);
const combos = new Map(); // "law|year" -> file count
for (const m of manifest) {
  if (m.error || m.suspectScan || !m.subject) continue;
  const key = `${m.subject}|${m.round + 1963}`;
  combos.set(key, (combos.get(key) ?? 0) + 1);
}
const jobs = [...combos.keys()].sort();
console.log(`조합 ${jobs.length}개 (예상 ${jobs.length * 4}문항)`);

const CONCURRENCY = 3;
const failures = [];
let idx = 0;

function runOne(key) {
  const [law, year] = key.split("|");
  return new Promise((resolveP) => {
    const child = spawn(
      "node",
      ["scripts/jagwa/gen-rubric-model-answers.mjs", "--law", law, "--year", year],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      const tail = out.trim().split("\n").slice(-3).join(" / ");
      console.log(`[${code === 0 ? "OK" : "FAIL"}] ${key} — ${tail}`);
      if (code !== 0) failures.push({ key, out: out.slice(-2000) });
      resolveP();
    });
  });
}

async function worker() {
  while (idx < jobs.length) {
    const key = jobs[idx++];
    console.log(`시작 (${idx}/${jobs.length}): ${key}`);
    await runOne(key);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n완료. 실패 ${failures.length}건`);
for (const f of failures) {
  console.log(`\n--- FAIL ${f.key} ---\n${f.out}`);
}
