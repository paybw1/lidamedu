// 토스 웹훅 동기화 — 가상계좌 입금·결제취소·환불을 우리 DB(payments·구독)에 반영.
//
// ★보안 모델: 토스 웹훅은 서명이 없으므로 **페이로드를 신뢰하지 않는다**.
//   웹훅은 "이 주문을 재동기화하라"는 신호일 뿐 — orderId 로 우리 결제 행을 찾고,
//   토스 조회 API(GET /v1/payments/orders/{orderId})를 시크릿 키로 직접 호출해
//   권위 상태를 받아 반영한다. 위조 웹훅 = 무해한 재동기화 트리거.
//
// 멱등: 모든 전이는 현재 상태를 가드로 걸어 재전송에 안전하다.
// 처리 결과는 payment_webhook_events 에 기록(운영 진단).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  markOrderPaidAndFulfill,
  markOrderRefundedAndRevoke,
} from "~/features/orders/orders.server";
import { incrementDiscountUse } from "~/features/subscriptions/discounts.server";
import { upsertPaidSubscription } from "~/features/subscriptions/queries.server";

export interface WebhookSyncResult {
  /** processed=반영 / ignored=무관·변경없음 / error=재시도 대상(토스 API 실패 등). */
  outcome: "processed" | "ignored" | "error";
  detail: string;
}

interface TossCancel {
  cancelAmount?: number;
  cancelReason?: string;
  canceledAt?: string;
}

interface TossPayment {
  paymentKey?: string;
  orderId?: string;
  status?: string;
  totalAmount?: number;
  cancels?: TossCancel[] | null;
}

