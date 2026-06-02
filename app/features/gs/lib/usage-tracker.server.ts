// GS AI/OCR 사용량 로깅 모듈.
//
// §1 — 사용량 기록(insert). 호출 측은 결과·메타·outcome 을 함께 넘긴다.
// §2 에서 cap 게이트 (checkAiCap / checkOcrCap) 추가 예정.
//
// 모든 write/read 는 service_role admin client. RLS 정책 없음 (테이블이 service_role 전용).
// 호출 측이 admin client 를 갖고 있지 않을 때를 대비, 본 모듈에서 직접 import.

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  OCR_MODEL_ID,
  estimateAiCostUsd,
  estimateOcrCostUsd,
} from "~/features/gs/lib/pricing";

export type GsUsageKind = "ai_grade" | "ai_draft" | "ocr";
export type GsUsageOutcome =
  | "success"
  | "failed"
  | "skipped_cap"
  | "skipped_no_key";

export interface UsageMeta {
  roundId?: string | null;
  submissionId?: string | null;
  userId?: string | null;
}

/**
 * KST(UTC+9) 자정 기준 오늘 (YYYY-MM-DD).
 * Vercel 서버리스가 UTC 라 별도 변환 필요.
 * 1차 RAG `usage-tracker.server.ts` 의 `kstToday` 와 동일 구현 — 의도된 중복(모듈 의존성 차단).
 */
export function kstToday(now: Date = new Date()): string {
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffsetMs);
  return kst.toISOString().slice(0, 10);
}

export type AiUsageKind =
  | "ai_grade"
  | "ai_draft"
  | "ai_issue_extract"        // GS §1 강사 액션 — 모범답안 → 논점 목록 초안
  | "ai_issue_analyze"        // GS §3 학생 액션 — 학생 논점 ↔ 모범 매칭 분석
  | "ai_case_facts_draft"     // 판례훈련 §1 강사 — 판례 전문 → 사실관계 요약 초안
  | "ai_case_issues_draft"    // 판례훈련 §1 강사 — 판례 전문 → 쟁점 목록 초안
  | "ai_case_issue_analyze";  // 판례훈련 §3 학생 — 학생 쟁점 ↔ 모범 매칭 분석

interface RecordAiArgs {
  kind: AiUsageKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  meta?: UsageMeta;
  outcome: GsUsageOutcome;
  reason?: string;
}

/**
 * AI 호출 기록 — 토큰 단가로 비용 산정.
 * outcome 이 success 이외(skipped_*, failed)면 비용 0 으로 기록. 토큰 0 이어도 기록(skip 카운트 가시화).
 */
export async function recordAiUsage(args: RecordAiArgs): Promise<void> {
  const cost =
    args.outcome === "success"
      ? estimateAiCostUsd(args.model, args.inputTokens, args.outputTokens)
      : 0;
  const { error } = await adminClient.from("gs_ai_usage").insert({
    date: kstToday(),
    kind: args.kind,
    round_id: args.meta?.roundId ?? null,
    submission_id: args.meta?.submissionId ?? null,
    user_id: args.meta?.userId ?? null,
    model: args.model,
    input_tokens: args.outcome === "success" ? Math.max(0, args.inputTokens) : 0,
    output_tokens: args.outcome === "success" ? Math.max(0, args.outputTokens) : 0,
    pages: 0,
    cost_usd: cost,
    outcome: args.outcome,
    reason: args.reason ?? null,
  });
  if (error) {
    // fail-open — 로깅 실패가 운영 마비 사유 아님. 콘솔 경고만.
    console.warn("[gs/usage-tracker] recordAiUsage failed:", error.message);
  }
}

interface RecordOcrArgs {
  pages?: number; // default 1 (1 호출 = 1 페이지).
  meta?: UsageMeta;
  outcome: GsUsageOutcome;
  reason?: string;
}

/**
 * OCR 호출 기록 — Vision 페이지 단가로 비용 산정.
 * outcome 이 success 이외(skipped_*, failed)면 비용 0.
 */
