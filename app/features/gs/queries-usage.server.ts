// GS AI/OCR 사용량 운영자 가시성 — RPC wrapper.
// 모든 호출은 staff guard (is_staff(auth.uid())) 가 DB 측에서 적용.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export interface DailyUsageRow {
  date: string;
  aiCalls: number;
  aiCostUsd: number;
  ocrCalls: number;
  ocrPages: number;
  ocrCostUsd: number;
  aiSkippedCap: number;
  ocrSkippedCap: number;
}

export async function getRecentUsage(
  client: SupabaseClient<Database>,
  days = 7,
): Promise<DailyUsageRow[]> {
  const { data, error } = await client.rpc("gs_ai_usage_recent_days", {
    p_days: days,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    date: r.date as string,
    aiCalls: Number(r.ai_calls ?? 0),
    aiCostUsd: Number(r.ai_cost_usd ?? 0),
    ocrCalls: Number(r.ocr_calls ?? 0),
    ocrPages: Number(r.ocr_pages ?? 0),
    ocrCostUsd: Number(r.ocr_cost_usd ?? 0),
    aiSkippedCap: Number(r.ai_skipped_cap ?? 0),
    ocrSkippedCap: Number(r.ocr_skipped_cap ?? 0),
  }));
}

export interface RoundUsageRow {
  roundId: string;
  roundTitle: string | null;
  aiCostUsd: number;
  ocrCostUsd: number;
  totalCostUsd: number;
  aiCalls: number;
  ocrCalls: number;
}

export async function getTopRoundsByUsage(
  client: SupabaseClient<Database>,
  days = 7,
  limit = 10,
): Promise<RoundUsageRow[]> {
  const { data, error } = await client.rpc("gs_ai_usage_top_rounds", {
    p_days: days,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    roundId: r.round_id as string,
    roundTitle: r.round_title as string | null,
    aiCostUsd: Number(r.ai_cost_usd ?? 0),
    ocrCostUsd: Number(r.ocr_cost_usd ?? 0),
    totalCostUsd: Number(r.total_cost_usd ?? 0),
    aiCalls: Number(r.ai_calls ?? 0),
    ocrCalls: Number(r.ocr_calls ?? 0),
  }));
}

export interface RoundSummaryRow {
  kind: "ai_grade" | "ai_draft" | "ocr";
  calls: number;
  success: number;
  skippedCap: number;
  inputTokens: number;
  outputTokens: number;
  pages: number;
  costUsd: number;
}

export async function getRoundUsageSummary(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<RoundSummaryRow[]> {
  const { data, error } = await client.rpc("gs_ai_usage_round_summary", {
    p_round_id: roundId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    kind: r.kind as "ai_grade" | "ai_draft" | "ocr",
    calls: Number(r.calls ?? 0),
    success: Number(r.success ?? 0),
    skippedCap: Number(r.skipped_cap ?? 0),
    inputTokens: Number(r.input_tokens ?? 0),
    outputTokens: Number(r.output_tokens ?? 0),
    pages: Number(r.pages ?? 0),
    costUsd: Number(r.cost_usd ?? 0),
  }));
}
