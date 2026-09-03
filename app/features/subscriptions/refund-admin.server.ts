// feat-11-011 — 운영자 결제 환불(취소).
//
// 학생 셀프 해지(queries.server.ts `cancelSubscription`)는 **결제 후 3일 이내**만 전액
// 환불되고, 그 뒤에는 학생도 운영자도 돈을 돌려줄 화면이 없었다. 이 파일이 그 구멍을
// 메운다 — 기간 제한 없이 운영자가 환불한다.
//
// ★돈이 나가는 조작이라 순서가 중요하다: **PG 취소가 성공한 뒤에만** 환불로 기록한다.
//   반대로 하면 DB 는 환불인데 돈은 그대로인 상태가 남는다.
// ★사유는 필수이며 subscription_admin_logs 에 남는다(지급·연장·취소와 같은 원장).

import adminClient from "~/core/lib/supa-admin-client.server";
import { markOrderRefundedAndRevoke } from "~/features/orders/orders.server";

const TOSS_API = "https://api.tosspayments.com/v1";

export type RefundPaymentResult =
  | {
      ok: true;
      refundedKrw: number;
      /** 결제키가 없어 PG 취소 없이 기록만 남긴 경우(무통장·무료·수동) — 송금은 사람이 한다. */
      manual: boolean;
      revokedSubscriptions: number;
      revokedOrder: boolean;
    }
  | { ok: false; error: string };

/** 토스 전액 취소. 결제키가 있는 건에만 호출한다. */
async function cancelTossPayment(
  paymentKey: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) return { ok: false, error: "TOSS_SECRET_KEY 환경변수가 설정돼 있지 않습니다" };
  const basic = Buffer.from(`${secret}:`).toString("base64");
  try {
    const res = await fetch(`${TOSS_API}/payments/${paymentKey}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cancelReason: reason }),
    });
    const payload = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof payload.message === "string"
          ? payload.message
          : `토스 취소 실패 (HTTP ${res.status})`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `토스 취소 API 호출 실패: ${msg}` };
  }
}

/**
 * 결제 1건 전액 환불 + 그 결제로 지급된 것 회수.
 *
 * 부분 환불은 여기서 다루지 않는다 — 강의·도서는 `/admin/orders` 의 항목별 부분환불이
 * 이미 담당하고, 구독은 부분 금액을 표현할 상태값이 없다.
 */
export async function refundPaymentAdmin(input: {
  paymentId: string;
  reason: string;
  actorId: string;
}): Promise<RefundPaymentResult> {
  const reason = input.reason.trim();
  if (reason.length < 2) return { ok: false, error: "환불 사유를 입력해 주세요" };

  const { data: pay, error } = await adminClient
    .from("payments")
    .select("payment_id, user_id, amount_krw, status, toss_payment_key, refunded_at, order_id")
    .eq("payment_id", input.paymentId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!pay) return { ok: false, error: "결제 내역을 찾을 수 없습니다" };
  if (pay.status === "refunded" || pay.refunded_at)
    return { ok: false, error: "이미 환불된 결제입니다" };
  if (pay.status !== "completed")
    return { ok: false, error: "결제 완료 건만 환불할 수 있습니다" };

  const nowIso = new Date().toISOString();

  // 1) PG 취소 — 결제키가 없으면(무통장·무료·수동 지급) 기록만 남긴다.
  const manual = !pay.toss_payment_key;
  if (pay.toss_payment_key) {
    const cancelled = await cancelTossPayment(pay.toss_payment_key, reason);
    if (!cancelled.ok) return cancelled;
  }

  // 2) 결제 기록 — PG 취소 성공 뒤에만.
  const { error: upErr } = await adminClient
    .from("payments")
    .update({
      status: "refunded",
      refunded_at: nowIso,
      refund_amount_krw: pay.amount_krw,
      refund_reason: reason,
    })
    .eq("payment_id", pay.payment_id);
  if (upErr) {
    // ★환불은 실행됐다. 기록만 실패했으므로 운영자가 알아야 한다.
    return {
      ok: false,
      error: `환불은 처리됐으나 기록에 실패했습니다 — 개발자 확인 필요: ${upErr.message}`,
    };
  }

  // 3) 이 결제로 지급된 구독 회수(학습 플랫폼).
  const { data: subs } = await adminClient
    .from("user_subscriptions")
    .select("subscription_id, status")
    .eq("payment_id", pay.payment_id);
  let revokedSubscriptions = 0;
  for (const sub of subs ?? []) {
    if (sub.status === "cancelled") continue;
    const { error: subErr } = await adminClient
      .from("user_subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        auto_renew: false,
        updated_at: nowIso,
      })
      .eq("subscription_id", sub.subscription_id);
    if (!subErr) revokedSubscriptions += 1;
  }

  // 4) 연결 주문 회수(강의 수강권·도서 배송 등) — 주문 경유 결제만 해당.
  const revokedOrder = Boolean(pay.order_id);
  if (pay.order_id) await markOrderRefundedAndRevoke(pay.order_id, reason);

  // 5) 감사 — 지급·연장·취소와 같은 원장에 남긴다.
  await adminClient.from("subscription_admin_logs").insert({
    subscription_id: subs?.[0]?.subscription_id ?? null,
    user_id: pay.user_id,
    actor_id: input.actorId,
    action: "refund",
    detail: {
      paymentId: pay.payment_id,
      amountKrw: pay.amount_krw,
      manual,
      revokedSubscriptions,
      orderId: pay.order_id ?? null,
    },
    note: reason,
  });

  return {
    ok: true,
    refundedKrw: pay.amount_krw,
    manual,
    revokedSubscriptions,
    revokedOrder,
  };
}