export async function recordOcrUsage(args: RecordOcrArgs): Promise<void> {
  const pages = args.pages ?? 1;
  const cost =
    args.outcome === "success" ? estimateOcrCostUsd(pages) : 0;
  const { error } = await adminClient.from("gs_ai_usage").insert({
    date: kstToday(),
    kind: "ocr",
    round_id: args.meta?.roundId ?? null,
    submission_id: args.meta?.submissionId ?? null,
    user_id: args.meta?.userId ?? null,
    model: OCR_MODEL_ID,
    input_tokens: 0,
    output_tokens: 0,
    pages: args.outcome === "success" ? Math.max(0, pages) : 0,
    cost_usd: cost,
    outcome: args.outcome,
    reason: args.reason ?? null,
  });
  if (error) {
    console.warn("[gs/usage-tracker] recordOcrUsage failed:", error.message);
  }
}

/* ── §2 cap 게이트 ──────────────────────────────────────────────────
 *
 * 운영 환경변수 (모두 미설정 = OFF, 운영 default).
 * 도달 시:
 *   - AI: 신규 호출 차단. 강사 채점 화면이 "AI 초안 일일 한도 도달" 안내.
 *   - OCR: 신규 호출 차단. 페이지 업로드는 계속 (attachment.ocrSkippedReason 마킹).
 *
 * 핵심 원칙: 학생 응시 / 강사 채점 등 핵심 흐름은 절대 막지 않는다.
 *           cap 은 "AI/OCR 보조 기능"만 멈춘다.
 */

