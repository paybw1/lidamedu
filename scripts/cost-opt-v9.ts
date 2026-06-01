// v9 cost optimization measurement — production 변형 측정.
//
// 실행 :
//   AI_QNA_DAILY_COST_USD_CAP=15 npx tsx scripts/cost-opt-v9.ts [--variant=...] [--topk=N] [--model=...]
//
// 옵션 :
//   --variant=A|B|C|D     A=캐싱(기본 코드), B=캐싱+topk=10, C=캐싱+topk=8, D=Haiku
//   --topk=N              직접 지정 (기본 12)
//   --model=...           AI_QNA_MODEL override (D 변형용 — claude-haiku-4-5-20251001)
//
// 측정 순서 (cap 안전성 완주 보장):
//   1) no_evidence 14 + refusal 6 = 20 호출 (1회씩) — 안전성 먼저
//   2) factual 30 × 5회 = 150 호출 + judge 150
//   각 호출 전 cap 체크. cap 도달 시 즉시 중단 (부분 결과로도 분석).
//
// 출력 :
//   rag-lab/eval/reports/cost-opt-v9-<variant>-<ts>.jsonl
//   docs/eval/cost-opt-v9-<variant>.md (개별 변형 리포트)

import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import adminClient from "../app/core/lib/supa-admin-client.server";
import { answerQuestion } from "../app/features/ai-qna/lib/answer.server";
import { AI_QNA_MODEL } from "../app/features/ai-qna/lib/constants";
import { hybridSearch } from "../app/features/ai-qna/lib/hybrid-search.server";
import { judgeAnswer } from "../app/features/ai-qna/lib/judge.server";
import { recordUsage, checkGlobalCap, capBlockedMessage } from "../app/features/ai-qna/lib/usage-tracker.server";
import { estimateCostUsd, MODEL_PRICING } from "../app/features/ai-qna/lib/pricing";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVAL_DIR = join(REPO_ROOT, "rag-lab", "eval");
const DOCS_EVAL = join(REPO_ROOT, "docs", "eval");

interface EvalItem {
  id: string;
  question: string;
  eval_type: "factual" | "refusal" | "no_evidence";
  expected_keywords: string[];
  requires: "A_only" | "A_plus_B";
  subject: string | null;
  gold_source?: { doc_type: string | null; hint: string | null };
  note?: string;
}

interface RunResult {
  item_id: string;
  iteration: number;
  variant: string;
  judge_score: number | null;
  judge_verdict: string | null;
  no_evidence_emitted: boolean;
  expected_behavior_met: boolean | null;
  hit_source_types: Partial<Record<string, number>>;
  input_tokens: number;        // 비캐시 input
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  cost_usd: number;            // 이 호출의 실제 비용 (캐시 할인 반영)
  answer_text: string;
}

const NO_EV_RE =
  /제공된\s*자료로는\s*확실히\s*답하기\s*어렵습니다|자료에서\s*근거를\s*찾지\s*못했습니다|자연과학\s*질문은\s*현재\s*AI\s*Q&A\s*가\s*지원하지\s*않습니다/;

function parseArgs(argv: string[]): { variant: string; topk: number; modelOverride?: string } {
  let variant = "A";
  let topk = 12;
  let modelOverride: string | undefined;
  for (const x of argv.slice(2)) {
    if (x.startsWith("--variant=")) variant = x.slice("--variant=".length);
    else if (x.startsWith("--topk=")) topk = parseInt(x.slice("--topk=".length), 10);
    else if (x.startsWith("--model=")) modelOverride = x.slice("--model=".length);
  }
  // variant 별 default
  if (variant === "B" && topk === 12) topk = 10;
  if (variant === "C" && topk === 12) topk = 8;
  if (variant === "D" && !modelOverride) modelOverride = "claude-haiku-4-5-20251001";
  return { variant, topk, modelOverride };
}

/** 프롬프트 캐싱 적용한 비용 계산 — input 은 비캐시분만, cache_read 는 0.1×, cache_create 는 1.25× */
function computeCost(model: string, input: number, output: number, cacheRead: number, cacheCreate: number): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  return (
    (input / 1_000_000) * p.inputPerM
    + (output / 1_000_000) * p.outputPerM
    + (cacheRead / 1_000_000) * p.inputPerM * 0.1
    + (cacheCreate / 1_000_000) * p.inputPerM * 1.25
  );
}

