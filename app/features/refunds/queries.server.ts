// feat-11-013 P6-c — 환불관리 화면의 읽기·접수 (요청서 PART B §2·§3·§7).
//
// ★모든 쓰기는 `refunds.server.ts` 의 RPC 를 거치거나 여기서 adminClient 로 한다.
//   화면(action)은 반드시 `requireRole(client, ["admin"])` 뒤에서 부른다 —
//   두 RPC 가 service_role 전용인 이유가 `private.is_staff` 에 강사가 포함되기 때문이고,
//   그 마지막 방어선이 액션 게이트다.

import adminClient from "~/core/lib/supa-admin-client.server";

import {
  type RefundStatus,
  TERMINAL_REFUND_STATUSES,
} from "./lib/refund-status";

export type RefundListRow = {
  refundId: string;
  orderId: string;
  userId: string;
  userName: string;
  status: RefundStatus;
  intakeAt: string;
  thisRefundKrw: number | null;
  originalPaidKrw: number | null;
  requestReason: string | null;
  itemCount: number;
  closedAt: string | null;
};

/** 환불관리 목록 + 미처리 건수 배지(요청서 §3). */
export async function listRefunds(filter: {
  status?: string | null;
  q?: string | null;
  limit?: number;
}): Promise<{ rows: RefundListRow[]; openCount: number }> {
  let query = adminClient
    .from("refunds")
    .select(
      "refund_id, order_id, user_id, status, intake_at, this_refund_krw, original_paid_krw, request_reason, closed_at, user:profiles!refunds_user_id_fkey(name), refund_items(refund_item_id)",
    )
    .order("intake_at", { ascending: false })
    .limit(filter.limit ?? 200);
  if (filter.status === "open") query = query.is("closed_at", null);
  else if (filter.status) query = query.eq("status", filter.status);

  const [{ data, error }, { count }] = await Promise.all([
    query,
    adminClient
      .from("refunds")
      .select("refund_id", { count: "exact", head: true })
      .is("closed_at", null),
  ]);
  if (error) throw error;

  const term = filter.q?.trim().toLowerCase() ?? "";
  const rows = (data ?? []).map((r) => {
    const prof = r.user as { name: string | null } | null;
    return {
      refundId: r.refund_id,
      orderId: r.order_id,
      userId: r.user_id,
      userName: prof?.name ?? "",
      status: r.status as RefundStatus,
      intakeAt: r.intake_at,
      thisRefundKrw: r.this_refund_krw,
      originalPaidKrw: r.original_paid_krw,
      requestReason: r.request_reason,
      itemCount: (r.refund_items as { refund_item_id: string }[] | null)?.length ?? 0,
      closedAt: r.closed_at,
    };
  });
  const filtered = term
    ? rows.filter(
        (r) =>
          r.userName.toLowerCase().includes(term) ||
          r.orderId.toLowerCase().includes(term) ||
          r.refundId.toLowerCase().includes(term),
      )
    : rows;
  return { rows: filtered, openCount: count ?? 0 };
}

export type RefundableItem = {
  orderItemId: string;
  label: string;
  itemType: string;
  quantity: number;
  unitPriceKrw: number;
  paidAmountKrw: number | null;
  refundedAt: string | null;
  /** 이미 다른 환불건이 열려 있어 고를 수 없는 항목. */
  lockedByOpenRefund: boolean;
};

export type OrderForRefund = {
  orderId: string;
  userId: string;
  userName: string;
  status: string;
  paidAt: string | null;
  totalKrw: number;
  shippingFeeKrw: number;
  couponDiscountKrw: number;
  pointAmountKrw: number;
  paymentMethod: string | null;
  items: RefundableItem[];
  /** 이전에 **완료된** 환불의 합계 — 접수 시 스냅샷으로 박는다. */
  priorRefundedKrw: number;
  payment: {
    paymentKey: string | null;
    status: string | null;
    refundedAt: string | null;
    refundAmountKrw: number | null;
  } | null;
};