async function fetchTossPaymentByOrderId(
  orderId: string,
): Promise<{ ok: true; payment: TossPayment } | { ok: false; error: string }> {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) return { ok: false, error: "TOSS_SECRET_KEY 환경변수 미설정" };
  const basic = Buffer.from(`${secret}:`).toString("base64");
  try {
    const res = await fetch(
      `https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`,
      { headers: { Authorization: `Basic ${basic}` } },
    );
    const payload = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof payload?.message === "string"
          ? payload.message
          : `HTTP ${res.status}`;
      return { ok: false, error: `토스 조회 실패: ${msg}` };
    }
    return { ok: true, payment: payload as TossPayment };
  } catch (e) {
    return {
      ok: false,
      error: `토스 조회 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function logEvent(
  admin: SupabaseClient<Database>,
  input: {
    eventType: string;
    tossOrderId: string | null;
    paymentId: string | null;
    outcome: WebhookSyncResult["outcome"];
    detail: string;
    raw: unknown;
  },
): Promise<void> {
  try {
    await admin.from("payment_webhook_events").insert({
      event_type: input.eventType,
      toss_order_id: input.tossOrderId,
      payment_id: input.paymentId,
      outcome: input.outcome,
      detail: input.detail,
      raw: input.raw as never,
    });
  } catch {
    // 로그 실패가 본처리를 막지 않는다.
  }
}

/** 연결된 활성 구독 취소(전액 환불 시). cancelSubscription 의 환불 분기와 동일 형태. */
async function cancelLinkedSubscription(
  admin: SupabaseClient<Database>,
  paymentId: string,
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("user_subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      auto_renew: false,
      updated_at: nowIso,
    })
    .eq("payment_id", paymentId)
    .eq("status", "active")
    .select("subscription_id");
  return (data ?? []).length > 0;
}

function sumCancels(payment: TossPayment): {
  amount: number | null;
  reason: string | null;
  lastAt: string | null;
} {
  const cancels = Array.isArray(payment.cancels) ? payment.cancels : [];
  if (cancels.length === 0) return { amount: null, reason: null, lastAt: null };
  let amount = 0;
  for (const c of cancels) amount += c.cancelAmount ?? 0;
  const last = cancels[cancels.length - 1];
  return {
    amount: amount > 0 ? amount : null,
    reason: last?.cancelReason ?? null,
    lastAt: last?.canceledAt ?? null,
  };
}

export async function syncPaymentFromToss(
  orderId: string,
  eventType: string,
  raw: unknown,
): Promise<WebhookSyncResult> {
  const admin = adminClient as SupabaseClient<Database>;

  // 1) 우리 주문인지 먼저 확인 — 아니면 토스 호출 없이 종료(스캔성 요청 무시).
  const { data: payRow, error: payErr } = await admin
    .from("payments")
    .select(
      "payment_id, user_id, plan_id, amount_krw, status, subject_code, discount_id, order_id, subscription_plans(duration_days, product_kind)",
    )
    .eq("toss_order_id", orderId)
    .maybeSingle();
  if (payErr) {
    const result: WebhookSyncResult = { outcome: "error", detail: payErr.message };
    await logEvent(admin, {
      eventType,
      tossOrderId: orderId,
      paymentId: null,
      ...result,
      raw,
    });
    return result;
  }
  if (!payRow) {
    const result: WebhookSyncResult = {
      outcome: "ignored",
      detail: "해당 주문 없음",
    };
    await logEvent(admin, {
      eventType,
      tossOrderId: orderId,
      paymentId: null,
      ...result,
      raw,
    });
    return result;
  }

  // 2) 토스 권위 상태 조회.
  const toss = await fetchTossPaymentByOrderId(orderId);
  if (!toss.ok) {
    const result: WebhookSyncResult = { outcome: "error", detail: toss.error };
    await logEvent(admin, {
      eventType,
      tossOrderId: orderId,
      paymentId: payRow.payment_id,
      ...result,
      raw,
    });
    return result;
  }
  const payment = toss.payment;
  const tossStatus = payment.status ?? "UNKNOWN";
  let result: WebhookSyncResult;

  switch (tossStatus) {
    case "DONE": {
      if (payRow.status === "completed" || payRow.status === "refunded") {
        result = { outcome: "ignored", detail: `이미 ${payRow.status}` };
        break;
      }
      // 금액 검증 — 불일치는 반영하지 않고 기록만(재시도 무의미라 ignored).
      if (payment.totalAmount !== payRow.amount_krw) {
        result = {
          outcome: "ignored",
          detail: `금액 불일치 (toss=${payment.totalAmount} db=${payRow.amount_krw}) — 수동 확인 필요`,
        };
        break;
      }
      await admin
        .from("payments")
        .update({
          status: "completed",
          toss_payment_key: payment.paymentKey ?? null,
          toss_response: payment as never,
          failure_reason: null,
        })
        .eq("payment_id", payRow.payment_id);
      if (payRow.discount_id) await incrementDiscountUse(payRow.discount_id);
      // feat-11-004 4a — 연결 주문 paid 전이 + course/tpass 지급(멱등).
      if (payRow.order_id) await markOrderPaidAndFulfill(payRow.order_id);
      const kind = payRow.subscription_plans?.product_kind;
      if (kind === "course" || kind === "tpass") {
        result = { outcome: "processed", detail: "입금/결제 완료 → 수강권(enrollments) 지급" };
        break;
      }
      const up = await upsertPaidSubscription(admin, {
        userId: payRow.user_id,
        planId: payRow.plan_id,
        subjectCode: payRow.subject_code ?? null,
        durationDays: payRow.subscription_plans?.duration_days ?? 30,
        paymentId: payRow.payment_id,
      });
      result =
        "error" in up
          ? { outcome: "error", detail: `구독 반영 실패: ${up.error}` }
          : { outcome: "processed", detail: "입금/결제 완료 → 구독 활성화" };
      break;
    }

    case "CANCELED": {
      // 전액 취소 — 환불 마킹 + 연결 활성 구독 종료.
      const { amount, reason, lastAt } = sumCancels(payment);
      if (payRow.status === "refunded") {
        result = { outcome: "ignored", detail: "이미 refunded" };
        break;
      }
      if (payRow.status === "pending") {
        // 입금 전 취소(가상계좌 등) — 환불이 아니라 실패로 종결.
        await admin
          .from("payments")
          .update({
            status: "failed",
            failure_reason: reason ?? "토스 취소(입금 전)",
            toss_response: payment as never,
          })
          .eq("payment_id", payRow.payment_id);
        result = { outcome: "processed", detail: "입금 전 취소 → failed" };
        break;
      }
      await admin
        .from("payments")
        .update({
          status: "refunded",
          refunded_at: lastAt ?? new Date().toISOString(),
          refund_amount_krw: amount ?? payRow.amount_krw,
          refund_reason: reason ?? "토스 취소 웹훅",
          toss_response: payment as never,
        })
        .eq("payment_id", payRow.payment_id);
      const revoked = await cancelLinkedSubscription(admin, payRow.payment_id);
      // feat-11-004 4a — 연결 주문 환불 전이 + enrollments 회수.
      if (payRow.order_id) {
        await markOrderRefundedAndRevoke(payRow.order_id, reason ?? "토스 취소 웹훅");
      }
      result = {
        outcome: "processed",
        detail: `전액 취소 → refunded${revoked ? " + 구독 종료" : ""}`,
      };
      break;
    }

    case "PARTIAL_CANCELED": {
      // 부분 취소 — 환불액만 기록, 결제·구독은 유지(정산 환불차감이 집계).
      const { amount, reason, lastAt } = sumCancels(payment);
      await admin
        .from("payments")
        .update({
          refunded_at: lastAt ?? new Date().toISOString(),
          refund_amount_krw: amount,
          refund_reason: reason ?? "토스 부분취소 웹훅",
          toss_response: payment as never,
        })
        .eq("payment_id", payRow.payment_id);
      result = {
        outcome: "processed",
        detail: `부분 취소 기록 (${amount ?? "?"}원)`,
      };
      break;
    }

    case "ABORTED":
    case "EXPIRED": {
      // 승인 실패·가상계좌 입금 기한 만료.
      if (payRow.status !== "pending") {
        result = { outcome: "ignored", detail: `상태 ${payRow.status} — 변경 없음` };
        break;
      }
      await admin
        .from("payments")
        .update({
          status: "failed",
          failure_reason:
            tossStatus === "EXPIRED" ? "가상계좌 입금 기한 만료" : "결제 승인 실패",
          toss_response: payment as never,
        })
        .eq("payment_id", payRow.payment_id);
      result = { outcome: "processed", detail: `${tossStatus} → failed` };
      break;
    }

    case "WAITING_FOR_DEPOSIT": {
      // 가상계좌 발급 완료 — 키만 확보, pending 유지.
      await admin
        .from("payments")
        .update({
          toss_payment_key: payment.paymentKey ?? null,
          toss_response: payment as never,
        })
        .eq("payment_id", payRow.payment_id);
      result = { outcome: "processed", detail: "입금 대기(키 저장)" };
      break;
    }

    default:
      result = { outcome: "ignored", detail: `상태 ${tossStatus} — 처리 대상 아님` };
  }

  await logEvent(admin, {
    eventType,
    tossOrderId: orderId,
    paymentId: payRow.payment_id,
    ...result,
    raw,
  });
  return result;
}
