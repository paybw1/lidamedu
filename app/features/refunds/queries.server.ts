// feat-11-013 P6-c — 환불관리 화면의 읽기·접수 (요청서 PART B §2·§3·§7).
//
// ★모든 쓰기는 `refunds.server.ts` 의 RPC 를 거치거나 여기서 adminClient 로 한다.
//   화면(action)은 반드시 `requireRole(client, ["admin"])` 뒤에서 부른다 —
//   두 RPC 가 service_role 전용인 이유가 `private.is_staff` 에 강사가 포함되기 때문이고,
//   그 마지막 방어선이 액션 게이트다.

import adminClient from "~/core/lib/supa-admin-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import type { UserRole } from "~/core/lib/roles";
import { kstToday } from "~/core/lib/kst";

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
  /** 계산 기준일(KST 달력일) — 이용일수의 끝점(요청서 11-5). */
  calcBasisOn: string | null;
  intakeByName: string | null;
  requestReason: string | null;
  consultNote: string | null;
  adminMemo: string | null;
  originalPaidKrw: number | null;
  priorRefundedKrw: number | null;
  thisRefundKrw: number | null;
  /** 이번 환불로 돌려주는 배송비. 주문 헤더의 돈이라 항목으로 표현할 수 없다(P7-핸드오프 ①). */
  shippingRefundKrw: number;
  /** 아직 돌려줄 수 있는 배송비 — 주문 배송비에서 다른 종결 환불건이 이미 돌려준 몫을 뺀 값. */
  shippingRefundableKrw: number;
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

  // 이 건을 뺀 나머지 종결 환불건이 이미 돌려준 배송비를 제외한 잔여(P7-핸드오프 ①).
  const shippingRefundable = await remainingShippingRefundableKrw(r.order_id, refundId);

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
    calcBasisOn: r.calc_basis_on,
    intakeByName: r.intake_by ? (nameById.get(r.intake_by) ?? null) : null,
    requestReason: r.request_reason,
    consultNote: r.consult_note,
    adminMemo: r.admin_memo,
    originalPaidKrw: r.original_paid_krw,
    priorRefundedKrw: r.prior_refunded_krw,
    thisRefundKrw: r.this_refund_krw,
    shippingRefundKrw: r.shipping_refund_krw ?? 0,
    shippingRefundableKrw: shippingRefundable,
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
  /** 계산 기준일(KST, yyyy-mm-dd). 비우면 오늘. 소급 접수에 쓴다(요청서 11-5). */
  calcBasisOn?: string | null;
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
      // 요청서 11-5 — 접수 시 계산 기준일을 자동 저장한다. 전화·카톡으로 먼저 요청한 건은
      // 관리자가 실제 요청일로 고칠 수 있다(사유·담당자는 audit_logs 에 남는다).
      calc_basis_on: input.calcBasisOn ?? kstToday(),
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
/**
 * 종결된 환불건은 고칠 수 없다 — 쓰기 함수 셋이 **같은 검사**를 쓰게 한다.
 *
 * ★종전에는 `saveRefundAmounts` 에만 있었다. 그래서 `savePgCancel` 은 **이미 환불완료된 건의
 *   PG 취소금액·거래번호를 사유도 권한도 없이 덮어쓸 수 있었다** — 이미 나간 돈의 증빙이
 *   사후에 바뀌어도 아무도 모르는, 장부와 토스가 다른 말을 하게 되는 바로 그 경로다.
 *   `saveRefundCalcBasis` 는 지금 `saveRefundAmounts` 뒤에서만 불려 **우연히** 막히고 있었다.
 */
async function assertRefundEditable(
  refundId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: r, error } = await adminClient
    .from("refunds")
    .select("status")
    .eq("refund_id", refundId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!r) return { ok: false, error: "환불건을 찾을 수 없습니다." };
  if ((TERMINAL_REFUND_STATUSES as readonly string[]).includes(r.status)) {
    return {
      ok: false,
      error: "종결된 환불건은 수정할 수 없습니다. 원장 권한으로 되돌린 뒤 수정해 주세요.",
    };
  }
  return { ok: true };
}