/** 주문 한 건을 환불 접수/상세가 쓰는 모양으로 모은다 (요청서 §7 블록 1·2·3). */
export async function getOrderForRefund(orderId: string): Promise<OrderForRefund | null> {
  const { data: order } = await adminClient
    .from("orders")
    .select(
      "order_id, user_id, status, paid_at, total_krw, shipping_fee_krw, coupon_discount_krw, point_amount_krw, payment_method, user:profiles!orders_user_id_fkey(name)",
    )
    .eq("order_id", orderId)
    .maybeSingle();
  if (!order) return null;

  const [{ data: items }, { data: pay }, { data: doneRefunds }, { data: openItems }] =
    await Promise.all([
      adminClient
        .from("order_items")
        .select(
          "order_item_id, item_type, title_snapshot, quantity, unit_price_krw, paid_amount_krw, refunded_at",
        )
        .eq("order_id", orderId)
        .order("created_at"),
      adminClient
        .from("payments")
        .select("toss_payment_key, status, refunded_at, refund_amount_krw")
        .eq("order_id", orderId)
        .eq("status", "completed")
        .maybeSingle(),
      adminClient
        .from("refunds")
        .select("this_refund_krw")
        .eq("order_id", orderId)
        .in("status", ["partial_done", "full_done"]),
      adminClient
        .from("refund_items")
        .select("order_item_id")
        .eq("is_open", true),
    ]);

  const lockedIds = new Set((openItems ?? []).map((r) => r.order_item_id));
  const prof = order.user as { name: string | null } | null;

  return {
    orderId: order.order_id,
    userId: order.user_id,
    userName: prof?.name ?? "",
    status: order.status,
    paidAt: order.paid_at,
    totalKrw: order.total_krw ?? 0,
    shippingFeeKrw: order.shipping_fee_krw ?? 0,
    couponDiscountKrw: order.coupon_discount_krw ?? 0,
    pointAmountKrw: order.point_amount_krw ?? 0,
    paymentMethod: order.payment_method,
    items: (items ?? []).map((i) => ({
      orderItemId: i.order_item_id,
      label: i.title_snapshot ?? (i.item_type === "book" ? "교재" : "강의"),
      itemType: i.item_type,
      quantity: i.quantity ?? 1,
      unitPriceKrw: i.unit_price_krw ?? 0,
      paidAmountKrw: i.paid_amount_krw,
      refundedAt: i.refunded_at,
      lockedByOpenRefund: lockedIds.has(i.order_item_id),
    })),
    priorRefundedKrw: (doneRefunds ?? []).reduce((s, r) => s + (r.this_refund_krw ?? 0), 0),
    payment: pay
      ? {
          paymentKey: pay.toss_payment_key,
          status: pay.status,
          refundedAt: pay.refunded_at,
          refundAmountKrw: pay.refund_amount_krw,
        }
      : null,
  };
}

export type RefundDetail = {
  refundId: string;
  status: RefundStatus;
  order: OrderForRefund;
  intakeChannel: string | null;
  intakeAt: string;
  intakeByName: string | null;
  requestReason: string | null;
  consultNote: string | null;
  adminMemo: string | null;
  originalPaidKrw: number | null;
  priorRefundedKrw: number | null;
  thisRefundKrw: number | null;
  refundMethod: string | null;
  couponRestored: boolean;
  pgCancelKrw: number | null;
  pgCancelKind: string | null;
  pgCancelledAt: string | null;
  pgTransactionNo: string | null;
  pgOperatorName: string | null;
  closedAt: string | null;
  items: Array<{
    refundItemId: string;
    orderItemId: string;
    label: string;
    quantity: number;
    unitPriceKrw: number;
    paidAmountKrw: number | null;
    finalKrw: number | null;
    deductionReason: string | null;
    returnTrackingNo: string | null;
  }>;
  logs: Array<{
    logId: string;
    fromStatus: string | null;
    toStatus: string;
    actorName: string | null;
    memo: string | null;
    createdAt: string;
  }>;
};

