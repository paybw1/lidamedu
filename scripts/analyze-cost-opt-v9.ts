// v9 변형 결과 분석 — JSONL → 카테고리 평균 + 합격선 판정 + 월환산.

import "dotenv/config";
import { readFile } from "node:fs/promises";

interface Row {
  item_id: string;
  iteration: number;
  variant: string;
  judge_score: number | null;
  judge_verdict: string | null;
  no_evidence_emitted: boolean;
  expected_behavior_met: boolean | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  cost_usd: number;
}

const ACCEPT = { statute: 4.71, case: 4.66, b: 4.34, total: 4.61 } as const;

function categoryOf(id: string): "statute" | "case" | "b" | "noev" | "ref" | "unknown" {
  if (/^st\d+$/.test(id)) return "statute";
  if (/^ca\d+$/.test(id)) return "case";
  if (/^b\d+$/.test(id)) return "b";
  if (/^noev\d+$/.test(id)) return "noev";
  if (/^ref\d+$/.test(id)) return "ref";
  return "unknown";
}

function stats(scores: number[]): { mean: number; std: number; min: number; max: number; n: number } {
  if (scores.length === 0) return { mean: NaN, std: NaN, min: NaN, max: NaN, n: 0 };
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  return { mean, std, min: Math.min(...scores), max: Math.max(...scores), n: scores.length };
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("usage: npx tsx scripts/analyze-cost-opt-v9.ts <jsonl-path>\n");
    process.exit(1);
  }
  const raw = await readFile(file, "utf8");
  const rows: Row[] = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);
  process.stdout.write(`=== ${file} (rows=${rows.length}) ===\n\n`);

  // 카테고리별 점수
  const byCat: Record<string, number[]> = { statute: [], case: [], b: [] };
  const byItem: Record<string, number[]> = {};
  const safety = { noev: { met: 0, total: 0 }, ref: { met: 0, total: 0 } };

  for (const r of rows) {
    const cat = categoryOf(r.item_id);
    if (cat === "statute" || cat === "case" || cat === "b") {
      if (typeof r.judge_score === "number") {
        byCat[cat].push(r.judge_score);
        if (!byItem[r.item_id]) byItem[r.item_id] = [];
        byItem[r.item_id].push(r.judge_score);
      }
    } else if (cat === "noev") {
      safety.noev.total += 1;
      if (r.expected_behavior_met === true) safety.noev.met += 1;
    } else if (cat === "ref") {
      safety.ref.total += 1;
      if (r.expected_behavior_met === true) safety.ref.met += 1;
    }
  }

  process.stdout.write(`────── 카테고리별 ──────\n`);
  process.stdout.write(`카테고리   n   mean   std   min  max   합격선  판정\n`);
  for (const k of ["statute", "case", "b"] as const) {
    const s = stats(byCat[k]);
    const floor = ACCEPT[k];
    const verdict = s.mean >= floor ? "✓ 통과" : "✗ 회귀";
    process.stdout.write(
      `${k.padEnd(10)} ${String(s.n).padStart(3)}  ${s.mean.toFixed(2)}  ±${s.std.toFixed(2)}  ${s.min}    ${s.max}    ≥${floor.toFixed(2)}  ${verdict}\n`,
    );
  }
  const all = [...byCat.statute, ...byCat.case, ...byCat.b];
  const sa = stats(all);
  const v = sa.mean >= ACCEPT.total ? "✓ 통과" : "✗ 회귀";
  process.stdout.write(
    `전체       ${String(sa.n).padStart(3)}  ${sa.mean.toFixed(2)}  ±${sa.std.toFixed(2)}  ${sa.min}    ${sa.max}    ≥${ACCEPT.total.toFixed(2)}  ${v}\n\n`,
  );

  // 회귀 감시 — b6/st5/st12
  process.stdout.write(`────── 회귀 감시 (b6/st5/st12) ──────\n`);
  for (const id of ["b6", "st5", "st12"]) {
    const arr = byItem[id] ?? [];
    const s = stats(arr);
    const zero = arr.filter((x) => x === 0).length;
    process.stdout.write(`${id}: [${arr.join(",")}]  mean=${s.mean.toFixed(2)}  0점=${zero}/${arr.length}\n`);
  }

  // 안전성
  process.stdout.write(`\n────── 안전성 ──────\n`);
  process.stdout.write(`no_evidence: ${safety.noev.met}/${safety.noev.total}\n`);
  process.stdout.write(`refusal:     ${safety.ref.met}/${safety.ref.total}\n`);

  // 비용
  const factualCost = rows.filter((r) => typeof r.judge_score === "number").reduce((a, r) => a + r.cost_usd, 0);
  const factualCount = rows.filter((r) => typeof r.judge_score === "number").length;
  const safetyCost = rows.filter((r) => r.judge_score === null).reduce((a, r) => a + r.cost_usd, 0);
  const safetyCount = rows.filter((r) => r.judge_score === null).length;
  const totalCost = factualCost + safetyCost;
  const perQuestion = factualCount > 0 ? factualCost / factualCount : 0;

  process.stdout.write(`\n────── 비용 ──────\n`);
  process.stdout.write(`factual: $${factualCost.toFixed(4)} / ${factualCount}건 = $${perQuestion.toFixed(4)}/q\n`);
  process.stdout.write(`safety:  $${safetyCost.toFixed(4)} / ${safetyCount}건\n`);
  process.stdout.write(`total:   $${totalCost.toFixed(4)}\n`);

  // 문항별 5회 상세 (factual only)
  process.stdout.write(`\n────── 문항별 5회 ──────\n`);
  const ids = Object.keys(byItem).sort((a, b) => {
    const ai = parseInt(a.replace(/^[a-z]+/, ""), 10);
    const bi = parseInt(b.replace(/^[a-z]+/, ""), 10);
    return a.replace(/\d+/, "").localeCompare(b.replace(/\d+/, "")) || ai - bi;
  });
  for (const id of ids) {
    const arr = byItem[id];
    const s = stats(arr);
    process.stdout.write(`${id.padEnd(5)} n=${s.n} mean=${s.mean.toFixed(2)} std=${s.std.toFixed(2)} scores=[${arr.join(",")}]\n`);
  }

  // 월환산 — 1000 user × 10건/일 × 30일 = 30만 건
  const monthly = perQuestion * 300_000;
  process.stdout.write(`\n────── 월환산 (1k 유저 × 10건/일 × 30일 = 300,000건) ──────\n`);
  process.stdout.write(`예상 월비용: $${monthly.toFixed(0)} (질문당 $${perQuestion.toFixed(4)} × 300k)\n`);
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