/**
 * 아직 돌려줄 수 있는 배송비 (P7-핸드오프 ①).
 *
 * 배송비는 `orders.shipping_fee_krw`(주문 헤더)에 있고 `refund_items` 는 `order_items` 만
 * 가리킨다 — 항목으로는 표현할 수 없어 `refunds.shipping_refund_krw` 한 칸을 둔다.
 * ★반품비와 다른 돈이다. 반품비(떼는 돈)는 `refund_items.shipping_deduction_krw` 소관.
 */
export async function remainingShippingRefundableKrw(
  orderId: string,
  excludeRefundId?: string,
): Promise<number> {
  const { data: order } = await adminClient
    .from("orders")
    .select("shipping_fee_krw")
    .eq("order_id", orderId)
    .maybeSingle();
  const fee = order?.shipping_fee_krw ?? 0;
  if (fee <= 0) return 0;

  let q = adminClient
    .from("refunds")
    .select("shipping_refund_krw")
    .eq("order_id", orderId)
    .in("status", ["partial_done", "full_done"]);
  if (excludeRefundId) q = q.neq("refund_id", excludeRefundId);
  const { data: done } = await q;
  const already = (done ?? []).reduce((s, x) => s + (x.shipping_refund_krw ?? 0), 0);
  return Math.max(0, fee - already);
}