export async function getRefundDetail(refundId: string): Promise<RefundDetail | null> {
  const { data: r } = await adminClient
    .from("refunds")
    .select("*")
    .eq("refund_id", refundId)
    .maybeSingle();
  if (!r) return null;

  const order = await getOrderForRefund(r.order_id);
  if (!order) return null;

  const [{ data: items }, { data: logs }] = await Promise.all([
    adminClient
      .from("refund_items")
      .select(
        "refund_item_id, order_item_id, quantity, final_krw, deduction_reason, return_tracking_no",
      )
      .eq("refund_id", refundId)
      .order("created_at"),
    adminClient
      .from("refund_status_logs")
      .select("log_id, from_status, to_status, memo, created_at, actor:profiles!refund_status_logs_actor_id_fkey(name)")
      .eq("refund_id", refundId)
      .order("created_at", { ascending: false }),
  ]);

  // 담당자 이름 — 접수자·PG 처리자.
  const staffIds = [r.intake_by, r.pg_operator].filter((v): v is string => !!v);
  const nameById = new Map<string, string>();
  if (staffIds.length) {
    const { data: profs } = await adminClient
      .from("profiles")
      .select("profile_id, name")
      .in("profile_id", staffIds);
    for (const p of profs ?? []) nameById.set(p.profile_id, p.name ?? "");
  }
  const itemById = new Map(order.items.map((i) => [i.orderItemId, i]));

  return {
    refundId: r.refund_id,
    status: r.status as RefundStatus,
    order,
    intakeChannel: r.intake_channel,
    intakeAt: r.intake_at,
    intakeByName: r.intake_by ? (nameById.get(r.intake_by) ?? null) : null,
    requestReason: r.request_reason,
    consultNote: r.consult_note,
    adminMemo: r.admin_memo,
    originalPaidKrw: r.original_paid_krw,
    priorRefundedKrw: r.prior_refunded_krw,
    thisRefundKrw: r.this_refund_krw,
    refundMethod: r.refund_method,
    couponRestored: r.coupon_restored,
    pgCancelKrw: r.pg_cancel_krw,
    pgCancelKind: r.pg_cancel_kind,
    pgCancelledAt: r.pg_cancelled_at,
    pgTransactionNo: r.pg_transaction_no,
    pgOperatorName: r.pg_operator ? (nameById.get(r.pg_operator) ?? null) : null,
    closedAt: r.closed_at,
    items: (items ?? []).map((it) => {
      const oi = itemById.get(it.order_item_id);
      return {
        refundItemId: it.refund_item_id,
        orderItemId: it.order_item_id,
        label: oi?.label ?? "상품",
        quantity: it.quantity ?? 1,
        unitPriceKrw: oi?.unitPriceKrw ?? 0,
        paidAmountKrw: oi?.paidAmountKrw ?? null,
        finalKrw: it.final_krw,
        deductionReason: it.deduction_reason,
        returnTrackingNo: it.return_tracking_no,
      };
    }),
    logs: (logs ?? []).map((l) => ({
      logId: l.log_id,
      fromStatus: l.from_status,
      toStatus: l.to_status,
      actorName: (l.actor as { name: string | null } | null)?.name ?? null,
      memo: l.memo,
      createdAt: l.created_at,
    })),
  };
}

/**
 * 환불신청 등록 (요청서 §2). **실제 환불 실행이 아니라 환불관리에 건을 만드는 일**이다.
 *
 * ★금액 두 칸은 **여기서만** 박는다 — 접수 시점 스냅샷이다.
 *     original_paid_krw  = orders.total_krw (토스가 실제로 청구한 금액. 배송비 포함·포인트 제외)
 *     prior_refunded_krw = 이 주문에서 **이미 완료된** 환불의 합
 *   나중에 다시 계산하면 그 사이 다른 환불이 끼어들어 값이 흔들린다.
 */
