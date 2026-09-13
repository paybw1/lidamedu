// 해설편 새 해설의 품질 지표 — 적재 전 기준선 대조용(지시서 2-2).
// ★2-1 SQL 과 **동일한 정규식**을 쓴다. 다르면 비교가 무의미하다.
//
//   node scripts/mcq-audit/measure-haeseol.mjs <plan.json>
//
// 측정 대상은 **적재될 형태**(toMarkdown 적용 후)다 — 첫 줄의 판면 라벨 「해설」을 뗀 값.

import fs from "node:fs";

const RE = {
  // SQL: '제\s*\d+\s*조'
  article: /제\s*\d+\s*조/,
  // SQL: '\d{2,4}\s*(후|허|다|두|도|나|누|마|그|스)\s*\d+'
  caseno: /\d{2,4}\s*(후|허|다|두|도|나|누|마|그|스)\s*\d+/,
  // SQL: '[「『"“][^」』"”]{40,}[」』"”]'
  longquote: /[「『"“][^」』"”]{40,}[」』"”]/,
};

const toMarkdown = (body) =>
  String(body ?? "")
    .replace(/^해설\s*/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const pct = (n, d) => ((100 * n) / Math.max(d, 1)).toFixed(1);
const pctile = (arr, q) => {
  const v = arr.slice().sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(q * (v.length - 1)))];
};

const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const bodies = plan.map((p) => toMarkdown(p.body));
const lens = bodies.map((b) => b.length);

const row = {
  n: bodies.length,
  p50: pctile(lens, 0.5),
  p95: pctile(lens, 0.95),
  pct_article: pct(bodies.filter((b) => RE.article.test(b)).length, bodies.length),
  pct_caseno: pct(bodies.filter((b) => RE.caseno.test(b)).length, bodies.length),
  pct_longquote: pct(bodies.filter((b) => RE.longquote.test(b)).length, bodies.length),
  pct_thin: pct(lens.filter((l) => l < 100).length, bodies.length),
};
console.log(JSON.stringify([{ origin: "expected(해설편)", ...row }]));

// 실제 적재 대상(553건 = 짧아짐·동일 제외)만으로도 한 번 더.
const applied = plan.filter((p) => toMarkdown(p.body).length > p.curLen);
const ab = applied.map((p) => toMarkdown(p.body));
const al = ab.map((b) => b.length);
console.log(
  JSON.stringify([
    {
      origin: "expected(적재분만)",
      n: ab.length,
      p50: pctile(al, 0.5),
      p95: pctile(al, 0.95),
      pct_article: pct(ab.filter((b) => RE.article.test(b)).length, ab.length),
      pct_caseno: pct(ab.filter((b) => RE.caseno.test(b)).length, ab.length),
      pct_longquote: pct(ab.filter((b) => RE.longquote.test(b)).length, ab.length),
      pct_thin: pct(al.filter((l) => l < 100).length, ab.length),
    },
  ]),
);
