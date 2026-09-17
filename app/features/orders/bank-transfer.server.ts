// feat-11-004 4b — 무통장 입금 (설계 §3.8).
// 흐름: 신청(주문 pending_deposit + bank_transfers) → 관리자 입금 확인 → paid 전이·지급.
// 기한 초과 미입금 = 주문 cancelled (관리자 화면 lazy + cron 이중 안전망).

import adminClient from "~/core/lib/supa-admin-client.server";
import type { CartOrderItem } from "~/features/orders/orders.server";
import {
  createCartOrder,
  createSinglePlanOrder,
  markOrderPaidAndFulfill,
} from "~/features/orders/orders.server";
import type { ShippingAddress } from "~/features/orders/lib/shipping-address";

export const DEPOSIT_WINDOW_HOURS = 72;

/**
 * 이미 만들어진 주문에 **입금 대기**를 붙인다 — bank_transfers 행 + pending_deposit 전이.
 *
 * ★두 신청 경로(단일 플랜 / 장바구니)에서 **똑같은** 두 쓰기다. DRY 게이트 통과 —
 *   같은 의미(입금 대기 붙이기) · 같은 소유자(무통장 도메인) · 같은 변경 축(기한·컬럼).
 *   반면 **주문을 만드는 일**은 축이 다르므로(항목 해석·쿠폰·배송비) 합치지 않는다.
 */
async function attachDeposit(input: {
  orderId: string;
  amountKrw: number;
  depositorName: string;
}): Promise<string> {
  const expiresAt = new Date(
    Date.now() + DEPOSIT_WINDOW_HOURS * 3600_000,
  ).toISOString();
  const [{ error: btErr }, { error: oErr }] = await Promise.all([
    adminClient.from("bank_transfers").insert({
      order_id: input.orderId,
      depositor_name: input.depositorName,
      expected_amount_krw: input.amountKrw,
      expires_at: expiresAt,
    }),
    adminClient
      .from("orders")
      .update({ status: "pending_deposit" })
      .eq("order_id", input.orderId),
  ]);
  if (btErr) throw btErr;
  if (oErr) throw oErr;
  return expiresAt;
}

/** 무통장 주문 신청(단일 플랜) — 기존 플랜 단건 체크아웃·관리자 대리 생성 공용. */
export async function createBankTransferOrder(input: {
  userId: string;
  planId: string;
  subjectCode?: string | null;
  amountKrw: number;
  discountId?: string | null;
  depositorName: string;
}): Promise<{ orderId: string; expiresAt: string }> {
  const order = await createSinglePlanOrder({
    userId: input.userId,
    planId: input.planId,
    subjectCode: input.subjectCode ?? null,
    amountKrw: input.amountKrw,
    discountId: input.discountId ?? null,
    paymentMethod: "bank_transfer",
  });
  const expiresAt = await attachDeposit({
    orderId: order.orderId,
    amountKrw: input.amountKrw,
    depositorName: input.depositorName,
  });
  return { orderId: order.orderId, expiresAt };
}

/**
 * 무통장 주문 신청(장바구니) — 강의·도서 혼합 (feat-11-012 P5-e).
 *
 * ★종이책이 무통장으로 팔리려면 이 경로가 있어야 한다. 종전에는 무통장이 **단일 플랜
 *   전용**이라(createSinglePlanOrder) 장바구니로 담는 도서는 무통장을 쓸 수 없었다.
 * ★지급 쪽은 손댈 것이 없다 — markOrderPaidAndFulfill 이 이미 혼합 장바구니를
 *   처리하고(plan→수강권, book→배송), grantSubscriptionForBankOrder 는 plan 항목만
 *   훑으므로 도서만 든 주문에서 저절로 no-op 이다.
 */
export async function createBankTransferCartOrder(input: {
  userId: string;
  items: CartOrderItem[];
  shippingFeeKrw?: number;
  couponId?: string | null;
  couponDiscountKrw?: number;
  shippingAddress?: ShippingAddress | null;
  depositorName: string;
}): Promise<{ orderId: string; amountKrw: number; expiresAt: string }> {
  const order = await createCartOrder({
    userId: input.userId,
    items: input.items,
    shippingFeeKrw: input.shippingFeeKrw,
    couponId: input.couponId ?? null,
    couponDiscountKrw: input.couponDiscountKrw,
    paymentMethod: "bank_transfer",
    shippingAddress: input.shippingAddress ?? null,
  });
  const expiresAt = await attachDeposit({
    orderId: order.orderId,
    // ★기대 입금액은 **주문 총액**이다(배송비·쿠폰 반영 뒤). 상품가로 적으면
    //   배송비가 붙은 만큼 입금액이 달라 운영에서 매번 손으로 맞춰야 한다.
    amountKrw: order.totalKrw,
    depositorName: input.depositorName,
  });
  return { orderId: order.orderId, amountKrw: order.totalKrw, expiresAt };
}