export async function createRefundIntake(input: {
  orderId: string;
  orderItemIds: string[];
  intakeChannel: string;
  requestReason: string;
  consultNote?: string | null;
  adminMemo?: string | null;
  intakeBy: string;
}): Promise<{ ok: true; refundId: string } | { ok: false; error: string }> {
  const order = await getOrderForRefund(input.orderId);
  if (!order) return { ok: false, error: "주문을 찾을 수 없습니다." };
  if (!input.orderItemIds.length) return { ok: false, error: "환불할 상품을 선택해 주세요." };

  const chosen = order.items.filter((i) => input.orderItemIds.includes(i.orderItemId));
  if (chosen.length !== input.orderItemIds.length) {
    return { ok: false, error: "이 주문에 없는 상품이 포함돼 있습니다." };
  }
  // 요청서 §10 — 동일 상품 중복 환불신청 차단. DB 유니크가 최종 방어선이지만,
  // 여기서 먼저 **읽을 수 있는 문장**으로 돌려준다.
  const locked = chosen.filter((i) => i.lockedByOpenRefund);
  if (locked.length) {
    return {
      ok: false,
      error: `이미 진행 중인 환불건이 있는 상품입니다 — ${locked.map((i) => i.label).join(", ")}`,
    };
  }
  const already = chosen.filter((i) => i.refundedAt);
  if (already.length) {
    return {
      ok: false,
      error: `이미 환불된 상품입니다 — ${already.map((i) => i.label).join(", ")}`,
    };
  }

  const { data: created, error } = await adminClient
    .from("refunds")
    .insert({
      order_id: order.orderId,
      user_id: order.userId,
      status: "received",
      intake_channel: input.intakeChannel,
      intake_by: input.intakeBy,
      request_reason: input.requestReason,
      consult_note: input.consultNote ?? null,
      admin_memo: input.adminMemo ?? null,
      original_paid_krw: order.totalKrw,
      prior_refunded_krw: order.priorRefundedKrw,
    })
    .select("refund_id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "접수에 실패했습니다." };

  const { error: itemErr } = await adminClient.from("refund_items").insert(
    chosen.map((i) => ({
      refund_id: created.refund_id,
      order_item_id: i.orderItemId,
      quantity: i.quantity,
    })),
  );
  if (itemErr) {
    // 대상 없는 헤더만 남으면 목록이 더러워진다 — 되돌린다.
    await adminClient.from("refunds").delete().eq("refund_id", created.refund_id);
    return {
      ok: false,
      error:
        itemErr.code === "23505"
          ? "그 사이 같은 상품에 다른 환불건이 열렸습니다. 새로고침 후 다시 시도해 주세요."
          : itemErr.message,
    };
  }
  return { ok: true, refundId: created.refund_id };
}

/** 상품별 환불금액·공제사유 저장 + 헤더 확정액 동기화(합계가 곧 확정액이다). */
export async function saveRefundAmounts(input: {
  refundId: string;
  amounts: Array<{ refundItemId: string; finalKrw: number; deductionReason?: string | null }>;
  couponRestored: boolean;
  refundMethod: string;
  adminMemo?: string | null;
}): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const { data: r } = await adminClient
    .from("refunds")
    .select("status, original_paid_krw, prior_refunded_krw")
    .eq("refund_id", input.refundId)
    .maybeSingle();
  if (!r) return { ok: false, error: "환불건을 찾을 수 없습니다." };
  if ((TERMINAL_REFUND_STATUSES as readonly string[]).includes(r.status)) {
    return { ok: false, error: "종결된 환불건의 금액은 수정할 수 없습니다." };
  }

  let total = 0;
  for (const a of input.amounts) {
    if (!Number.isFinite(a.finalKrw) || a.finalKrw < 0) {
      return { ok: false, error: "환불금액은 0원 이상이어야 합니다." };
    }
    total += Math.round(a.finalKrw);
  }
  const remaining = (r.original_paid_krw ?? 0) - (r.prior_refunded_krw ?? 0);
  if (r.original_paid_krw != null && total > remaining) {
    return {
      ok: false,
      error: `남은 환불 가능금액은 ${remaining.toLocaleString("ko-KR")}원입니다.`,
    };
  }

  for (const a of input.amounts) {
    const { error } = await adminClient
      .from("refund_items")
      .update({
        final_krw: Math.round(a.finalKrw),
        deduction_reason: a.deductionReason ?? null,
      })
      .eq("refund_item_id", a.refundItemId)
      .eq("refund_id", input.refundId);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await adminClient
    .from("refunds")
    .update({
      this_refund_krw: total,
      coupon_restored: input.couponRestored,
      refund_method: input.refundMethod,
      admin_memo: input.adminMemo ?? null,
    })
    .eq("refund_id", input.refundId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, total };
}

/**
 * 토스(또는 계좌이체) 취소결과 입력 (요청서 §6).
 *
 * ★칸은 넷으로 고정이고 **라벨만** 환불방법에 따라 바뀐다 —
 *   원결제수단 취소면 「토스 거래번호」, 계좌환불이면 「이체 참조번호」다.
 *   칸을 따로 만들면 「환불완료 전 4값 확인」 규칙이 두 벌이 된다.
 */
export async function savePgCancel(input: {
  refundId: string;
  cancelKrw: number;
  cancelKind: "full" | "partial";
  cancelledAt: string;
  transactionNo: string;
  operatorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(input.cancelKrw) || input.cancelKrw <= 0) {
    return { ok: false, error: "실제 취소금액을 입력해 주세요." };
  }
  if (!input.transactionNo.trim()) {
    return { ok: false, error: "거래번호(또는 이체 참조번호)를 입력해 주세요." };
  }
  const { error } = await adminClient
    .from("refunds")
    .update({
      pg_cancel_krw: Math.round(input.cancelKrw),
      pg_cancel_kind: input.cancelKind,
      pg_cancelled_at: input.cancelledAt,
      pg_transaction_no: input.transactionNo.trim(),
      pg_operator: input.operatorId,
    })
    .eq("refund_id", input.refundId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
