// v4-④ 안전성 회귀 검증 — production code path 직접 호출.
//
// 실행:
//   npx tsx scripts/eval-v4-prod.ts [--limit=N]
//
// 입력  : rag-lab/eval/questions_v3.jsonl (50문항)
// 출력  : rag-lab/eval/reports/v4-prod-<ts>.{md,jsonl}
// 측정  : noev2 단건 거절 확인, no_evidence 14문항 거절률, factual judge 평균
// 호출  : production 의 hybridSearch + answerQuestion + judgeAnswer + domain-gate + usage-tracker
// 비용  : 50문항 × (생성 + judge) ≈ $2~3. 자동 중단 가드 없음 (이번 라운드 핵심 검증이므로).
//
// 사용 client = adminClient (RLS bypass 로 평가용 사용자 컨텍스트 불필요).
// ai_usage_daily 는 production recordUsage 가 자동 누적.

import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import adminClient from "../app/core/lib/supa-admin-client.server";
import { answerQuestion } from "../app/features/ai-qna/lib/answer.server";
import { AI_QNA_MODEL } from "../app/features/ai-qna/lib/constants";
import {
  GATE_REFUSAL_TEXT,
  gateModeFromEnv,
  postSearchGate,
  preSearchGate,
} from "../app/features/ai-qna/lib/domain-gate.server";
import { hybridSearch } from "../app/features/ai-qna/lib/hybrid-search.server";
import { judgeAnswer } from "../app/features/ai-qna/lib/judge.server";
import { recordUsage } from "../app/features/ai-qna/lib/usage-tracker.server";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVAL_DIR = join(REPO_ROOT, "rag-lab", "eval");

// ─── eval item 스키마 (rag-lab 과 동일) ────────────────────────────────
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

interface ItemResult {
  item: EvalItem;
  answerText: string;
  gateBlocked: boolean;
  gateStage?: "pre" | "post";
  gateReason?: string;
  hits_count: number;
  hit_source_types: Partial<Record<string, number>>;
  context_kw_hit: number;
  context_kw_total: number;
  answer_kw_hit: number;
  answer_kw_total: number;
  answer_kw_missing: string[];
  no_evidence_emitted: boolean;
  expected_behavior_met: boolean | null;
  judge_score?: number;
  judge_verdict?: string;
  judge_rationale?: string;
  input_tokens: number;
  output_tokens: number;
}

function parseArgs(argv: string[]): { limit: number | undefined; types: Set<string> | null } {
  let limit: number | undefined;
  let types: Set<string> | null = null;
  for (const a of argv.slice(2)) {
    if (a.startsWith("--limit=")) limit = parseInt(a.slice("--limit=".length), 10);
    else if (a.startsWith("--types=")) {
      types = new Set(a.slice("--types=".length).split(",").map((s) => s.trim()).filter(Boolean));
    }
  }
  return { limit, types };
}

function countKeywords(text: string, keywords: string[]): { hit: number; total: number; missing: string[] } {
  const t = text.toLowerCase();
  let hit = 0;
  const missing: string[] = [];
  for (const k of keywords) {
    if (t.includes(k.toLowerCase())) hit += 1;
    else missing.push(k);
  }
  return { hit, total: keywords.length, missing };
}

const NO_EV_RE =
  /제공된\s*자료로는\s*확실히\s*답하기\s*어렵습니다|자료에서\s*근거를\s*찾지\s*못했습니다|자연과학\s*질문은\s*현재\s*AI\s*Q&A\s*가\s*지원하지\s*않습니다/;

