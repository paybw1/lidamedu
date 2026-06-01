// baseline-v8 — production 변경 0, 측정 전용.
//
// 실행 :
//   AI_QNA_DAILY_COST_USD_CAP=8 npx tsx scripts/baseline-v8.ts
//
// 흐름 :
//   1) 매 호출 전 checkGlobalCap → cap 도달 시 즉시 중단 (v4 가드 작동 확인 패턴)
//   2) factual 30문항 × 5회 반복 (judge 매회) — 변동성 측정
//   3) no_evidence(14) + refusal(6) × 1회 — 안전 확인 샷
//   4) 항목별·카테고리별 평균±표준편차·min·max + 0점 회차 분석
//   5) 저장 : rag-lab/eval/reports/baseline-v8-<ts>.jsonl + docs/eval/baseline-v8.md
//
// production code path 그대로 호출 (hybridSearch + answerQuestion + judgeAnswer). 변경 0.
// 평가 스크립트 자체에 checkGlobalCap 추가 — production 코드 아니므로 사용자 명시 "코드 변경 0" 에 부합.

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

interface RunOnceResult {
  item_id: string;
  iteration: number;
  judge_score: number | null;
  judge_verdict: string | null;
  judge_rationale: string | null;
  ans_kw_hit: number;
  ans_kw_total: number;
  no_evidence_emitted: boolean;
  expected_behavior_met: boolean | null;
  hit_source_types: Partial<Record<string, number>>;
  hit_chunk_ids: string[];
  input_tokens: number;
  output_tokens: number;
  answer_text: string;
}

const NO_EV_RE =
  /제공된\s*자료로는\s*확실히\s*답하기\s*어렵습니다|자료에서\s*근거를\s*찾지\s*못했습니다|자연과학\s*질문은\s*현재\s*AI\s*Q&A\s*가\s*지원하지\s*않습니다/;

function countKw(text: string, keywords: string[]): { hit: number; total: number } {
  const t = text.toLowerCase();
  let hit = 0;
  for (const k of keywords) if (t.includes(k.toLowerCase())) hit += 1;
  return { hit, total: keywords.length };
}