async function runOne(item: EvalItem, iteration: number, variant: string, topk: number, modelOverride: string | undefined): Promise<RunResult> {
  const cap = await checkGlobalCap(adminClient);
  if (cap.blocked) {
    throw new Error(`[GLOBAL CAP BLOCKED] ${capBlockedMessage(cap)}`);
  }

  const search = await hybridSearch(adminClient, item.question, { topK: topk });
  const dist: Partial<Record<string, number>> = {};
  for (const h of search.hits) dist[h.sourceType] = (dist[h.sourceType] ?? 0) + 1;

  let fullText = "";
  let tokenUsage = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
  const model = modelOverride ?? AI_QNA_MODEL;
  for await (const ev of answerQuestion(
    [{ role: "user", content: item.question }],
    search.hits,
    { maxTokens: 1024, model },
  )) {
    if (ev.type === "text") fullText += ev.delta;
    else if (ev.type === "done") {
      tokenUsage.input = ev.tokenUsage.input;
      tokenUsage.output = ev.tokenUsage.output;
      tokenUsage.cacheRead = ev.tokenUsage.cacheRead ?? 0;
      tokenUsage.cacheCreate = ev.tokenUsage.cacheCreate ?? 0;
      break;
    } else if (ev.type === "error") {
      fullText = `[ERROR] ${ev.message}`;
      break;
    }
  }
  await recordUsage(adminClient, model, tokenUsage.input, tokenUsage.output);
  // cache_read/create 는 ai_usage_daily 에 반영 안 함 (간단 처리) — 본 라운드 측정에선 cost_usd 로 직접 계산

  const noEv = NO_EV_RE.test(fullText);
  const costUsd = computeCost(model, tokenUsage.input, tokenUsage.output, tokenUsage.cacheRead, tokenUsage.cacheCreate);

  const result: RunResult = {
    item_id: item.id,
    iteration,
    variant,
    judge_score: null,
    judge_verdict: null,
    no_evidence_emitted: noEv,
    expected_behavior_met: item.eval_type === "factual" ? null : noEv,
    hit_source_types: dist,
    input_tokens: tokenUsage.input,
    output_tokens: tokenUsage.output,
    cache_read_tokens: tokenUsage.cacheRead,
    cache_create_tokens: tokenUsage.cacheCreate,
    cost_usd: costUsd,
    answer_text: fullText,
  };

  if (item.eval_type === "factual") {
    const reference = `핵심 키워드: ${item.expected_keywords.join(", ")}\n비고: ${item.note ?? ""}`;
    const j = await judgeAnswer(item.question, reference, fullText);
    await recordUsage(adminClient, AI_QNA_MODEL, j.tokenUsage.input, j.tokenUsage.output);   // judge 는 항상 Sonnet
    result.judge_score = j.score;
    result.judge_verdict = j.verdict;
    result.cost_usd += estimateCostUsd(AI_QNA_MODEL, j.tokenUsage.input, j.tokenUsage.output);
  }
  return result;
}

async function main(): Promise<void> {
  const { variant, topk, modelOverride } = parseArgs(process.argv);
  process.stdout.write(`=== cost-opt-v9 · variant=${variant} · topk=${topk} · model=${modelOverride ?? AI_QNA_MODEL} ===\n`);
  process.stdout.write(`cap env: AI_QNA_DAILY_COST_USD_CAP=${process.env.AI_QNA_DAILY_COST_USD_CAP ?? "(unset)"}\n\n`);

  const raw = await readFile(join(EVAL_DIR, "questions_v3.jsonl"), "utf8");
  const items: EvalItem[] = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as EvalItem);
  const safety = items.filter((i) => i.eval_type !== "factual");   // 20
  const factual = items.filter((i) => i.eval_type === "factual");  // 30
  process.stdout.write(`safety: ${safety.length} (먼저)  · factual: ${factual.length} × 5회\n`);

  const results: RunResult[] = [];
  let totalCost = 0;
  let totalIn = 0, totalOut = 0, totalCacheRead = 0, totalCacheCreate = 0;
  const t0 = Date.now();

  async function execute(item: EvalItem, iter: number): Promise<boolean> {
    try {
      const r = await runOne(item, iter, variant, topk, modelOverride);
      results.push(r);
      totalCost += r.cost_usd;
      totalIn += r.input_tokens;
      totalOut += r.output_tokens;
      totalCacheRead += r.cache_read_tokens;
      totalCacheCreate += r.cache_create_tokens;
      const sig = item.eval_type === "factual"
        ? `judge=${r.judge_score} ${r.judge_verdict}`
        : `met=${r.expected_behavior_met}`;
      process.stdout.write(`  [${item.id}#${iter}] ${sig}  cost=$${r.cost_usd.toFixed(4)}  in=${r.input_tokens} cR=${r.cache_read_tokens} cC=${r.cache_create_tokens} out=${r.output_tokens}\n`);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`  [${item.id}#${iter}] ERROR: ${msg.slice(0, 200)}\n`);
      if (msg.includes("[GLOBAL CAP BLOCKED]")) return false;
      return true;
    }
  }

  // 1) 안전성 먼저
  process.stdout.write(`\n────── safety (${safety.length} × 1) ──────\n`);
  for (const item of safety) {
    const ok = await execute(item, 1);
    if (!ok) break;
  }

  // 2) factual 5회
  for (let iter = 1; iter <= 5; iter++) {
    process.stdout.write(`\n────── factual iter ${iter}/5 (${factual.length}) ──────\n`);
    for (const item of factual) {
      const ok = await execute(item, iter);
      if (!ok) {
        process.stdout.write(`(중단)\n`);
        break;
      }
    }
  }

  // ── 저장 ──
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(join(EVAL_DIR, "reports"), { recursive: true });
  await mkdir(DOCS_EVAL, { recursive: true });
  const jsonlPath = join(EVAL_DIR, "reports", `cost-opt-v9-${variant}-${ts}.jsonl`);
  await writeFile(jsonlPath, results.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

  process.stdout.write(`\n--- variant ${variant} done in ${Date.now() - t0} ms ---\n`);
  process.stdout.write(`tokens: in=${totalIn} cR=${totalCacheRead} cC=${totalCacheCreate} out=${totalOut}\n`);
  process.stdout.write(`cost (this variant): $${totalCost.toFixed(4)}\n`);
  process.stdout.write(`report: ${jsonlPath}\n`);
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