export async function saveRefundAmounts(input: {
  refundId: string;
  amounts: Array<{ refundItemId: string; finalKrw: number; deductionReason?: string | null }>;
  /** 이번 환불로 돌려주는 배송비(원). 주문 헤더의 돈이라 항목으로 표현할 수 없다. */
  shippingRefundKrw: number;
  couponRestored: boolean;
  refundMethod: string;
  adminMemo?: string | null;
  /** §11-14 — 조정 원장에 남길 담당자. */
  actorId: string;
  actorRole: UserRole | null;
  /** 자동 계산금액과 다르게 넣을 때의 사유. 감액이면 필수. */
  adjustReason?: string | null;
}): Promise<{ ok: true; total: number; adjusted: number } | { ok: false; error: string }> {
  const { data: r } = await adminClient
    .from("refunds")
    .select("status, order_id, original_paid_krw, prior_refunded_krw")
    .eq("refund_id", input.refundId)
    .maybeSingle();
  if (!r) return { ok: false, error: "환불건을 찾을 수 없습니다." };
  if ((TERMINAL_REFUND_STATUSES as readonly string[]).includes(r.status)) {
    return { ok: false, error: "종결된 환불건의 금액은 수정할 수 없습니다." };
  }

  // ★항목별 상한 — 그 항목에 실제로 결제된 금액을 넘겨 돌려줄 수 없다.
  //   확정 RPC 도 같은 검사를 하지만, 저장 단계에서 막아 주지 않으면 관리자가 토스에서
  //   취소까지 한 뒤에야 「합계가 안 맞는다」는 말을 듣는다.
  const { data: caps } = await adminClient
    .from("refund_items")
    .select(
      "refund_item_id, order_items!inner(paid_amount_krw, unit_price_krw, quantity, title_snapshot)",
    )
    .eq("refund_id", input.refundId);
  const capById = new Map<string, { cap: number; label: string }>();
  for (const c of caps ?? []) {
    const oi = c.order_items as unknown as {
      paid_amount_krw: number | null;
      unit_price_krw: number | null;
      quantity: number | null;
      title_snapshot: string | null;
    } | null;
    if (!oi) continue;
    capById.set(c.refund_item_id, {
      cap: oi.paid_amount_krw ?? (oi.unit_price_krw ?? 0) * (oi.quantity ?? 1),
      label: oi.title_snapshot ?? "상품",
    });
  }

  let total = 0;
  for (const a of input.amounts) {
    if (!Number.isFinite(a.finalKrw) || a.finalKrw < 0) {
      return { ok: false, error: "환불금액은 0원 이상이어야 합니다." };
    }
    const cap = capById.get(a.refundItemId);
    if (cap && Math.round(a.finalKrw) > cap.cap) {
      return {
        ok: false,
        error: `「${cap.label}」의 환불금액이 실제 결제금액 ${cap.cap.toLocaleString("ko-KR")}원을 넘습니다.`,
      };
    }
    total += Math.round(a.finalKrw);
  }

  // ★배송비 상한 (P7-핸드오프 ①) — 확정 RPC 가 같은 검사를 하지만, 저장 단계에서 막지 않으면
  //   관리자가 토스에서 취소까지 한 뒤에야 「금액이 안 맞는다」는 말을 듣는다.
  const shipping = Math.round(input.shippingRefundKrw);
  if (!Number.isFinite(shipping) || shipping < 0) {
    return { ok: false, error: "배송비 환불금액은 0원 이상이어야 합니다." };
  }
  const shippingCap = await remainingShippingRefundableKrw(r.order_id, input.refundId);
  if (shipping > shippingCap) {
    return {
      ok: false,
      error: `환불할 수 있는 배송비는 ${shippingCap.toLocaleString("ko-KR")}원입니다.`,
    };
  }
  total += shipping;

  const remaining = (r.original_paid_krw ?? 0) - (r.prior_refunded_krw ?? 0);
  if (r.original_paid_krw != null && total > remaining) {
    return {
      ok: false,
      error: `남은 환불 가능금액은 ${remaining.toLocaleString("ko-KR")}원입니다.`,
    };
  }

  // ── §11-14 관리자 금액 조정 ────────────────────────────────────────────────
  // ★자동 계산금액과 다른 값을 넣으면 **원장에 남긴다.** 요청서가 요구하는 여섯 값
  //   (자동 계산금액 / 최종 조정금액 / 증감액 / 조정사유 / 처리담당자 / 조정일시)이 모두 들어간다.
  // ★**감액·환불 불가로 바꾸는 것은 원장만** 할 수 있다(요청서 11-14 마지막 줄).
  //   담당자가 조용히 깎으면 학생이 손해를 보고, 그 흔적이 남지 않는 것이 더 큰 문제다.
  const { data: basisRows } = await adminClient
    .from("refund_items")
    .select("refund_item_id, calc_basis")
    .eq("refund_id", input.refundId);
  const autoById = new Map<string, number>();
  for (const b of basisRows ?? []) {
    const basis = b.calc_basis as { result?: { pgCancelPlanKrw?: number; verdict?: string } } | null;
    const auto = basis?.result?.pgCancelPlanKrw;
    if (typeof auto === "number" && basis?.result?.verdict !== "manual") {
      autoById.set(b.refund_item_id, auto);
    }
  }
  const adjustments = input.amounts
    .map((a) => {
      const auto = autoById.get(a.refundItemId);
      if (auto == null) return null;
      const diff = Math.round(a.finalKrw) - auto;
      return diff === 0 ? null : { refundItemId: a.refundItemId, auto, final: Math.round(a.finalKrw), diff };
    })
    .filter((x): x is { refundItemId: string; auto: number; final: number; diff: number } => x !== null);

  const isAdmin = input.actorRole === "admin";
  const reduced = adjustments.filter((x) => x.diff < 0);
  if (reduced.length > 0 && !isAdmin) {
    const worst = reduced.reduce((m, x) => (x.diff < m.diff ? x : m));
    return {
      ok: false,
      error: `자동 계산금액보다 감액하는 것은 원장만 확정할 수 있습니다 (자동 ${worst.auto.toLocaleString("ko-KR")}원 → 입력 ${worst.final.toLocaleString("ko-KR")}원).`,
    };
  }
  const reason = input.adjustReason?.trim() ?? "";
  if (adjustments.length > 0 && reason.length < 2) {
    return { ok: false, error: "자동 계산금액과 다른 금액을 넣을 때는 조정사유를 입력해 주세요." };
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

  for (const adj of adjustments) {
    await logAuditEvent({
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: "refund.amount_adjust",
      entityType: "refund_item",
      entityId: adj.refundItemId,
      metadata: {
        refundId: input.refundId,
        autoKrw: adj.auto,
        finalKrw: adj.final,
        diffKrw: adj.diff,
        direction: adj.diff < 0 ? "감액" : "증액",
        reason,
      },
    });
  }
  const { error } = await adminClient
    .from("refunds")
    .update({
      this_refund_krw: total,
      shipping_refund_krw: shipping,
      coupon_restored: input.couponRestored,
      refund_method: input.refundMethod,
      admin_memo: input.adminMemo ?? null,
    })
    .eq("refund_id", input.refundId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, total, adjusted: adjustments.length };
}

/**
 * 자동계산 **산출근거**를 항목에 박는다 (요청서 11-13·11-15).
 *
 * ★금액(`final_krw`)은 `saveRefundAmounts` 가 쓴다 — 상한·합계 검사를 거기 한 곳에 두기 위해서다.
 *   이 함수는 그 금액이 **어떻게 나왔는지**만 남긴다.
 * ★`calc_basis` 에 계산 결과를 통째로 저장하는 이유는 요청서 11-15 의 두 줄 때문이다 —
 *   「화면 표시값과 DB 저장값이 반드시 일치」, 「확정 후 상품가격·예정 회차가 변경되어도
 *   확정된 계산결과는 변경되지 않는다」. 화면은 매번 다시 계산해 보여 주지만, **적용한 순간의
 *   값**은 여기 얼어붙는다.
 */
export async function saveRefundCalcBasis(input: {
  refundId: string;
  rows: Array<{
    refundItemId: string;
    baseKrw: number;
    usedDeductionKrw: number;
    pointReturnKrw: number;
    basis: unknown;
  }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const editable = await assertRefundEditable(input.refundId);
  if (!editable.ok) return editable;
  for (const r of input.rows) {
    const { error } = await adminClient
      .from("refund_items")
      .update({
        base_krw: r.baseKrw,
        used_deduction_krw: r.usedDeductionKrw,
        point_return_krw: r.pointReturnKrw,
        calc_basis: r.basis as never,
      })
      .eq("refund_item_id", r.refundItemId)
      .eq("refund_id", input.refundId);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * 계산 기준일 수정 (요청서 11-5 — 「변경사유·처리담당자·변경 전후 값을 기록」).
 *
 * ★기준일은 이용일수 d 의 끝점이라 **하루가 곧 공제 하루**다. 전화로 먼저 요청한 날을
 *   소급하거나 잘못 잡힌 날을 고칠 수 있어야 하고, 고친 흔적이 남아야 한다.
 */
export async function saveRefundCalcBasisDate(input: {
  refundId: string;
  basisOn: string;
  reason: string;
  actorId: string;
  actorRole: UserRole | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^d{4}-d{2}-d{2}$/.test(input.basisOn)) {
    return { ok: false, error: "계산 기준일을 날짜로 입력해 주세요." };
  }
  if (input.reason.trim().length < 2) {
    return { ok: false, error: "기준일을 바꾸는 사유를 입력해 주세요." };
  }
  const editable = await assertRefundEditable(input.refundId);
  if (!editable.ok) return editable;

  const { data: before } = await adminClient
    .from("refunds")
    .select("calc_basis_on")
    .eq("refund_id", input.refundId)
    .maybeSingle();
  const { error } = await adminClient
    .from("refunds")
    .update({ calc_basis_on: input.basisOn })
    .eq("refund_id", input.refundId);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: "refund.calc_basis_on",
    entityType: "refund",
    entityId: input.refundId,
    metadata: { before: before?.calc_basis_on ?? null, after: input.basisOn, reason: input.reason.trim() },
  });
  return { ok: true };
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
  const editable = await assertRefundEditable(input.refundId);
  if (!editable.ok) return editable;
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
