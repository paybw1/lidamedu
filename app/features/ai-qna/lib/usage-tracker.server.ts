// feat-9 v4 — 전역 일일 토큰·비용 가드 + 사용량 기록.
//
// 운영:
//   - 환경변수로 임계값 설정 (미설정 → 무제한). 셋 중 하나라도 초과 시 차단:
//       AI_QNA_DAILY_INPUT_TOKEN_CAP   = N tokens
//       AI_QNA_DAILY_OUTPUT_TOKEN_CAP  = N tokens
//       AI_QNA_DAILY_COST_USD_CAP      = N (USD)
//   - 차단 시 ask.tsx 는 게이트와 동일한 거절 응답 + 로깅
//   - 시연 (v4-③ 완료 기준): cap 을 매우 낮은 값 (예: 100) 으로 설정 → 차단되는지 직접 확인
//
// 본 모듈은 service_role admin client 만 사용 (ai_usage_daily 는 service_role write 전용).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { estimateCostUsd } from "./pricing";

const ENV_INPUT_CAP = Number(process.env.AI_QNA_DAILY_INPUT_TOKEN_CAP ?? "0");
const ENV_OUTPUT_CAP = Number(process.env.AI_QNA_DAILY_OUTPUT_TOKEN_CAP ?? "0");
const ENV_COST_CAP = Number(process.env.AI_QNA_DAILY_COST_USD_CAP ?? "0");

/**
 * KST(UTC+9) 자정 기준 오늘 날짜 (YYYY-MM-DD).
 * Vercel 서버리스가 UTC 라 별도 변환 필요.
 */
export function kstToday(now: Date = new Date()): string {
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffsetMs);
  return kst.toISOString().slice(0, 10);
}

export interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface GlobalCapCheck {
  blocked: boolean;
  reason?:
    | "daily_input_token_cap"
    | "daily_output_token_cap"
    | "daily_cost_usd_cap";
  cap?: number;
  current?: number;
  usage?: DailyUsage;
}

/** 환경변수 임계값 모두 미설정이면 가드 자체 OFF (운영 default). */
function capsConfigured(): boolean {
  return ENV_INPUT_CAP > 0 || ENV_OUTPUT_CAP > 0 || ENV_COST_CAP > 0;
}

/**
 * 호출 전 게이트.
 *   - 임계 미설정 → 통과
 *   - 임계 설정 + 행 없음 → 통과 (오늘 첫 호출)
 *   - 임계 도달 → 차단 + reason 반환
 *
 * 호출 후 increment 가 임계 넘는 것은 *다음* 요청부터 차단. (보수적·구현 단순)
 */
export async function checkGlobalCap(
  adminClient: SupabaseClient<Database>,
): Promise<GlobalCapCheck> {
  if (!capsConfigured()) return { blocked: false };
  const today = kstToday();
  const { data, error } = await adminClient
    .from("ai_usage_daily")
    .select("date, total_input_tokens, total_output_tokens, total_cost_usd")
    .eq("date", today)
    .maybeSingle();
  if (error) {
    console.warn("[usage-tracker] checkGlobalCap query error:", error.message);
    return { blocked: false };   // 조회 실패 → fail-open (운영 마비 방지)
  }
  if (!data) return { blocked: false };

  const usage: DailyUsage = {
    date: data.date,
    inputTokens: Number(data.total_input_tokens),
    outputTokens: Number(data.total_output_tokens),
    costUsd: Number(data.total_cost_usd),
  };

  if (ENV_INPUT_CAP > 0 && usage.inputTokens >= ENV_INPUT_CAP) {
    return { blocked: true, reason: "daily_input_token_cap", cap: ENV_INPUT_CAP, current: usage.inputTokens, usage };
  }
  if (ENV_OUTPUT_CAP > 0 && usage.outputTokens >= ENV_OUTPUT_CAP) {
    return { blocked: true, reason: "daily_output_token_cap", cap: ENV_OUTPUT_CAP, current: usage.outputTokens, usage };
  }
  if (ENV_COST_CAP > 0 && usage.costUsd >= ENV_COST_CAP) {
    return { blocked: true, reason: "daily_cost_usd_cap", cap: ENV_COST_CAP, current: usage.costUsd, usage };
  }
  return { blocked: false, usage };
}

/**
 * 호출 후 사용량 기록 — atomic upsert (RPC).
 * 토큰 0 호출(게이트 차단 등)은 skip — 의미 없는 행 갱신 방지.
 */
export async function recordUsage(
  adminClient: SupabaseClient<Database>,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  if (inputTokens <= 0 && outputTokens <= 0) return;
  const cost = estimateCostUsd(model, inputTokens, outputTokens);
  const today = kstToday();
  const { error } = await adminClient.rpc("ai_usage_daily_increment", {
    p_date: today,
    p_input: inputTokens,
    p_output: outputTokens,
    p_cost: cost,
  });
  if (error) {
    // fail-open: 기록 실패는 운영 마비 사유 아님. 다만 경고 로그.
    console.warn("[usage-tracker] recordUsage RPC error:", error.message);
  }
}

/** 표준 차단 사유 → 사용자 안내 문구. */
export function capBlockedMessage(check: GlobalCapCheck): string {
  switch (check.reason) {
    case "daily_input_token_cap":
    case "daily_output_token_cap":
    case "daily_cost_usd_cap":
      return "오늘 전체 사용량이 운영 한도에 도달했습니다. 잠시 후 다시 이용하거나 강사 Q&A 를 이용해 주세요.";
    default:
      return "현재 서비스가 일시적으로 제한되어 있습니다.";
  }
}
