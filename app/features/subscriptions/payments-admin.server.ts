// feat-8-029 — 운영자 주문결제 관리: 기간 내 결제/환불 조회 + 일/주/월 집계.
// 호출부에서 권한(manager+) 검증 필수. admin client(service_role) — RLS 우회.

import adminClient from "~/core/lib/supa-admin-client.server";

import type { PaymentStatus } from "./labels";

export interface AdminPaymentRow {
  paymentId: string;
  userId: string;
  userName: string | null;
  // feat-11 장바구니 주문 결제는 단일 plan 없음 → null.
  planId: string | null;
  planCode: string;
  planName: string;
  amountKrw: number;
  status: PaymentStatus;
  tossOrderId: string | null;
  paymentKey: string | null;
  method: string | null;
  failureReason: string | null;
  subjectCode: string | null;
  discountId: string | null;
  refundedAt: string | null;
  refundAmountKrw: number | null;
  refundReason: string | null;
  createdAt: string;
}

export type StatsGranularity = "day" | "week" | "month";

export interface PaymentStatsBucket {
  key: string; // "2026-07-04" | "2026-06-29 주" | "2026-07"
  paidCount: number;
  paidKrw: number;
  refundCount: number;
  refundKrw: number;
  netKrw: number;
}

export interface PaymentStatsSummary {
  paidCount: number;
  paidKrw: number;
  refundCount: number;
  refundKrw: number;
  netKrw: number;
  failedCount: number;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 버킷 키. granularity 별 "YYYY-MM-DD" / 주 시작(월요일) 날짜 / "YYYY-MM". */
export function kstBucketKey(iso: string, g: StatsGranularity): string {
  const shifted = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  if (g === "month") return shifted.toISOString().slice(0, 7);
  if (g === "day") return shifted.toISOString().slice(0, 10);
  // week — 월요일 시작.
  const dow = (shifted.getUTCDay() + 6) % 7;
  const monday = new Date(shifted.getTime() - dow * 24 * 60 * 60 * 1000);
  return monday.toISOString().slice(0, 10);
}

/** 비-토스(주문 기반) 결제수단 라벨. 토스 승인건은 toss_response.method 를 우선 사용. */
const ORDER_METHOD_LABEL: Record<string, string> = {
  bank_transfer: "무통장",
  free: "무료",
  manual: "수동",
  toss: "토스",
};

function resolveMethod(tossResponse: unknown, orderMethod: string | null): string | null {
  if (tossResponse && typeof tossResponse === "object" && "method" in tossResponse) {
    const m = (tossResponse as { method?: unknown }).method;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  if (orderMethod) return ORDER_METHOD_LABEL[orderMethod] ?? orderMethod;
  return null;
}

function rowToAdmin(r: {
  payment_id: string;
  user_id: string;
  plan_id: string | null;
  amount_krw: number;
  status: string;
  toss_order_id: string | null;
  toss_payment_key: string | null;
  toss_response: unknown;
  failure_reason: string | null;
  subject_code: string | null;
  discount_id: string | null;
  refunded_at: string | null;
  refund_amount_krw: number | null;
  refund_reason: string | null;
  created_at: string;
  subscription_plans: { code: string; name: string } | null;
  profiles: { name: string | null } | null;
  orders: { payment_method: string | null } | null;
}): AdminPaymentRow {
  return {
    paymentId: r.payment_id,
    userId: r.user_id,
    userName: r.profiles?.name ?? null,
    planId: r.plan_id,
    planCode: r.subscription_plans?.code ?? "",
    planName: r.subscription_plans?.name ?? "",
    amountKrw: r.amount_krw,
    status: r.status as PaymentStatus,
    tossOrderId: r.toss_order_id,
    paymentKey: r.toss_payment_key,
    method: resolveMethod(r.toss_response, r.orders?.payment_method ?? null),
    failureReason: r.failure_reason,
    subjectCode: r.subject_code,
    discountId: r.discount_id,
    refundedAt: r.refunded_at,
    refundAmountKrw: r.refund_amount_krw,
    refundReason: r.refund_reason,
    createdAt: r.created_at,
  };
}

const SELECT =
  "payment_id, user_id, plan_id, amount_krw, status, toss_order_id, toss_payment_key, toss_response, failure_reason, subject_code, discount_id, refunded_at, refund_amount_krw, refund_reason, created_at, subscription_plans(code, name), profiles(name), orders(payment_method)";

/**
 * 기간 내 결제(created_at 기준) ∪ 기간 내 환불(refunded_at 기준) — 두 축을 합쳐 반환.
 * (기간 밖 결제가 기간 내 환불된 건도 환불 통계에 포함돼야 함.)
 */
export async function listAdminPayments(range: {
  fromIso: string | null;
  toIso: string | null;
  planId?: string;
}): Promise<AdminPaymentRow[]> {
  const build = (col: "created_at" | "refunded_at") => {
    let q = adminClient.from("payments").select(SELECT).limit(5000);
    if (range.fromIso) q = q.gte(col, range.fromIso);
    if (range.toIso) q = q.lt(col, range.toIso);
    if (col === "refunded_at") q = q.not("refunded_at", "is", null);
    if (range.planId) q = q.eq("plan_id", range.planId);
    return q.order("created_at", { ascending: false });
  };
  const [created, refunded] = await Promise.all([
    build("created_at"),
    build("refunded_at"),
  ]);
  if (created.error) throw created.error;
  if (refunded.error) throw refunded.error;
  const byId = new Map<string, AdminPaymentRow>();
  for (const r of [...(created.data ?? []), ...(refunded.data ?? [])]) {
    if (!byId.has(r.payment_id)) byId.set(r.payment_id, rowToAdmin(r));
  }
  return [...byId.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

function inRange(
  iso: string | null,
  fromIso: string | null,
  toIso: string | null,
): boolean {
  if (!iso) return false;
  if (fromIso && iso < fromIso) return false;
  if (toIso && iso >= toIso) return false;
  return true;
}

/** 결제=created_at 기준(completed·refunded 승인액), 환불=refunded_at 기준. 버킷은 KST. */
export function buildPaymentStats(
  rows: AdminPaymentRow[],
  granularity: StatsGranularity,
  fromIso: string | null,
  toIso: string | null,
): { buckets: PaymentStatsBucket[]; summary: PaymentStatsSummary } {
  const buckets = new Map<string, PaymentStatsBucket>();
  const at = (key: string): PaymentStatsBucket => {
    let b = buckets.get(key);
    if (!b) {
      b = { key, paidCount: 0, paidKrw: 0, refundCount: 0, refundKrw: 0, netKrw: 0 };
      buckets.set(key, b);
    }
    return b;
  };
  const summary: PaymentStatsSummary = {
    paidCount: 0,
    paidKrw: 0,
    refundCount: 0,
    refundKrw: 0,
    netKrw: 0,
    failedCount: 0,
  };
  for (const r of rows) {
    const paidInRange =
      (r.status === "completed" || r.status === "refunded") &&
      inRange(r.createdAt, fromIso, toIso);
    if (paidInRange) {
      const b = at(kstBucketKey(r.createdAt, granularity));
      b.paidCount += 1;
      b.paidKrw += r.amountKrw;
      summary.paidCount += 1;
      summary.paidKrw += r.amountKrw;
    }
    if (r.status === "failed" && inRange(r.createdAt, fromIso, toIso)) {
      summary.failedCount += 1;
    }
    if (r.refundedAt && inRange(r.refundedAt, fromIso, toIso)) {
      const amount = r.refundAmountKrw ?? r.amountKrw;
      const b = at(kstBucketKey(r.refundedAt, granularity));
      b.refundCount += 1;
      b.refundKrw += amount;
      summary.refundCount += 1;
      summary.refundKrw += amount;
    }
  }
  for (const b of buckets.values()) b.netKrw = b.paidKrw - b.refundKrw;
  summary.netKrw = summary.paidKrw - summary.refundKrw;
  return {
    buckets: [...buckets.values()].sort((a, b) => b.key.localeCompare(a.key)),
    summary,
  };
}