/** 관리자 입금 확인 — deposited_at 기록 후 주문 paid 전이 + 지급. */
export async function confirmBankTransfer(input: {
  transferId: string;
  actorId: string;
  memo?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: transfer } = await adminClient
    .from("bank_transfers")
    .select("transfer_id, order_id, deposited_at")
    .eq("transfer_id", input.transferId)
    .maybeSingle();
  if (!transfer) return { ok: false, error: "무통장 신청을 찾을 수 없습니다." };
  if (transfer.deposited_at) return { ok: false, error: "이미 입금 확인된 건입니다." };
  // ★deposited_at 을 찍기 **전에** 주문이 아직 입금 대기인지 본다 — 그 사이 취소·만료된 주문에
  //   입금 확인을 찍으면 markOrderPaidAndFulfill 의 paid 전이는 0행인데 지급은 계속 진행돼
  //   「돈 받은 표시 + 주문은 취소 + 수강권 지급」이 된다. paid 전이를 여기서 먼저 하지 않는
  //   이유: markOrderPaidAndFulfill 이 「첫 전이」를 status !== paid 로 판정해 결제완료 포인트를
  //   주므로, 미리 paid 로 옮기면 무통장 주문 전부가 포인트를 못 받는다.
  const { data: order } = await adminClient
    .from("orders")
    .select("status")
    .eq("order_id", transfer.order_id)
    .maybeSingle();
  if (order?.status !== "pending_deposit") {
    return {
      ok: false,
      error:
        "주문이 입금 대기 상태가 아니어서 입금 확인을 할 수 없습니다. 취소·만료된 주문이면 먼저 입금 대기로 되돌려 주세요.",
    };
  }
  const { error } = await adminClient
    .from("bank_transfers")
    .update({
      deposited_at: new Date().toISOString(),
      confirmed_by: input.actorId,
      memo: input.memo ?? null,
    })
    .eq("transfer_id", input.transferId);
  if (error) return { ok: false, error: error.message };
  await markOrderPaidAndFulfill(transfer.order_id);
  // subject/bundle/membership 플랜의 구독 지급 — 무통장은 confirmPayment 를 안 타므로 여기서 처리.
  await grantSubscriptionForBankOrder(transfer.order_id);
  return { ok: true };
}

/** 무통장 주문의 구독형 상품 지급 — course/tpass 는 fulfill 이 처리했으므로 나머지만. */
async function grantSubscriptionForBankOrder(orderId: string): Promise<void> {
  const { data: items } = await adminClient
    .from("order_items")
    .select(
      "order_item_id, subject_code, plan:subscription_plans!order_items_plan_id_fkey(plan_id, product_kind, duration_days)",
    )
    .eq("order_id", orderId)
    .eq("item_type", "plan")
    .is("refunded_at", null);
  const { data: order } = await adminClient
    .from("orders")
    .select("user_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!order) return;
  for (const item of items ?? []) {
    const plan = item.plan as {
      plan_id: string;
      product_kind: string;
      duration_days: number;
    } | null;
    if (!plan || ["course", "tpass"].includes(plan.product_kind)) continue;
    // 기존 upsertPaidSubscription 과 순환 import 를 피하려 최소 지급(연장 아닌 신규/연장 upsert 는
    // subscriptions 도메인 헬퍼가 담당) — 동적 import.
    const { upsertPaidSubscription } = await import(
      "~/features/subscriptions/queries.server"
    );
    await upsertPaidSubscription(adminClient, {
      userId: order.user_id,
      planId: plan.plan_id,
      subjectCode: item.subject_code ?? null,
      durationDays: plan.duration_days ?? 30,
      paymentId: null,
    });
  }
}

/** 기한 초과 미입금 주문 일괄 취소 — cron + 관리자 화면 lazy 공용. */
export async function expireOverdueBankTransfers(): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: overdue } = await adminClient
    .from("bank_transfers")
    .select("transfer_id, order_id")
    .is("deposited_at", null)
    .lt("expires_at", nowIso);
  let cancelled = 0;
  for (const t of overdue ?? []) {
    const { data } = await adminClient
      .from("orders")
      .update({ status: "cancelled" })
      .eq("order_id", t.order_id)
      .eq("status", "pending_deposit")
      .select("order_id");
    if ((data ?? []).length > 0) cancelled++;
  }
  return cancelled;
}
