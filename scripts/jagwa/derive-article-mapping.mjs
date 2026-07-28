// 전부개정 신구 조문 대응표 도출 (feat-2-034).
// 상표법 2016 전부개정(시행 20160901)·디자인보호법 2013 전부개정(시행 20140701)의
// 직전 구법 vs 직후 신법 조문을 문자 bigram 유사도로 매칭해 후보 대응표 생성.
// 출력: tmp/law-history/{law}-mapping.json + -mapping-review.md
//
//   node scripts/jagwa/derive-article-mapping.mjs

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const JOBS = [
  { law: "trademark", reformEffective: "20160901" },
  { law: "design", reformEffective: "20140701" },
];

function loadVersions(law) {
  const dir = join("tmp/law-history", law);
  return readdirSync(dir)
    .filter((f) => /^\d{8}-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}
// 효력시작 ≤ D 중 공포일자 최신 (공포·시행 엇갈림 대응)
function versionAt(versions, date) {
  const cands = versions.filter((v) => v.meta.효력시작 <= date);
  cands.sort((a, b) =>
    (a.meta.공포일자 + a.meta.효력시작).localeCompare(b.meta.공포일자 + b.meta.효력시작),
  );
  return cands[cands.length - 1] ?? null;
}

function bigrams(s) {
  const t = s.replace(/\s+/g, "");
  const set = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    set.set(b, (set.get(b) ?? 0) + 1);
  }
  return set;
}
function dice(a, b) {
  let inter = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const v of a.values()) sizeA += v;
  for (const v of b.values()) sizeB += v;
  for (const [k, v] of a) inter += Math.min(v, b.get(k) ?? 0);
  return sizeA + sizeB === 0 ? 0 : (2 * inter) / (sizeA + sizeB);
}

for (const job of JOBS) {
  const versions = loadVersions(job.law);
  const dayBefore = String(Number(job.reformEffective) - 1);
  const oldV = versionAt(versions, dayBefore);
  const newV = versions.find((v) => v.meta.효력시작 === job.reformEffective);
  if (!oldV || !newV) {
    console.warn(`${job.law}: 버전 못 찾음 (old=${oldV?.meta.효력시작}, new=${newV?.meta.효력시작})`);
    continue;
  }
  console.log(
    `${job.law}: 구법 ${oldV.meta.효력시작}(공포 ${oldV.meta.공포일자}, ${oldV.articles.length}조) → 신법 ${newV.meta.효력시작}(${newV.articles.length}조)`,
  );
  const newBi = newV.articles.map((a) => ({
    a,
    bi: bigrams(`${a.title} ${a.text}`),
    deleted: /삭제/.test(a.text) && a.text.length < 30,
  }));
  const mapping = [];
  for (const oldA of oldV.articles) {
    if (/삭제/.test(oldA.text) && oldA.text.length < 30) continue;
    const oldBi = bigrams(`${oldA.title} ${oldA.text}`);
    const scored = newBi
      .filter((n) => !n.deleted)
      .map((n) => ({ no: n.a.no, title: n.a.title, score: dice(oldBi, n.bi) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, 2);
    mapping.push({
      old_no: oldA.no,
      old_title: oldA.title,
      best: scored[0] ?? null,
      second: scored[1] ?? null,
    });
  }
  writeFileSync(
    join("tmp/law-history", `${job.law}-mapping.json`),
    JSON.stringify(
      { meta: { old: oldV.meta, new: newV.meta }, mapping },
      null,
      1,
    ),
    "utf8",
  );
  const strong = mapping.filter((m) => (m.best?.score ?? 0) >= 0.55);
  const weak = mapping.filter((m) => (m.best?.score ?? 0) < 0.55);
  const md = [
    `# ${job.law} 전부개정 조문 대응표 (자동 도출 — bigram 유사도)`,
    `구법(효력 ${oldV.meta.효력시작}) → 신법(효력 ${newV.meta.효력시작}) · 확신 ${strong.length} / 약함 ${weak.length}`,
    "",
    "| 구법 | 제목 | → 현행 | 유사도 | 2위 후보 |",
    "|---|---|---|---|---|",
    ...mapping.map(
      (m) =>
        `| §${m.old_no} | ${m.old_title} | §${m.best?.no ?? "?"} ${m.best?.title ?? ""} | ${(m.best?.score ?? 0).toFixed(2)} | §${m.second?.no ?? ""} ${(m.second?.score ?? 0).toFixed(2)} |`,
    ),
  ].join("\n");
  writeFileSync(join("tmp/law-history", `${job.law}-mapping-review.md`), md, "utf8");
  console.log(`  대응 ${mapping.length}건 (유사도≥0.55: ${strong.length}) → ${job.law}-mapping-review.md`);
}
