// feat-9-006 — AI Q&A 한도·토큰 캡 + 사용량 측정.
//
// 한도는 app_settings.ai_qna_quotas 단일 jsonb 키로 관리. 운영자가 SQL/UI 로 즉시 변경 가능.
// tier 결정: staff 또는 area_study_mgmt 보유 = tier1, 그 외 = free.
// 사용량 측정: ai_messages.role='assistant' 의 KST 자정 이후 카운트 (사용자별).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { getAppSetting, setAppSetting } from "~/core/lib/app-settings.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { getActiveSubscription } from "~/features/subscriptions/queries.server";

export const AI_QNA_QUOTAS_KEY = "ai_qna_quotas";

export interface AiQuotas {
  freeDailyLimit: number;
  tier1DailyLimit: number;
  maxOutputTokens: number;
  maxContextChunks: number;
}

const DEFAULT_QUOTAS: AiQuotas = {
  freeDailyLimit: 5,
  tier1DailyLimit: 20,
  maxOutputTokens: 800,
  maxContextChunks: 8,
};

/**
 * 현재 한도/캡 설정 조회. 미설정·일부 누락 시 DEFAULT_QUOTAS 로 보충.
 * 운영자가 어떤 값을 빠뜨려도 시스템이 멈추지 않게.
 */
export async function getAiQuotas(
  client: SupabaseClient<Database>,
): Promise<AiQuotas> {
  const raw = await getAppSetting(client, AI_QNA_QUOTAS_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_QUOTAS };
  }
  const r = raw as Record<string, unknown>;
  return {
    freeDailyLimit: pickPositiveInt(r.freeDailyLimit, DEFAULT_QUOTAS.freeDailyLimit),
    tier1DailyLimit: pickPositiveInt(r.tier1DailyLimit, DEFAULT_QUOTAS.tier1DailyLimit),
    maxOutputTokens: pickPositiveInt(r.maxOutputTokens, DEFAULT_QUOTAS.maxOutputTokens),
    maxContextChunks: pickPositiveInt(r.maxContextChunks, DEFAULT_QUOTAS.maxContextChunks),
  };
}

export async function setAiQuotas(
  client: SupabaseClient<Database>,
  quotas: AiQuotas,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return setAppSetting(
    client,
    AI_QNA_QUOTAS_KEY,
    quotas as unknown as Parameters<typeof setAppSetting>[2],
    userId,
  );
}

function pickPositiveInt(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return fallback;
  return Math.floor(v);
}

// ── tier 결정 ───────────────────────────────────────────────────────────

export type AiTier = "free" | "tier1";

/**
 * 사용자 tier 결정. staff 는 tier1 면제 (무제한 가까움 — tier1 한도 사용).
 * area_study_mgmt 보유 시 tier1. 그 외 free.
 */
export async function getUserAiTier(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<AiTier> {
  const role = await getStaffRole(client, userId);
  if (role) return "tier1";
  const sub = await getActiveSubscription(client, userId);
  if (sub.features.includes("area_study_mgmt")) return "tier1";
  return "free";
}

export function tierDailyLimit(tier: AiTier, quotas: AiQuotas): number {
  return tier === "tier1" ? quotas.tier1DailyLimit : quotas.freeDailyLimit;
}

// ── 사용량 측정 (KST 자정 기준) ────────────────────────────────────────────

/**
 * KST 오늘(자정 이후)의 본인 assistant 메시지 수. soft-deleted 대화 제외.
 * Asia/Seoul 시간대 — UTC+9 고정 (DST 없음). PostgREST count:exact + head:true.
 */
export async function countAssistantMessagesToday(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const sinceUtc = kstMidnightUtcIso();
  const { count, error } = await client
    .from("ai_messages")
    .select(
      "message_id, ai_conversations!inner(user_id, deleted_at)",
      { count: "exact", head: true },
    )
    .eq("role", "assistant")
    .gte("created_at", sinceUtc)
    .eq("ai_conversations.user_id", userId)
    .is("ai_conversations.deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * 통합 Q&A 의 AI 즉답(qna_messages.role='ai') 중 본인 스레드 + 오늘(KST) 건수.
 * 일일 쿼터는 구 /ai 챗(ai_messages)과 통합 Q&A 가 같은 풀을 공유하므로 둘을 합산한다.
 * soft-deleted 메시지·스레드 제외.
 */
export async function countQnaAiMessagesToday(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const sinceUtc = kstMidnightUtcIso();
  const { count, error } = await client
    .from("qna_messages")
    .select(
      "message_id, qna_threads!inner(asker_id, deleted_at)",
      { count: "exact", head: true },
    )
    .eq("role", "ai")
    .gte("created_at", sinceUtc)
    .eq("qna_threads.asker_id", userId)
    .is("deleted_at", null)
    .is("qna_threads.deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * 오늘 KST 자정의 UTC 시각(ISO). created_at >= 이 값으로 비교.
 */
function kstMidnightUtcIso(): string {
  // 현재 UTC 에 9시간 더해 KST 시각을 만들고, 그 날짜의 0시 KST → 다시 UTC 환산.
  const now = new Date();
  // KST 시각 (UTC + 9시간).
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // 해당 KST 의 자정 = year/month/day 0:00 KST.
  const yyyy = kstNow.getUTCFullYear();
  const mm = kstNow.getUTCMonth();
  const dd = kstNow.getUTCDate();
  // KST 자정 = UTC -9시간 = (yyyy/mm/dd 00:00 KST) → UTC (yyyy/mm/(dd-1) 15:00)
  const kstMidnightUtc = Date.UTC(yyyy, mm, dd, 0, 0, 0) - 9 * 60 * 60 * 1000;
  return new Date(kstMidnightUtc).toISOString();
}

// ── 종합 헬퍼 — ask endpoint 가 한 번에 호출 ───────────────────────────────

export interface QuotaState {
  tier: AiTier;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  exceeded: boolean;
  quotas: AiQuotas;
}

export async function getQuotaState(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<QuotaState> {
  const [quotas, tier, usedChat, usedQna] = await Promise.all([
    getAiQuotas(client),
    getUserAiTier(client, userId),
    countAssistantMessagesToday(client, userId),
    countQnaAiMessagesToday(client, userId),
  ]);
  // 구 /ai 챗 + 통합 Q&A 의 AI 답변을 합산 — 같은 일일 한도 풀.
  const used = usedChat + usedQna;
  const dailyLimit = tierDailyLimit(tier, quotas);
  return {
    tier,
    dailyLimit,
    usedToday: used,
    remaining: Math.max(0, dailyLimit - used),
    exceeded: used >= dailyLimit,
    quotas,
  };
}
