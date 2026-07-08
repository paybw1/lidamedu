// feat-11-004 4b — 무통장 입금 (설계 §3.8).
// 흐름: 신청(주문 pending_deposit + bank_transfers) → 관리자 입금 확인 → paid 전이·지급.
// 기한 초과 미입금 = 주문 cancelled (관리자 화면 lazy + cron 이중 안전망).

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  createSinglePlanOrder,
  markOrderPaidAndFulfill,
} from "~/features/orders/orders.server";

const DEPOSIT_WINDOW_HOURS = 72;

/** 무통장 주문 신청 — 학생 API·관리자 대리 생성 공용. */
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
  const expiresAt = new Date(Date.now() + DEPOSIT_WINDOW_HOURS * 3600_000).toISOString();
  const [{ error: btErr }, { error: oErr }] = await Promise.all([
    adminClient.from("bank_transfers").insert({
      order_id: order.orderId,
      depositor_name: input.depositorName,
      expected_amount_krw: input.amountKrw,
      expires_at: expiresAt,
    }),
    adminClient
      .from("orders")
      .update({ status: "pending_deposit" })
      .eq("order_id", order.orderId),
  ]);
  if (btErr) throw btErr;
  if (oErr) throw oErr;
  return { orderId: order.orderId, expiresAt };
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