async function runOnce(item: EvalItem, iteration: number): Promise<RunOnceResult> {
  // ── 가드 ──────────────────────────────────────────────
  const cap = await checkGlobalCap(adminClient);
  if (cap.blocked) {
    throw new Error(`[GLOBAL CAP BLOCKED] ${capBlockedMessage(cap)} (reason=${cap.reason} cap=${cap.cap} current=${cap.current})`);
  }

  const search = await hybridSearch(adminClient, item.question, { topK: 12 });
  const dist: Partial<Record<string, number>> = {};
  for (const h of search.hits) dist[h.sourceType] = (dist[h.sourceType] ?? 0) + 1;
  const hitChunkIds = search.hits.map((h) => h.chunkId);

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
  await recordUsage(adminClient, AI_QNA_MODEL, tokenUsage.input, tokenUsage.output);

  const ansKw = countKw(fullText, item.expected_keywords);
  const noEv = NO_EV_RE.test(fullText);

  const result: RunOnceResult = {
    item_id: item.id,
    iteration,
    judge_score: null,
    judge_verdict: null,
    judge_rationale: null,
    ans_kw_hit: item.eval_type === "factual" ? ansKw.hit : 0,
    ans_kw_total: item.eval_type === "factual" ? ansKw.total : 0,
    no_evidence_emitted: noEv,
    expected_behavior_met: item.eval_type === "factual" ? null : noEv,
    hit_source_types: dist,
    hit_chunk_ids: hitChunkIds,
    input_tokens: tokenUsage.input,
    output_tokens: tokenUsage.output,
    answer_text: fullText,
  };

  if (item.eval_type === "factual") {
    const reference = `핵심 키워드: ${item.expected_keywords.join(", ")}\n비고: ${item.note ?? ""}`;
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

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

async function main(): Promise<void> {
  process.stdout.write("=== baseline-v8 measurement ===\n");
  process.stdout.write(`mode: production a_plus_b (변경 0), gate: off, statute-boost: 기본, topk: 12\n`);
  process.stdout.write(`global cap env: AI_QNA_DAILY_COST_USD_CAP=${process.env.AI_QNA_DAILY_COST_USD_CAP ?? "(unset)"}\n\n`);

  const raw = await readFile(join(EVAL_DIR, "questions_v3.jsonl"), "utf8");
  const items: EvalItem[] = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as EvalItem);
  const factual = items.filter((i) => i.eval_type === "factual");
  const noevRef = items.filter((i) => i.eval_type !== "factual");
  process.stdout.write(`items: factual=${factual.length}, no_evidence+refusal=${noevRef.length}\n\n`);

  const allResults: RunOnceResult[] = [];
  const t0 = Date.now();
  let totalIn = 0;
  let totalOut = 0;

  // ── factual 30 × 5회 ──
  for (let iter = 1; iter <= 5; iter++) {
    process.stdout.write(`\n────── iter ${iter}/5 (factual ${factual.length}) ──────\n`);
    for (const item of factual) {
      try {
        const r = await runOnce(item, iter);
        allResults.push(r);
        totalIn += r.input_tokens;
        totalOut += r.output_tokens;
        process.stdout.write(`  [${item.id}#${iter}] judge=${r.judge_score} ${r.judge_verdict} tokens=${r.input_tokens}/${r.output_tokens}\n`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`  [${item.id}#${iter}] ERROR: ${msg.slice(0, 200)}\n`);
        if (msg.includes("[GLOBAL CAP BLOCKED]")) {
          process.stderr.write(`\n!! cap 도달 — 측정 중단. 지금까지 수집된 ${allResults.length} 결과로 분석 진행.\n`);
          await writeAndAnalyze(items, allResults, totalIn, totalOut, Date.now() - t0, "ABORTED_BY_CAP");
          process.exit(0);
        }
      }
    }
  }

  // ── no_evidence + refusal × 1회 ──
  process.stdout.write(`\n────── safety shot (no_evidence + refusal ${noevRef.length}) ──────\n`);
  for (const item of noevRef) {
    try {
      const r = await runOnce(item, 1);
      allResults.push(r);
      totalIn += r.input_tokens;
      totalOut += r.output_tokens;
      process.stdout.write(`  [${item.id}/${item.eval_type}] met=${r.expected_behavior_met} noEv=${r.no_evidence_emitted}\n`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`  [${item.id}] ERROR: ${msg.slice(0, 200)}\n`);
      if (msg.includes("[GLOBAL CAP BLOCKED]")) break;
    }
  }

  await writeAndAnalyze(items, allResults, totalIn, totalOut, Date.now() - t0, "OK");
}

async function writeAndAnalyze(
  items: EvalItem[],
  allResults: RunOnceResult[],
  totalIn: number,
  totalOut: number,
  durationMs: number,
  status: string,
): Promise<void> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(join(EVAL_DIR, "reports"), { recursive: true });
  await mkdir(DOCS_EVAL, { recursive: true });

  const jsonlPath = join(EVAL_DIR, "reports", `baseline-v8-${ts}.jsonl`);
  await writeFile(jsonlPath, allResults.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

  // ── 항목별 집계 (factual) ──
  const byItem = new Map<string, RunOnceResult[]>();
  for (const r of allResults) {
    const arr = byItem.get(r.item_id) ?? [];
    arr.push(r);
    byItem.set(r.item_id, arr);
  }

  interface ItemStats {
    item: EvalItem;
    n: number;
    scores: number[];
    mean: number;
    std: number;
    min: number;
    max: number;
    zeroCount: number;
    chunkIdsByIter: string[][];
    sameTop12: boolean;     // 검색이 결정적인가
    failedRun?: RunOnceResult;  // 0점 회차 샘플 (분석용)
  }
  const stats: ItemStats[] = [];
  for (const item of items.filter((i) => i.eval_type === "factual")) {
    const rs = (byItem.get(item.id) ?? []).filter((r) => r.judge_score !== null);
    const scores = rs.map((r) => r.judge_score ?? 0);
    const mean = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;
    const chunkIdsByIter = rs.map((r) => [...r.hit_chunk_ids].sort());
    const sameTop12 =
      chunkIdsByIter.length > 1
      && chunkIdsByIter.every((c) => JSON.stringify(c) === JSON.stringify(chunkIdsByIter[0]));
    stats.push({
      item, n: rs.length, scores, mean, std: stddev(scores),
      min: scores.length ? Math.min(...scores) : 0,
      max: scores.length ? Math.max(...scores) : 0,
      zeroCount: scores.filter((s) => s === 0).length,
      chunkIdsByIter, sameTop12,
      failedRun: rs.find((r) => r.judge_score === 0),
    });
  }

  // 카테고리별
  const cat = (prefix: string) => stats.filter((s) => s.item.id.startsWith(prefix));
  const aggCat = (rs: ItemStats[]) => {
    const allMeans = rs.map((s) => s.mean);
    const allStds = rs.map((s) => s.std);
    return {
      n: rs.length,
      mean: allMeans.length ? allMeans.reduce((s, x) => s + x, 0) / allMeans.length : 0,
      stdMean: allStds.length ? allStds.reduce((s, x) => s + x, 0) / allStds.length : 0,
    };
  };
  const cSt = aggCat(cat("st"));
  const cCa = aggCat(cat("ca"));
  const cB = aggCat(cat("b"));
  const cAll = aggCat(stats);

  // no_evidence/refusal
  const noevAll = allResults.filter((r) => {
    const it = items.find((i) => i.id === r.item_id);
    return it?.eval_type === "no_evidence";
  });
  const refAll = allResults.filter((r) => {
    const it = items.find((i) => i.id === r.item_id);
    return it?.eval_type === "refusal";
  });

  // st5/9/12 집중
  const focusIds = ["st5", "st9", "st12"];
  const focusStats = stats.filter((s) => focusIds.includes(s.item.id));

  // ── md 리포트 ──
  const md: string[] = [];
  md.push(`# AI Q&A — baseline v7 (v8-B1 practice_intent path 후) (production 변경 0, 측정 전용)`);
  md.push(``);
  md.push(`- 생성: ${ts}`);
  md.push(`- 상태: ${status}`);
  md.push(`- 설정: production default (mode=a_plus_b, statute-boost, topk=12, gate=off, 권위 가중치 0.7)`);
  md.push(`- 평가셋: rag-lab/eval/questions_v3.jsonl (factual 30 × 5회 + no_evidence 14·refusal 6 × 1회)`);
  md.push(`- 모델: ${AI_QNA_MODEL} (생성 + judge)`);
  md.push(`- 토큰: ${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out`);
  md.push(`- 소요: ${durationMs.toLocaleString()} ms`);
  md.push(`- 글로벌 cap: AI_QNA_DAILY_COST_USD_CAP=${process.env.AI_QNA_DAILY_COST_USD_CAP ?? "(unset)"}`);
  md.push(``);
  md.push(`## 카테고리별 기준선 (5회 평균 ± 평균 표준편차)`);
  md.push(``);
  md.push(`| 카테고리 | n | 5회 평균 judge | 평균 std | 해석 |`);
  md.push(`|---|---:|---:|---:|---|`);
  md.push(`| statute (st1~st15) | ${cSt.n} | **${cSt.mean.toFixed(2)}/5** | ±${cSt.stdMean.toFixed(2)} | — |`);
  md.push(`| case (ca1~ca8)     | ${cCa.n} | **${cCa.mean.toFixed(2)}/5** | ±${cCa.stdMean.toFixed(2)} | — |`);
  md.push(`| b 필수 (b1~b7)     | ${cB.n} | **${cB.mean.toFixed(2)}/5** | ±${cB.stdMean.toFixed(2)} | — |`);
  md.push(`| **전체 factual**   | ${cAll.n} | **${cAll.mean.toFixed(2)}/5** | ±${cAll.stdMean.toFixed(2)} | baseline |`);
  md.push(``);
  md.push(`## 문항별 5회 통계 (factual)`);
  md.push(``);
  md.push(`| id | n | mean | std | min | max | 0점회차 | 검색결정적 |`);
  md.push(`|---|---:|---:|---:|---:|---:|---:|---|`);
  for (const s of stats) {
    md.push(`| ${s.item.id} | ${s.n} | ${s.mean.toFixed(2)} | ${s.std.toFixed(2)} | ${s.min} | ${s.max} | ${s.zeroCount}/${s.n} | ${s.sameTop12 ? "Y" : "N"} |`);
  }
  md.push(``);
  md.push(`## st5 / st9 / st12 집중 분석`);
  md.push(``);
  for (const s of focusStats) {
    const judgement = s.zeroCount === s.n
      ? "**실제 회귀** — 5회 모두 0점. 검색·생성·평가 어느 단계의 시스템 결함."
      : s.zeroCount === 0
        ? "**완전 정상** — 0점 회차 없음. v5 1회 측정의 변동성"
        : `**변동성** — ${s.zeroCount}/${s.n} 회차만 0점. 평균 ${s.mean.toFixed(2)}/5 을 기준선으로 사용`;
    md.push(`### ${s.item.id}`);
    md.push(``);
    md.push(`- 5회 점수: [${s.scores.join(", ")}]  · mean ${s.mean.toFixed(2)} · std ${s.std.toFixed(2)}`);
    md.push(`- 검색 결정적: ${s.sameTop12 ? "Y (5회 동일 top-12)" : "N (회차별 top-12 변동 있음)"}`);
    md.push(`- 판정: ${judgement}`);
    if (s.failedRun) {
      md.push(`- 0점 회차 인용 source: ${JSON.stringify(s.failedRun.hit_source_types)}`);
      md.push(``);
      md.push("```");
      md.push(s.failedRun.answer_text.slice(0, 400));
      md.push("```");
    }
    md.push(``);
  }
  md.push(`## no_evidence / refusal 안전 확인 샷 (1회)`);
  md.push(``);
  md.push(`| 카테고리 | n | met 비율 |`);
  md.push(`|---|---:|---:|`);
  md.push(`| no_evidence | ${noevAll.length} | ${noevAll.length ? `${noevAll.filter((r) => r.expected_behavior_met).length}/${noevAll.length}` : "-"} |`);
  md.push(`| refusal | ${refAll.length} | ${refAll.length ? `${refAll.filter((r) => r.expected_behavior_met).length}/${refAll.length}` : "-"} |`);
  md.push(``);
  // 합격선 임계
  md.push(`## 합격선 임계 (이후 최적화 라운드 회귀 판정 기준)`);
  md.push(``);
  md.push(`baseline 평균 - 1 × std (95% 신뢰구간 보수치) 를 합격 최저선으로 제안:`);
  md.push(``);
  md.push(`| 카테고리 | baseline | 합격 최저선 (mean - std) |`);
  md.push(`|---|---:|---:|`);
  md.push(`| statute | ${cSt.mean.toFixed(2)} | ≥ ${(cSt.mean - cSt.stdMean).toFixed(2)} |`);
  md.push(`| case    | ${cCa.mean.toFixed(2)} | ≥ ${(cCa.mean - cCa.stdMean).toFixed(2)} |`);
  md.push(`| b 필수  | ${cB.mean.toFixed(2)} | ≥ ${(cB.mean - cB.stdMean).toFixed(2)} |`);
  md.push(`| 전체    | ${cAll.mean.toFixed(2)} | ≥ ${(cAll.mean - cAll.stdMean).toFixed(2)} |`);
  md.push(``);
  md.push(`다음 원가 최적화/튜닝 라운드에서:`);
  md.push(`- 카테고리 평균이 위 합격선보다 떨어지면 **회귀로 본다**.`);
  md.push(`- no_evidence/refusal 거절률이 100% 미만이면 안전성 회귀 — 즉시 롤백.`);
  md.push(``);
  md.push(`## 변경 0 보증`);
  md.push(``);
  md.push(`본 라운드는 측정 전용. 변경 없음:`);
  md.push(`- production 코드 (app/features/ai-qna/*) : 변경 0`);
  md.push(`- DB 스키마·migration : 변경 0`);
  md.push(`- 시스템 프롬프트·검색 가중치·gate 설정 : 변경 0`);
  md.push(`- 신규 파일: scripts/baseline-v8.ts (측정 스크립트만)`);

  const mdPath = join(DOCS_EVAL, "baseline-v8.md");
  await writeFile(mdPath, md.join("\n"), "utf8");

  process.stdout.write(`\n--- baseline-v8 done ---\n`);
  process.stdout.write(`reports:\n  ${jsonlPath}\n  ${mdPath}\n`);
  process.stdout.write(`tokens: ${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out\n`);
  process.stdout.write(`status: ${status}\n`);
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
