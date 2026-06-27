// factbox 일괄 적용분(worklist auto+review) 과목별 분포 + 과목별 샘플 본문.
// 복구 범위 판단용(읽기 전용). usage: node scripts/jagwa/factbox-audit.mjs [lawCode...]
import fs from "node:fs";
import path from "node:path";

const work = JSON.parse(
  fs.readFileSync(path.join("scripts", "jagwa", ".factbox", "worklist.json"), "utf8"),
);
const applied = work.filter((o) => o.status === "auto" || o.status === "review");

const by = {};
for (const o of applied) {
  by[o.lawCode] ??= { auto: 0, review: 0, total: 0 };
  by[o.lawCode][o.status]++;
  by[o.lawCode].total++;
}
console.log("적용분(295) 과목별:", JSON.stringify(by, null, 2));

const want = process.argv.slice(2);
const subjects = want.length ? want : Object.keys(by);
for (const code of subjects) {
  const rows = applied.filter((o) => o.lawCode === code);
  console.log(`\n===== ${code} (${rows.length}건) 샘플 3 =====`);
  for (const o of rows.slice(0, 3)) {
    const sc = o.proposed.match(/<div class="case-box">\n([\s\S]*?)\n<\/div>/)?.[1] ?? "";
    console.log(`\n[${o.problemId.slice(0, 8)}] ${o.reason}`);
    console.log(`  원본: ${o.original.replace(/\n/g, "⏎").slice(0, 180)}`);
    console.log(`  박스사례: ${sc.replace(/<br>/g, " ⏎ ").slice(0, 160)}`);
  }
}