async function runOne(item: EvalItem): Promise<ItemResult> {
  const gateMode = gateModeFromEnv();

  // ─── 1) preSearchGate ───────────────────────────────────────────
  const preGate = preSearchGate(item.question, gateMode);
  if (preGate && !preGate.pass) {
    const answer = GATE_REFUSAL_TEXT;
    return baseResultFor(item, {
      answer, gateBlocked: true, gateStage: "pre", gateReason: preGate.reason,
      hits_count: 0, hit_source_types: {},
    });
  }

  // ─── 2) hybrid search ───────────────────────────────────────────
  const search = await hybridSearch(adminClient, item.question, { topK: 12 });
  const dist: Partial<Record<string, number>> = {};
  for (const h of search.hits) dist[h.sourceType] = (dist[h.sourceType] ?? 0) + 1;

  // ─── 3) postSearchGate ──────────────────────────────────────────
  const postGate = postSearchGate(item.question, search.hits, gateMode);
  if (!postGate.pass) {
    return baseResultFor(item, {
      answer: GATE_REFUSAL_TEXT, gateBlocked: true, gateStage: "post", gateReason: postGate.reason,
      hits_count: search.hits.length, hit_source_types: dist,
    });
  }

  // ─── 4) 생성 ────────────────────────────────────────────────────
  let fullText = "";
  let tokenUsage = { input: 0, output: 0 };
  for await (const ev of answerQuestion(
    [{ role: "user", content: item.question }],
    search.hits,
    { maxTokens: 1024 },
  )) {
    if (ev.type === "text") fullText += ev.delta;
    else if (ev.type === "done") {
      tokenUsage = ev.tokenUsage;
      break;
    } else if (ev.type === "error") {
      fullText = `[ERROR] ${ev.message}`;
      break;
    }
  }
  // production 과 동일하게 recordUsage (전역 누적에 기록).
  await recordUsage(adminClient, AI_QNA_MODEL, tokenUsage.input, tokenUsage.output);

  const contextText = search.hits.map((h) => h.bodyText).join("\n");
  const ctxKw = countKeywords(contextText, item.expected_keywords);
  const ansKw = countKeywords(fullText, item.expected_keywords);
  const noEv = NO_EV_RE.test(fullText);

  const result: ItemResult = {
    item,
    answerText: fullText,
    gateBlocked: false,
    hits_count: search.hits.length,
    hit_source_types: dist,
    context_kw_hit: item.eval_type === "factual" ? ctxKw.hit : 0,
    context_kw_total: item.eval_type === "factual" ? ctxKw.total : 0,
    answer_kw_hit: item.eval_type === "factual" ? ansKw.hit : 0,
    answer_kw_total: item.eval_type === "factual" ? ansKw.total : 0,
    answer_kw_missing: item.eval_type === "factual" ? ansKw.missing : [],
    no_evidence_emitted: noEv,
    expected_behavior_met:
      item.eval_type === "factual" ? null : noEv,
    input_tokens: tokenUsage.input,
    output_tokens: tokenUsage.output,
  };

  // ─── 5) judge (factual 만 — refusal/no_evidence 는 noEv 자체가 정답이므로 judge 의미 약함) ─
  if (item.eval_type === "factual") {
    const reference =
      `핵심 키워드: ${item.expected_keywords.join(", ")}\n비고: ${item.note ?? ""}`;
    const j = await judgeAnswer(item.question, reference, fullText);
    await recordUsage(adminClient, AI_QNA_MODEL, j.tokenUsage.input, j.tokenUsage.output);
    result.judge_score = j.score;
    result.judge_verdict = j.verdict;
    result.judge_rationale = j.rationale;
    result.input_tokens += j.tokenUsage.input;
    result.output_tokens += j.tokenUsage.output;
  }

  return result;
}