// env 는 호출 시점에 읽는다 (테스트·런타임 toggle 가능). 미설정/NaN/음수 → 0(가드 OFF).
function readCap(name: string): number {
  const raw = process.env[name];
  if (!raw) return 0;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export type CapReason =
  | "ai_daily_cost"
  | "ocr_daily_cost"
  | "ocr_daily_calls";

export interface CapCheck {
  blocked: boolean;
  reason?: CapReason;
  capUsd?: number;
  capCalls?: number;
  currentUsd?: number;
  currentCalls?: number;
}

/**
 * AI cap 체크. AI 채점·초안 합산 일일 비용이 cap 도달했는지.
 *   - cap 미설정 → 항상 통과.
 *   - 조회 실패 → fail-open (운영 마비 방지). 콘솔 경고.
 *   - 도달 → blocked=true + reason 반환. 호출 측이 skipped_cap 기록 + UI 안내.
 */
export async function checkAiCap(): Promise<CapCheck> {
  const aiCostCap = readCap("GS_AI_DAILY_COST_USD_CAP");
  if (aiCostCap <= 0) return { blocked: false };
  const totals = await getTodayTotals();
  if (totals.aiCostUsd >= aiCostCap) {
    return {
      blocked: true,
      reason: "ai_daily_cost",
      capUsd: aiCostCap,
      currentUsd: totals.aiCostUsd,
    };
  }
  return { blocked: false };
}

/**
 * OCR cap 체크. 비용 cap + 호출수 cap 둘 다 검사 (Vision 무료 1000/월 등 대비).
 */
export async function checkOcrCap(): Promise<CapCheck> {
  const ocrCostCap = readCap("GS_OCR_DAILY_COST_USD_CAP");
  const ocrCallCap = readCap("GS_OCR_DAILY_CALL_CAP");
  if (ocrCostCap <= 0 && ocrCallCap <= 0) return { blocked: false };
  const totals = await getTodayTotals();
  if (ocrCostCap > 0 && totals.ocrCostUsd >= ocrCostCap) {
    return {
      blocked: true,
      reason: "ocr_daily_cost",
      capUsd: ocrCostCap,
      currentUsd: totals.ocrCostUsd,
    };
  }
  if (ocrCallCap > 0 && totals.ocrCalls >= ocrCallCap) {
    return {
      blocked: true,
      reason: "ocr_daily_calls",
      capCalls: ocrCallCap,
      currentCalls: totals.ocrCalls,
    };
  }
  return { blocked: false };
}

/** 사용자 안내 문구 (route 가 응답 메시지로 전달). */
export function capBlockedMessage(check: CapCheck): string {
  switch (check.reason) {
    case "ai_daily_cost":
      return "AI 채점 초안 일일 한도에 도달했습니다. 강사 직접 채점을 이용해 주세요.";
    case "ocr_daily_cost":
    case "ocr_daily_calls":
      return "OCR 일일 한도에 도달했습니다. 답안지 페이지는 정상 저장되며, 글자 추출은 잠시 보류됩니다.";
    default:
      return "현재 보조 기능이 일시 제한됩니다.";
  }
}

/**
 * cap 도달 알림 — 같은 (date, reason) 조합은 하루 1회만 발송.
 *   - gs_cap_alerts 에 (date, reason) INSERT 시도. 충돌(23505)이면 이미 알림 발송됨 → skip.
 *   - 성공 시 staff role 전원에게 in-app 알림 fanout.
 *   - 실패는 운영 마비 사유 아님 — fail-open.
 */
export async function notifyCapReachedOnce(check: CapCheck): Promise<void> {
  if (!check.blocked || !check.reason) return;
  const today = kstToday();
  const { error: insErr } = await adminClient
    .from("gs_cap_alerts")
    .insert({ date: today, reason: check.reason });
  if (insErr) {
    // 23505 = duplicate. 정상 — 같은 날 이미 알림 발송됨.
    if (insErr.code !== "23505") {
      console.warn("[gs/usage-tracker] notifyCapReachedOnce insert:", insErr.message);
    }
    return;
  }
  // staff fanout — admin + manager + instructor.
  const { data: staff } = await adminClient
    .from("profiles")
    .select("profile_id")
    .in("role", ["instructor", "manager", "admin"]);
  if (!staff || staff.length === 0) return;
  const title =
    check.reason === "ai_daily_cost"
      ? "GS AI 채점 일일 한도 도달"
      : "GS OCR 일일 한도 도달";
  const body =
    check.reason === "ai_daily_cost"
      ? `오늘 AI 비용이 cap($${check.capUsd?.toFixed(2)}) 에 도달했습니다. 신규 AI 초안 호출은 차단됩니다 (강사 직접 채점은 정상).`
      : check.reason === "ocr_daily_cost"
        ? `오늘 OCR 비용이 cap($${check.capUsd?.toFixed(2)}) 에 도달했습니다. 답안지 페이지 저장은 정상이며 OCR 만 보류됩니다.`
        : `오늘 OCR 호출 수가 cap(${check.capCalls}) 에 도달했습니다. 답안지 페이지 저장은 정상이며 OCR 만 보류됩니다.`;
  const rows = staff.map((s) => ({
    recipient_id: s.profile_id,
    kind: "gs_cap_reached" as const,
    entity_type: "gs_cap",
    entity_id: `${today}:${check.reason}`,
    title,
    body,
    href: "/admin/gs/usage",
    payload: {
      reason: check.reason,
      cap_usd: check.capUsd ?? null,
      cap_calls: check.capCalls ?? null,
      current_usd: check.currentUsd ?? null,
      current_calls: check.currentCalls ?? null,
    },
  }));
  const { error: notifyErr } = await adminClient
    .from("user_notifications")
    .insert(rows);
  if (notifyErr) {
    console.warn("[gs/usage-tracker] cap alert fanout:", notifyErr.message);
  }
}

export interface TodayTotals {
  aiCostUsd: number;
  aiCalls: number;
  ocrCostUsd: number;
  ocrCalls: number;
  ocrPages: number;
}

/**
 * 오늘(KST) 전역 합계 — cap 게이트가 호출.
 * `gs_ai_usage_today_totals()` RPC 사용 (인덱스 + service_role 우회 X — 합계만이라 RLS 안전).
 */
export async function getTodayTotals(): Promise<TodayTotals> {
  const { data, error } = await adminClient.rpc("gs_ai_usage_today_totals");
  if (error) {
    console.warn("[gs/usage-tracker] getTodayTotals failed:", error.message);
    return {
      aiCostUsd: 0,
      aiCalls: 0,
      ocrCostUsd: 0,
      ocrCalls: 0,
      ocrPages: 0,
    };
  }
  const row = (data ?? [])[0];
  return {
    aiCostUsd: Number(row?.ai_cost_usd ?? 0),
    aiCalls: Number(row?.ai_calls ?? 0),
    ocrCostUsd: Number(row?.ocr_cost_usd ?? 0),
    ocrCalls: Number(row?.ocr_calls ?? 0),
    ocrPages: Number(row?.ocr_pages ?? 0),
  };
}
