// feat-9-005 v1.2 — eval 항목 1건을 평가 → ai_eval_runs insert.
// 호출자: cron(/api/cron/ai-eval-run) 또는 운영자 수동 트리거(/admin/ai-qna/eval).
// admin client(service_role) 사용 — RLS 우회 write.

import adminClient from "~/core/lib/supa-admin-client.server";

import { answerQuestion } from "./answer.server";
import type { Citation } from "./citations";
import { AI_QNA_MODEL } from "./constants";
import { hybridSearch } from "./hybrid-search.server";
import { judgeAnswer } from "./judge.server";

export interface RunSingleEvalOptions {
  /** 평가 시 RAG topK 캡. default 8 (운영 quota.maxContextChunks 와 일치). */
  topK?: number;
  /** answer max tokens. default 800. */
  maxAnswerTokens?: number;
  /** 누가 트리거했는지 — null 이면 cron. */
  triggeredBy?: string | null;
}

export interface RunSingleEvalResult {
  runId: string;
  score: number;
  verdict: "pass" | "partial" | "fail";
}

/**
 * 한 eval_item 을 실행해 ai_eval_runs row 1개 추가.
 * 실패(LLM 오류·judge 파싱 실패 등) 는 throw — 호출자가 best-effort.
 */
export async function runSingleEval(
  evalItemId: string,
  opts: RunSingleEvalOptions = {},
): Promise<RunSingleEvalResult> {
  const { data: item, error } = await adminClient
    .from("ai_eval_items")
    .select(
      "eval_item_id, question, reference_answer, law_codes, status",
    )
    .eq("eval_item_id", evalItemId)
    .maybeSingle();
  if (error) throw error;
  if (!item) throw new Error(`eval_item not found: ${evalItemId}`);
  if (item.status !== "active")
    throw new Error(`eval_item archived: ${evalItemId}`);

  // 1) RAG 검색 — admin client 로 search (RLS 우회) — content_chunks 는 인증 read 라 OK 지만 일관.
  const search = await hybridSearch(adminClient, item.question, {
    topK: opts.topK ?? 8,
    lawCodesOverride: item.law_codes.length > 0 ? item.law_codes : undefined,
  });

  // 2) 답변 생성 — 단일턴.
  let fullText = "";
  let citations: Citation[] = [];
  let answerTokens = { input: 0, output: 0 };
  for await (const ev of answerQuestion(
    [{ role: "user", content: item.question }],
    search.hits,
    { maxTokens: opts.maxAnswerTokens ?? 800 },
  )) {
    if (ev.type === "text") {
      fullText += ev.delta;
    } else if (ev.type === "done") {
      citations = ev.citations;
      answerTokens = ev.tokenUsage;
      break;
    } else if (ev.type === "error") {
      throw new Error(`answer 생성 실패: ${ev.message}`);
    }
  }
  if (!fullText.trim()) throw new Error("answer 빈 응답");

  // 3) judge.
  const judge = await judgeAnswer(item.question, item.reference_answer, fullText);

  // 4) ai_eval_runs insert.
  const row = {
    eval_item_id: evalItemId,
    ai_answer: fullText,
    ai_citations: citations as unknown,
    search_meta: {
      hitIds: search.hits.map((h) => h.chunkId),
      perPathCounts: search.perPathCounts,
      parsed: search.parsed,
      semanticAvailable: search.semanticAvailable,
    } as unknown,
    answer_model: AI_QNA_MODEL,
    judge_score: judge.score,
    judge_verdict: judge.verdict,
    judge_rationale: judge.rationale,
    judge_model: judge.model,
    token_usage: {
      answerInput: answerTokens.input,
      answerOutput: answerTokens.output,
      judgeInput: judge.tokenUsage.input,
      judgeOutput: judge.tokenUsage.output,
    } as unknown,
    triggered_by: opts.triggeredBy ?? null,
  };
  const { data: inserted, error: insErr } = await adminClient
    .from("ai_eval_runs")
    .insert(row as never)
    .select("run_id")
    .single();
  if (insErr || !inserted)
    throw new Error(`ai_eval_runs insert 실패: ${insErr?.message ?? "no row"}`);

  return { runId: inserted.run_id, score: judge.score, verdict: judge.verdict };
}

/**
 * 우선순위가 높은 active eval_item 들 select. cron 이 한 번에 N 개 처리.
 * 우선: (a) ai_eval_runs 없음 (b) 가장 오래된 last run.
 */
export async function pickEvalItemsToRun(limit: number): Promise<string[]> {
  // 한 query 로: left join lateral 로 last run 시각 가져오기. supabase-js 단순화 — 두 단계.
  const { data: items, error } = await adminClient
    .from("ai_eval_items")
    .select("eval_item_id, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(500); // active 셋이 매우 크지 않다는 가정. cron 안전선.
  if (error) throw error;
  const allIds = (items ?? []).map((r) => r.eval_item_id);
  if (allIds.length === 0) return [];

  // 각 item 의 last run 시각 fetch — 한 query.
  const { data: runs } = await adminClient
    .from("ai_eval_runs")
    .select("eval_item_id, created_at")
    .in("eval_item_id", allIds)
    .order("created_at", { ascending: false });
  const lastByItem = new Map<string, string>();
  for (const r of runs ?? []) {
    if (!lastByItem.has(r.eval_item_id))
      lastByItem.set(r.eval_item_id, r.created_at);
  }

  // 우선순위: lastRun=null(0) → 가장 오래된 lastRun → 그 다음.
  return allIds
    .map((id) => ({
      id,
      key: lastByItem.get(id) ?? "0000-01-01T00:00:00Z",
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, limit)
    .map((x) => x.id);
}