function baseResultFor(
  item: EvalItem,
  partial: Partial<ItemResult> & { answer: string; gateBlocked: boolean; hits_count: number; hit_source_types: Partial<Record<string, number>> },
): ItemResult {
  const noEv = NO_EV_RE.test(partial.answer);
  return {
    item,
    answerText: partial.answer,
    gateBlocked: partial.gateBlocked,
    gateStage: partial.gateStage,
    gateReason: partial.gateReason,
    hits_count: partial.hits_count,
    hit_source_types: partial.hit_source_types,
    context_kw_hit: 0, context_kw_total: 0,
    answer_kw_hit: 0, answer_kw_total: 0,
    answer_kw_missing: [],
    no_evidence_emitted: noEv,
    expected_behavior_met: item.eval_type === "factual" ? null : noEv,
    input_tokens: 0, output_tokens: 0,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const raw = await readFile(join(EVAL_DIR, "questions_v3.jsonl"), "utf8");
  let items: EvalItem[] = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as EvalItem);
  if (args.types) items = items.filter((it) => args.types!.has(it.eval_type));
  if (args.limit) items = items.slice(0, args.limit);

  const gateMode = gateModeFromEnv();
  process.stdout.write(
    `=== v4-④ Production Eval ===\n`
      + `items: ${items.length}  · gateMode: ${gateMode}\n`
      + `chunks: production content_chunks (live)\n\n`,
  );

  const results: ItemResult[] = [];
  let totalIn = 0;
  let totalOut = 0;
  const t0 = Date.now();
  for (const item of items) {
    process.stdout.write(`[${item.id}/${item.eval_type}] ${item.question.slice(0, 70)}…\n`);
    try {
      const r = await runOne(item);
      totalIn += r.input_tokens;
      totalOut += r.output_tokens;
      const sig =
        item.eval_type === "factual"
          ? `judge=${r.judge_score ?? "-"} ${r.judge_verdict ?? ""}  ansKW ${r.answer_kw_hit}/${r.answer_kw_total}`
          : `expected_behavior=${r.expected_behavior_met}  noEv=${r.no_evidence_emitted}` + (r.gateBlocked ? ` (GATE-${r.gateStage})` : "");
      process.stdout.write(`   ${sig}  · src=${JSON.stringify(r.hit_source_types)}  · tokens=${r.input_tokens}/${r.output_tokens}\n`);
      results.push(r);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      process.stderr.write(`   ERROR: ${message}\n`);
      results.push({
        ...baseResultFor(item, { answer: `[ERR] ${message}`, gateBlocked: false, hits_count: 0, hit_source_types: {} }),
      });
    }
  }
  const duration = Date.now() - t0;

  // ─── 집계 ──────────────────────────────────────────────────────
  const fac = results.filter((r) => r.item.eval_type === "factual");
  const noev = results.filter((r) => r.item.eval_type === "no_evidence");
  const ref = results.filter((r) => r.item.eval_type === "refusal");
  const judgeAvg = fac.length ? fac.reduce((s, r) => s + (r.judge_score ?? 0), 0) / fac.length : 0;
  const ansKwAvg = fac.length
    ? fac.reduce((s, r) => s + (r.answer_kw_total ? 100 * r.answer_kw_hit / r.answer_kw_total : 0), 0) / fac.length
    : 0;
  const noevPass = noev.length ? 100 * noev.filter((r) => r.expected_behavior_met).length / noev.length : 0;
  const refPass = ref.length ? 100 * ref.filter((r) => r.expected_behavior_met).length / ref.length : 0;

  // ─── 리포트 ────────────────────────────────────────────────────
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(join(EVAL_DIR, "reports"), { recursive: true });
  const jsonlPath = join(EVAL_DIR, "reports", `v4-prod-${ts}.jsonl`);
  const mdPath = join(EVAL_DIR, "reports", `v4-prod-${ts}.md`);

  await writeFile(jsonlPath, results.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

  const noev2 = results.find((r) => r.item.id === "noev2");
  const md: string[] = [];
  md.push(`# v4-④ Production Eval Report — ${ts}`);
  md.push(``);
  md.push(`- Model: ${AI_QNA_MODEL} (생성 + judge) · gate: ${gateMode}`);
  md.push(`- items: ${items.length}  · duration: ${duration} ms  · tokens: ${totalIn} in / ${totalOut} out`);
  md.push(``);
  md.push(`## 요약`);
  md.push(``);
  md.push(`| 카테고리 | n | 지표 | 값 |`);
  md.push(`|---|---:|---|---:|`);
  md.push(`| factual | ${fac.length} | judge avg (0-5) | **${judgeAvg.toFixed(2)}** |`);
  md.push(`| factual | ${fac.length} | ansKW% | ${ansKwAvg.toFixed(1)}% |`);
  md.push(`| no_evidence | ${noev.length} | 거절률 (expected_behavior_met) | **${noevPass.toFixed(1)}%** |`);
  md.push(`| refusal | ${ref.length} | 거절률 | ${refPass.toFixed(1)}% |`);
  md.push(``);
  if (noev2) {
    md.push(`## noev2 단건 (v2 거짓답 회귀 가드 검증)`);
    md.push(``);
    md.push(`- expected_behavior_met: **${noev2.expected_behavior_met}**  · gateBlocked: ${noev2.gateBlocked}  · noEvOut: ${noev2.no_evidence_emitted}`);
    md.push(`- hit source types: ${JSON.stringify(noev2.hit_source_types)}`);
    md.push(``);
    md.push("```");
    md.push(noev2.answerText.slice(0, 800));
    md.push("```");
    md.push(``);
  }
  md.push(`## 항목별 (요약)`);
  md.push(``);
  md.push(`| id | type | judge | noEv | gateBlocked | src |`);
  md.push(`|---|---|---:|---|---|---|`);
  for (const r of results) {
    md.push(
      `| ${r.item.id} | ${r.item.eval_type} | ${r.judge_score ?? "-"} | ${r.no_evidence_emitted ? "Y" : "."} | ${r.gateBlocked ? r.gateStage : "."} | ${Object.entries(r.hit_source_types).map(([k, v]) => `${k}:${v}`).join(",")} |`,
    );
  }

  await writeFile(mdPath, md.join("\n"), "utf8");

  process.stdout.write(`\n--- done in ${duration} ms ---\n`);
  process.stdout.write(`reports:\n  ${jsonlPath}\n  ${mdPath}\n`);
  process.stdout.write(`tokens: ${totalIn} in / ${totalOut} out\n`);
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
