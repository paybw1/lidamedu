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
import { releasePointsForOrders } from "~/features/points/points-order.server";
import { incrementDiscountUse } from "~/features/subscriptions/discounts.server";
import { isLectureProductKind } from "~/features/subscriptions/labels";
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
  /** 토스가 취소 건마다 붙이는 거래번호 — 환불관리의 「토스 거래번호」(요청서 §6). */
  transactionKey?: string;
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

/** 연결된 활성 구독 취소(전액 환불 시). refund-admin.server 의 구독 회수와 같은 형태. */
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
  txnNo: string | null;
} {
  const cancels = Array.isArray(payment.cancels) ? payment.cancels : [];
  if (cancels.length === 0)
    return { amount: null, reason: null, lastAt: null, txnNo: null };
  let amount = 0;
  for (const c of cancels) amount += c.cancelAmount ?? 0;
  const last = cancels[cancels.length - 1];
  return {
    amount: amount > 0 ? amount : null,
    reason: last?.cancelReason ?? null,
    lastAt: last?.canceledAt ?? null,
    txnNo: last?.transactionKey ?? payment.paymentKey ?? null,
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
      // feat-11 장바구니 — plan_id null = 주문(order_items)으로만 지급되는 카트 주문. 구독 스킵.
      if (!payRow.plan_id) {
        result = {
          outcome: "processed",
          detail: "입금/결제 완료 → 주문 지급(장바구니)",
        };
        break;
      }
      const kind = payRow.subscription_plans?.product_kind;
      if (kind && isLectureProductKind(kind)) {
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
      const { amount, reason, lastAt, txnNo } = sumCancels(payment);
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
      // ★학습 구독 해지는 그대로 둔다 — 강의 플랫폼 주문에는 user_subscriptions 가 없어
      //   no-op 이고, 학습 플랫폼은 **관리자 환불**(refund-admin.server)이 여기로 들어온다.
      //   학생 셀프 환불해지는 feat-11-013 D10 으로 없어졌다.
      const revoked = await cancelLinkedSubscription(admin, payRow.payment_id);

      // ★★열린 환불건이 있으면 **웹훅은 비켜선다**(feat-11-013 P6-b).
      //   요청서 §5 의 운영은 관리자가 토스 상점관리자에서 직접 취소하는 것이라, 관리자가
      //   리담으로 돌아오기 **전에** 이 웹훅이 도착한다. 여기서 항목을 환불로 찍고 수강권까지
      //   회수해 버리면, 확정 커밋이 할 일을 다른 행위자가 절반 해 놓은 상태가 된다 —
      //   그 사이 같은 주문에 두 번째 환불건이 열리면 **접수도 안 된 항목이 이미 환불됨**이다.
      //   대신 §6 의 네 값 중 셋을 자동으로 채워 주고 PG 취소완료로 넘긴다.
      let taken = false;
      if (payRow.order_id) {
        const { takeOverPgCancelIfOpenRefund } = await import(
          "~/features/refunds/refunds.server"
        );
        const r = await takeOverPgCancelIfOpenRefund({
          orderId: payRow.order_id,
          cancelKrw: amount ?? payRow.amount_krw,
          cancelledAt: lastAt,
          transactionNo: txnNo,
          kind: "full",
        });
        taken = r.taken;
        // feat-11-004 4a — 환불관리가 맡지 않은 취소만 여기서 주문·지급물까지 정리한다.
        if (!taken) {
          await markOrderRefundedAndRevoke(payRow.order_id, reason ?? "토스 취소 웹훅");
        }
      }
      result = {
        outcome: "processed",
        detail: `전액 취소 → refunded${revoked ? " + 구독 종료" : ""}${
          taken ? " · 환불관리 건에 취소정보 입력(회수는 확정 시)" : ""
        }`,
      };
      break;
    }

    case "PARTIAL_CANCELED": {
      // 부분 취소 — 환불액 기록 + **항목 반영 여부 대조**(feat-11-013 P0-2).
      //
      // ★토스는 **금액만** 알려 준다. 어느 주문항목이 취소됐는지는 알 수 없으므로
      //   여기서 수강권을 자동 회수하면 **추측으로 학생 것을 뺏는 일**이 된다.
      //   그래서 회수는 하지 않되, **조용히 어긋나게 두지도 않는다.**
      // ★종전에는 payments 만 갱신하고 끝이라, 관리자가 토스 상점관리자에서 부분취소하면
      //   **돈은 돌려줬는데 수강권이 살아 있고 정산에도 안 잡히는** 상태가 말없이 남았다.
      //   요청서(260914)가 바로 그 운영을 기본으로 삼으므로 신호가 반드시 필요하다.
      // ★환불관리(P6)에 **열린 건이 있으면 그쪽이 주인**이다 — 취소정보만 옮겨 적고 빠진다.
      const { amount, reason, lastAt, txnNo } = sumCancels(payment);
      await admin
        .from("payments")
        .update({
          refunded_at: lastAt ?? new Date().toISOString(),
          refund_amount_krw: amount,
          refund_reason: reason ?? "토스 부분취소 웹훅",
          toss_response: payment as never,
        })
        .eq("payment_id", payRow.payment_id);

      let takenPartial = false;
      if (payRow.order_id) {
        const { takeOverPgCancelIfOpenRefund } = await import(
          "~/features/refunds/refunds.server"
        );
        const r = await takeOverPgCancelIfOpenRefund({
          orderId: payRow.order_id,
          cancelKrw: amount,
          cancelledAt: lastAt,
          transactionNo: txnNo,
          kind: "partial",
        });
        takenPartial = r.taken;
      }

      let unmatched = 0;
      // ★환불관리가 맡은 건은 「미반영」이 아니다 — 확정 커밋이 항목을 찍는다.
      //   그때도 경고를 띄우면 정상 운영마다 CS 원장에 잡음이 쌓인다.
      if (!takenPartial && payRow.order_id && (amount ?? 0) > 0) {
        const { data: items } = await admin
          .from("order_items")
          .select("paid_amount_krw, refund_amount_krw")
          .eq("order_id", payRow.order_id)
          .not("refunded_at", "is", null);
        // ★평면을 맞춘다 — 토스가 알려 주는 취소액은 **실제 환급액**(할인·포인트 차감 후)인데
        //   order_items.refund_amount_krw 는 **정가**다(정산이 그 평면을 읽는다, P6-0).
        //   정가와 순액을 빼면 언제나 음수라 max(0, …) 에 먹혀 **경고가 영영 안 뜬다** —
        //   하필 할인·포인트 주문에서만 죽는, 가장 필요한 자리에서 죽는 침묵이다.
        //   그래서 결제 귀속액(P1 스냅샷)으로 비교한다. 스냅샷 이전 주문은 할인이 없어
        //   정가 == 결제액이므로 refund_amount_krw 로 떨어져도 값이 같다.
        const itemRefunded = (items ?? []).reduce(
          (sum, r) => sum + (r.paid_amount_krw ?? r.refund_amount_krw ?? 0),
          0,
        );
        unmatched = Math.max(0, (amount ?? 0) - itemRefunded);
        if (unmatched > 0) {
          // ★회원 기준 CS 원장에 남긴다 — 운영자가 「이 학생의 무엇을 회수해야 하는지」를
          //   찾아갈 수 있어야 한다.
          console.error(
            `[webhook] 부분취소 ${amount}원 중 ${unmatched}원이 주문항목에 반영되지 않았습니다 (order ${payRow.order_id}). 환불관리에서 대상 항목을 지정해야 합니다.`,
          );
          try {
            const { data: ord } = await admin
              .from("orders")
              .select("user_id")
              .eq("order_id", payRow.order_id)
              .maybeSingle();
            if (ord) {
              await admin.from("cs_actions").insert({
                user_id: ord.user_id,
                actor_id: null,
                kind: "refund_assist",
                ref_table: "payments",
                ref_id: payRow.payment_id,
                note: `★토스 부분취소 ${amount}원 중 ${unmatched}원이 주문항목에 미반영. 수강권·재고 회수가 필요한지 확인해 주세요.`,
              });
            }
          } catch (e) {
            console.error("[webhook] 부분취소 미반영 기록 실패:", e);
          }
        }
      }
      result = {
        outcome: "processed",
        detail: `부분 취소 기록 (${amount ?? "?"}원)${unmatched > 0 ? ` — ★${unmatched}원 항목 미반영` : ""}`,
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
      // ★결제가 죽었으니 주문도 접고 포인트 예약을 푼다(feat-11-013 D15-b).
      //   ★넘기는 것은 **우리 order_id**(payRow.order_id)다 — 웹훅의 orderId 는
      //   토스 쪽 `lidam-<uuid>` 라 그걸 넘기면 아무것도 못 찾는다.
      //   ★`.select()` 로 실제 전이분만 받아 쓴다. 이미 결제된 주문에 반환을 걸면
      //   돈은 받고 포인트도 돌려주는 상태가 된다(RPC 의 status 가드가 2차 방어).
      if (payRow.order_id) {
        const { data: moved } = await admin
          .from("orders")
          .update({ status: "cancelled" })
          .eq("order_id", payRow.order_id)
          .in("status", ["draft", "attempted", "pending_payment"])
          .select("order_id");
        await releasePointsForOrders(
          (moved ?? []).map((o) => o.order_id),
          tossStatus === "EXPIRED" ? "입금 기한 만료 — 포인트 반환" : "결제 실패 — 포인트 반환",
        );
      }
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
