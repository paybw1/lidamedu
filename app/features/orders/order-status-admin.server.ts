// feat-11-014 Q1~Q3 — 주문관리 상태 셀렉트의 **서버 절반**: 보호된 경로 5개 + 이력 원장.
//
// ★셀렉트 값은 「상태」가 아니라 **전이**다(설계 §0). 값만 바꾸면 정산은 계속 총매출로 세고
//   수강권은 살아 있고 포인트 크론은 「결제 안 된 주문」으로 보고 돈 받은 주문의 포인트를
//   돌려준다. 그래서 여기서는 **새 뮤테이션 경로를 만들지 않는다**(Layer 2 규칙 8) —
//   기존 함수(confirmBankTransfer · releasePointsForOrders · createRefundIntake →
//   setRefundStatus → commitRefund)를 순서대로 부르고, 이 파일이 새로 쓰는 것은
//   ① 상태 전이의 **조건부 update**(`.in(status,…).select()` 로 실제 전이분만 인정)
//   ② `order_status_logs` 이력 ③ `audit_logs` 미러 뿐이다.
//
// ★허용 판정은 화면과 **같은 함수**(allowedAdminOrderActions)로 서버가 다시 한다.
//   화면이 option 을 비활성했더라도 요청은 조작될 수 있다 — 서버가 권위다.
// ★전부 adminClient — orders/bank_transfers/refunds 에 사용자 쓰기 정책이 없고,
//   타 사용자(주문자·처리자) 프로필 조회도 여기서 한다. 호출부(action)가 manager+직무
//   게이트를 먼저 통과해야 한다. 원장 전용 액션은 여기서 **한 번 더** 막는다.
import { ROLE_RANK, type UserRole, roleAtLeast } from "~/core/lib/roles";
import adminClient from "~/core/lib/supa-admin-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import {
  DEPOSIT_WINDOW_HOURS,
  confirmBankTransfer,
} from "~/features/orders/bank-transfer.server";
import { itemPaidAmountKrw } from "~/features/orders/lib/order-snapshot";
import {
  ADMIN_ONLY_ORDER_ACTIONS,
  ADMIN_ORDER_ACTION_LABEL,
  ARCHIVABLE_ORDER_STATUSES,
  ARCHIVE_LOG_STATUS,
  type AdminOrderAction,
  BANK_TRANSFER_PAYMENT_METHOD,
  CANCELLABLE_ORDER_STATUSES,
  MIN_ORDER_STATUS_REASON_LENGTH,
  type OrderStatus,
  REOPENABLE_DEPOSIT_STATUSES,
  adminOrderStatusLabel,
  allowedAdminOrderActions,
} from "~/features/orders/lib/order-status";
import { CHECKOUT_TTL_MINUTES } from "~/features/orders/orders.server";
import { releasePointsForOrders } from "~/features/points/points-order.server";
import {
  REFUND_METHOD_LABELS,
  type RefundStatus,
  type RefundTransitionContext,
  checkRefundTransition,
} from "~/features/refunds/lib/refund-status";
import {
  createRefundIntake,
  getOrderForRefund,
  remainingShippingRefundableKrw,
  savePgCancel,
  saveRefundAmounts,
} from "~/features/refunds/queries.server";
import {
  commitRefund,
  setRefundStatus,
} from "~/features/refunds/refunds.server";
import { isLectureProductKind } from "~/features/subscriptions/labels";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** 이력 조회 `.in()` 배치 크기 — 주문관리 로더의 다른 `.in()` 과 같은 폭(URL 길이 초과 400 방지). */
const LOG_QUERY_BATCH_SIZE = 100;

/**
 * 결제창 세션이 아직 살아 있을 수 있는 상태 — expireStaleCheckoutOrders 가 TTL 로 만료시키는 두 값.
 * ★이 상태의 주문을 TTL 안에 취소·보관하면, 학생이 결제창에서 승인을 마친 뒤 confirmPayment →
 *   markOrderPaidAndFulfill 이 paid 전이 0행에도 계속 진행해(상류 구멍) 취소된 주문에 수강권이
 *   생기고 보관된 주문에 돈이 들어온다. 크론이 안전한 이유는 나이 가드다 — 여기서도 같이 건다.
 */
const CHECKOUT_WINDOW_STATUSES: readonly OrderStatus[] = [
  "attempted",
  "pending_payment",
];

/** 환불완료 단축이 환불건을 끌고 가는 경로 — 접수부터 PG 취소완료까지(확정은 commitRefund). */
const REFUND_SHORTCUT_PATH: readonly RefundStatus[] = [
  "received",
  "reviewing",
  "amount_fixed",
  "pg_pending",
  "pg_done",
];

const AUDIT_ACTION = "order.status_change";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function asUserRole(v: string | null | undefined): UserRole | null {
  return v && Object.hasOwn(ROLE_RANK, v) ? (v as UserRole) : null;
}

type OrderRow = {
  order_id: string;
  status: string;
  payment_method: string | null;
  archived_at: string | null;
  user_id: string;
  total_krw: number;
  created_at: string;
};

/** 결제창 TTL 안의 진행 중 결제인가 — 취소·보관의 실행 시점 가드(허용 표는 순수 함수 그대로). */
function isCheckoutWindowOpen(order: OrderRow, nowMs: number): boolean {
  if (!(CHECKOUT_WINDOW_STATUSES as readonly string[]).includes(order.status))
    return false;
  return (
    Date.parse(order.created_at) > nowMs - CHECKOUT_TTL_MINUTES * MINUTE_MS
  );
}

const CHECKOUT_WINDOW_OPEN_ERROR = `결제창 세션이 아직 살아 있을 수 있는 주문입니다(생성 ${CHECKOUT_TTL_MINUTES}분 이내). 자동 만료를 기다린 뒤 처리해 주세요.`;

type ActionOutcome =
  | { ok: true; toStatus: string; detail: string; refundId?: string }
  | { ok: false; error: string };

export type OrderStatusLogRow = {
  logId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  actorName: string | null;
  createdAt: string;
};

async function readOrderStatus(orderId: string): Promise<string | null> {
  const { data } = await adminClient
    .from("orders")
    .select("status")
    .eq("order_id", orderId)
    .maybeSingle();
  return data?.status ?? null;
}

/** 아직 입금 확인이 안 된 무통장 신청 — 가장 최근 1건. `maybeSingle` 은 중복 행에서 죽는다. */
async function findOpenBankTransfer(
  orderId: string,
): Promise<{ transfer_id: string } | null> {
  const { data } = await adminClient
    .from("bank_transfers")
    .select("transfer_id")
    .eq("order_id", orderId)
    .is("deposited_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

// ── 액션별 실행 ───────────────────────────────────────────────────────────

/** 결제완료(무통장) — 기존 confirmBankTransfer 가 paid 전이·지급까지 한다. */
async function runConfirmDeposit(input: {
  order: OrderRow;
  actorId: string;
  reason: string;
}): Promise<ActionOutcome> {
  const transfer = await findOpenBankTransfer(input.order.order_id);
  if (!transfer)
    return { ok: false, error: "입금 대기 중인 무통장 신청이 없습니다." };
  const res = await confirmBankTransfer({
    transferId: transfer.transfer_id,
    actorId: input.actorId,
    memo: input.reason,
  });
  if (!res.ok) return res;
  // ★confirmBankTransfer 는 paid 전이가 조용히 실패해도(markOrderPaidAndFulfill 이
  //   console.error 후 return) ok 를 돌려준다. 결과 상태를 읽어 어긋나면 그대로 알린다.
  const after = await readOrderStatus(input.order.order_id);
  if (after !== "paid") {
    return {
      ok: false,
      error: `입금은 확인됐으나 주문 상태가 결제 완료로 바뀌지 않았습니다(현재 ${adminOrderStatusLabel(after ?? "")}). 주문을 확인해 주세요.`,
    };
  }
  return {
    ok: true,
    toStatus: "paid",
    detail:
      "입금을 확인하고 결제 완료로 처리했습니다. 수강권·배송 지급이 함께 진행됐습니다.",
  };
}

/**
 * 취소 — 크론 만료 함수(expireStaleCheckoutOrders · expireOverdueBankTransfers)와 **같은 부작용**을
 * 단건·사유 버전으로: 조건부 전이 → 포인트 반환 → 무통장 기한 종료.
 */
async function runCancel(input: {
  order: OrderRow;
  reason: string;
}): Promise<ActionOutcome> {
  const orderId = input.order.order_id;
  // ★expireStaleCheckoutOrders 의 나이(TTL) 가드 — 결제창이 살아 있는 동안 취소하면 학생이 승인을
  //   마친 뒤 수강권이 지급되고 포인트는 여기서 이미 반환된 상태가 된다.
  if (isCheckoutWindowOpen(input.order, Date.now())) {
    return { ok: false, error: CHECKOUT_WINDOW_OPEN_ERROR };
  }
  // ★expireStaleCheckoutOrders 와 같은 선행 가드 — 승인 응답이 늦게 도착하는 사이에 취소하면
  //   돈은 받고 주문은 취소인 상태가 된다.
  const { data: paidRows } = await adminClient
    .from("payments")
    .select("payment_id")
    .eq("order_id", orderId)
    .eq("status", "completed")
    .limit(1);
  if (paidRows?.length) {
    return {
      ok: false,
      error:
        "완료된 결제 기록이 있는 주문은 취소할 수 없습니다. 환불 경로로 처리해 주세요.",
    };
  }
  // ★무통장은 payments 행이 없다 — 돈 받은 표시는 bank_transfers.deposited_at 이다. 입금 확인은
  //   찍혔는데 paid 전이가 안 된 주문(confirmBankTransfer 경합)을 취소하면 돈은 받고 주문은
  //   취소, 재접수도 불가(deposited_at 이 있어 열린 신청이 없다)인 상태로 남는다.
  if (input.order.payment_method === BANK_TRANSFER_PAYMENT_METHOD) {
    const { data: deposited } = await adminClient
      .from("bank_transfers")
      .select("transfer_id")
      .eq("order_id", orderId)
      .not("deposited_at", "is", null)
      .limit(1);
    if (deposited?.length) {
      return {
        ok: false,
        error:
          "입금 확인된 무통장 주문은 취소할 수 없습니다. 주문 상태가 결제 완료가 아니라면 주문을 확인하고, 돈을 돌려줄 건이면 환불 경로로 처리해 주세요.",
      };
    }
  }

  const { data: updated, error } = await adminClient
    .from("orders")
    .update({ status: "cancelled" })
    .eq("order_id", orderId)
    .in("status", [...CANCELLABLE_ORDER_STATUSES])
    .select("order_id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) {
    return {
      ok: false,
      error:
        "그 사이 주문 상태가 바뀌어 취소하지 못했습니다. 새로고침 후 다시 확인해 주세요.",
    };
  }

  // ★상태를 먼저 바꾼 뒤 부른다 — RPC 가 orders.status ∈ {cancelled, expired, failed} 를 요구한다.
  const released = await releasePointsForOrders(
    [orderId],
    `관리자 취소 — ${input.reason}`,
  );
  if (input.order.payment_method === BANK_TRANSFER_PAYMENT_METHOD) {
    await adminClient
      .from("bank_transfers")
      .update({ expires_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .is("deposited_at", null);
  }
  return {
    ok: true,
    toStatus: "cancelled",
    detail:
      "주문을 취소했습니다." +
      (released > 0 ? ` 포인트 ${won(released)}을 반환했습니다.` : ""),
  };
}

/** 입금대기(무통장 재접수) — cancelled/expired → pending_deposit + 입금 기한 재설정. */
async function runReopenDeposit(input: {
  order: OrderRow;
}): Promise<ActionOutcome> {
  const orderId = input.order.order_id;
  const transfer = await findOpenBankTransfer(orderId);
  if (!transfer) {
    return {
      ok: false,
      error: "무통장 신청 기록이 없어 입금 대기로 되돌릴 수 없습니다.",
    };
  }
  // ★신청 경로(create-cart-order)의 불변식 — 한 회원에게 입금 대기 주문은 하나만.
  //   둘 이상 쌓이면 어느 건으로 입금됐는지 운영이 가르지 못한다.
  const { count } = await adminClient
    .from("orders")
    .select("order_id", { count: "exact", head: true })
    .eq("user_id", input.order.user_id)
    .eq("status", "pending_deposit");
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        "이 회원에게 이미 입금 대기 중인 주문이 있습니다. 그 건을 먼저 정리해 주세요.",
    };
  }

  const expiresAt = new Date(
    Date.now() + DEPOSIT_WINDOW_HOURS * HOUR_MS,
  ).toISOString();
  // ★기한을 **먼저** 늘리고 상태를 나중에 옮긴다. 반대 순서에서 기한 갱신이 실패하면 주문은
  //   입금 대기인데 기한은 과거라, 다음 목록 로드의 lazy 만료(expireOverdueBankTransfers)가 이력
  //   없이 다시 취소한다 — 두 번 전이하고 order_status_logs 는 0행. 기한을 먼저 늘리는 것은
  //   아직 cancelled/expired 인 주문에 무해하다(lazy 만료는 pending_deposit 만 건드린다).
  const { error: btErr } = await adminClient
    .from("bank_transfers")
    .update({ expires_at: expiresAt })
    .eq("transfer_id", transfer.transfer_id);
  if (btErr) {
    return {
      ok: false,
      error: `입금 기한 재설정에 실패했습니다: ${btErr.message}. 다시 시도해 주세요.`,
    };
  }
  const { data: updated, error } = await adminClient
    .from("orders")
    .update({ status: "pending_deposit" })
    .eq("order_id", orderId)
    .in("status", [...REOPENABLE_DEPOSIT_STATUSES])
    .eq("payment_method", BANK_TRANSFER_PAYMENT_METHOD)
    .is("archived_at", null)
    .select("order_id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) {
    return {
      ok: false,
      error:
        "그 사이 주문 상태가 바뀌어 입금 대기로 되돌리지 못했습니다. 새로고침 후 다시 확인해 주세요.",
    };
  }
  return {
    ok: true,
    toStatus: "pending_deposit",
    detail: `입금 대기로 되돌렸습니다. 입금 기한을 ${DEPOSIT_WINDOW_HOURS}시간 뒤로 재설정했습니다.`,
  };
}

/**
 * 보관 / 보관 해제 — status 가 아니라 archived_at. 비결제 상태만 보관된다.
 *
 * ★진행 중 결제(attempted/pending_payment)는 TTL 안이면 보관도 막는다 — paid 전이가 archived_at
 *   을 풀지 않으므로, 결제창이 살아 있는 주문을 보관하면 학생 결제 완료 뒤 paid + archived 가 되어
 *   기본 목록·결제시도 카운트에서 사라진다. TTL 이 지나면 크론이 expired 로 옮기고 그때 보관된다.
 */
async function runArchive(input: {
  order: OrderRow;
  action: "archive" | "unarchive";
}): Promise<ActionOutcome> {
  const orderId = input.order.order_id;
  if (
    input.action === "archive" &&
    isCheckoutWindowOpen(input.order, Date.now())
  ) {
    return { ok: false, error: CHECKOUT_WINDOW_OPEN_ERROR };
  }
  const q =
    input.action === "archive"
      ? adminClient
          .from("orders")
          .update({ archived_at: new Date().toISOString() })
          .eq("order_id", orderId)
          .in("status", [...ARCHIVABLE_ORDER_STATUSES])
          .is("archived_at", null)
      : adminClient
          .from("orders")
          .update({ archived_at: null })
          .eq("order_id", orderId)
          .not("archived_at", "is", null);
  const { data: updated, error } = await q.select("order_id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) {
    return {
      ok: false,
      error:
        input.action === "archive"
          ? "보관할 수 없는 상태이거나 이미 보관된 주문입니다."
          : "보관돼 있지 않은 주문입니다.",
    };
  }
  return {
    ok: true,
    toStatus: ARCHIVE_LOG_STATUS[input.action],
    detail:
      input.action === "archive"
        ? "주문을 보관함으로 옮겼습니다. 목록의 「보관함」 필터에서 볼 수 있습니다."
        : "보관을 해제했습니다.",
  };
}

/**
 * 환불완료(원장 전용) — **환불관리 수동 종결 단축**. PG 호출 0.
 *
 * 「이미 밖에서(계좌 송금 등) 돌려준 **전액**」의 장부 정리다. 새 뮤테이션 경로를 만들지 않고
 * 환불 도메인 함수를 환불관리 화면과 같은 순서로 부른다 — 그래서 만들어진 환불건은 환불관리에
 * 그대로 보이고 `refund_status_logs` 도 남는다(경로 단일).
 *
 * ★접수(createRefundIntake) **전에** 모든 검증을 끝낸다 — 적용 불가 건이 고아 환불건을 남기지 않게.
 * ★금액·PG 취소결과를 **먼저 저장한 뒤** 상태를 옮긴다. checkRefundTransition 이 amount_fixed →
 *   pg_pending 에서 확정액(thisRefundKrw)을 요구하므로 상태부터 옮기면 표에서 막힌다.
 * ★접수 이후의 실패는 환불건을 남겨 두고 refundId 를 함께 돌려준다 — 환불관리에서 이어간다.
 */
async function runRefundComplete(input: {
  order: OrderRow;
  actorId: string;
  actorRole: UserRole | null;
  reason: string;
  refund:
    | { refundKrw: number; evidenceNo: string; method: "bank" | "etc" }
    | undefined;
}): Promise<ActionOutcome> {
  const orderId = input.order.order_id;
  if (!input.refund) {
    return {
      ok: false,
      error: "실환급액과 처리 근거(송금번호 등)를 입력해 주세요.",
    };
  }
  const evidenceNo = input.refund.evidenceNo.trim();
  if (!evidenceNo)
    return { ok: false, error: "처리 근거(송금번호 등)를 입력해 주세요." };
  const refundKrw = Math.round(input.refund.refundKrw);
  if (!Number.isFinite(refundKrw) || refundKrw <= 0) {
    return { ok: false, error: "실환급액은 0원보다 커야 합니다." };
  }

  const order = await getOrderForRefund(orderId);
  if (!order) return { ok: false, error: "주문을 찾을 수 없습니다." };
  const remaining = order.totalKrw - order.priorRefundedKrw;
  if (remaining <= 0)
    return { ok: false, error: "남은 환불 가능금액이 없습니다." };
  if (refundKrw !== remaining) {
    return {
      ok: false,
      error: `부분 환불은 환불관리에서 처리하세요. 이 처리는 남은 환불 가능금액 전액(${won(remaining)})을 이미 돌려준 경우의 장부 정리입니다.`,
    };
  }

  const targets = order.items.filter((i) => !i.refundedAt);
  if (!targets.length)
    return { ok: false, error: "환불할 상품이 남아 있지 않습니다." };
  const locked = targets.filter((i) => i.lockedByOpenRefund);
  if (locked.length) {
    return {
      ok: false,
      error: `진행 중인 환불건이 있는 상품이 있습니다 — ${locked.map((i) => i.label).join(", ")}. 환불관리에서 그 건을 이어서 처리하세요.`,
    };
  }

  // ★항목별 환불액 = 그 항목의 **결제귀속액** — refundOrderItem 과 같은 기준(스냅샷 있으면 그것,
  //   없으면 정산과 같은 규칙으로 즉석 배분). Σ귀속액 + 배송비 = 주문 총액이므로, 이전 부분
  //   환불이 귀속액대로 나갔다면 합계가 곧 남은 전액이다. 어긋나면 손으로 맞춰야 하는 건이다.
  const siblings = order.items.map((i) => ({
    id: i.orderItemId,
    grossKrw: i.unitPriceKrw * i.quantity,
  }));
  const amounts = targets.map((i) => ({
    orderItemId: i.orderItemId,
    finalKrw: itemPaidAmountKrw({
      paidAmountSnapshotKrw: i.paidAmountKrw,
      grossKrw: i.unitPriceKrw * i.quantity,
      siblings,
      id: i.orderItemId,
      couponDiscountKrw: order.couponDiscountKrw,
      pointAmountKrw: order.pointAmountKrw,
    }),
    // ★commit_refund 가 포인트 항목의 반환액 미확정을 거부한다. 전액 정리이므로 배분 전부.
    pointReturnKrw: i.pointAllocKrw,
  }));
  const shippingRefundKrw = await remainingShippingRefundableKrw(orderId);
  const claim = amounts.reduce((s, a) => s + a.finalKrw, 0) + shippingRefundKrw;
  if (claim !== remaining) {
    return {
      ok: false,
      error: `상품별 결제귀속액 합계 ${won(claim)}(배송비 ${won(shippingRefundKrw)} 포함)이 남은 환불 가능금액 ${won(remaining)}과 다릅니다. 환불관리에서 금액을 직접 확정해 주세요.`,
    };
  }

  // ── 여기서부터 환불건이 생긴다 ────────────────────────────────────────
  const intake = await createRefundIntake({
    orderId,
    orderItemIds: targets.map((i) => i.orderItemId),
    intakeChannel: "etc",
    requestReason: input.reason,
    intakeBy: input.actorId,
  });
  if (!intake.ok) return intake;
  const refundId = intake.refundId;
  const fail = (msg: string): ActionOutcome => ({
    ok: false,
    error: `${msg} (환불건 ${refundId} 은 환불관리에서 이어서 처리할 수 있습니다.)`,
  });

  const { data: refundItems, error: riErr } = await adminClient
    .from("refund_items")
    .select("refund_item_id, order_item_id")
    .eq("refund_id", refundId);
  if (riErr) return fail(riErr.message);
  const refundItemIdByOrderItem = new Map(
    (refundItems ?? []).map((r) => [r.order_item_id, r.refund_item_id]),
  );

  if (amounts.some((a) => !refundItemIdByOrderItem.has(a.orderItemId))) {
    return fail("접수된 환불 항목과 주문 항목이 맞지 않습니다.");
  }
  const saved = await saveRefundAmounts({
    refundId,
    amounts: amounts.map((a) => ({
      refundItemId: refundItemIdByOrderItem.get(a.orderItemId) ?? "",
      finalKrw: a.finalKrw,
      pointReturnKrw: a.pointReturnKrw,
    })),
    shippingRefundKrw,
    couponRestored: false,
    refundMethod: input.refund.method,
    actorId: input.actorId,
    actorRole: input.actorRole,
  });
  if (!saved.ok) return fail(saved.error);

  const cancelledAt = new Date().toISOString();
  const pg = await savePgCancel({
    refundId,
    cancelKrw: refundKrw,
    cancelKind: "full",
    cancelledAt,
    transactionNo: evidenceNo,
    operatorId: input.actorId,
  });
  if (!pg.ok) return fail(pg.error);

  // 상태 전이 — 적법성은 반드시 checkRefundTransition(TS 상태기계)이 판정한 뒤 옮긴다.
  const ctx: RefundTransitionContext = {
    originalPaidKrw: order.totalKrw,
    priorRefundedKrw: order.priorRefundedKrw,
    thisRefundKrw: refundKrw,
    pg: {
      cancelKrw: refundKrw,
      cancelledAt,
      transactionNo: evidenceNo,
      operatorId: input.actorId,
    },
    actorIsAdmin: true,
    editReason: input.reason,
  };
  for (let i = 1; i < REFUND_SHORTCUT_PATH.length; i++) {
    const from = REFUND_SHORTCUT_PATH[i - 1];
    const to = REFUND_SHORTCUT_PATH[i];
    const check = checkRefundTransition(from, to, ctx);
    if (!check.ok) return fail(check.error);
    const moved = await setRefundStatus({
      refundId,
      status: to,
      actorId: input.actorId,
      memo: input.reason,
    });
    if (!moved.ok) return fail(moved.error);
  }

  const committed = await commitRefund({
    refundId,
    actorId: input.actorId,
    memo: input.reason,
  });
  if (!committed.ok) return fail(committed.error);

  // ★확정 커밋(revokeItemFulfillment + commit_refund)은 강의 수강권(enrollments)·연장 일수·재고·
  //   배송·포인트·쿠폰만 회수한다. 구독형 플랜(subject/bundle/membership)의 user_subscriptions 는
  //   토스 CANCELED 웹훅만 해지하는데, 이 단축은 PG 호출 0 이라 웹훅이 오지 않는다(무통장은
  //   애초에 없다). 회수됐다고 단정하지 말고 그 항목이 있으면 운영자에게 알린다.
  const [after, hasSubscriptionItems] = await Promise.all([
    readOrderStatus(orderId),
    hasSubscriptionPlanItems(orderId),
  ]);
  const subscriptionNotice = hasSubscriptionItems
    ? " ★구독형(과목·번들·회원제) 수강권은 이 처리가 회수하지 않습니다 — 수강권 관리에서 별도로 종료해 주세요."
    : "";
  return {
    ok: true,
    toStatus: after ?? "refunded",
    refundId,
    detail: `환불완료로 정리했습니다 — ${won(refundKrw)}(${REFUND_METHOD_LABELS[input.refund.method]}), 환불건 ${refundId}. 강의 수강권·재고·포인트·정산 반영은 확정 커밋이 처리했습니다.${subscriptionNotice}`,
  };
}

/** 확정 커밋이 회수하지 않는 구독형(과목/번들/회원제) 플랜 항목이 주문에 있는가. */
async function hasSubscriptionPlanItems(orderId: string): Promise<boolean> {
  const { data } = await adminClient
    .from("order_items")
    .select(
      "order_item_id, plan:subscription_plans!order_items_plan_id_fkey(product_kind)",
    )
    .eq("order_id", orderId)
    .eq("item_type", "plan");
  return (data ?? []).some((r) => {
    const kind = (r.plan as { product_kind: string } | null)?.product_kind;
    return kind != null && !isLectureProductKind(kind);
  });
}

// ── 진입점 ────────────────────────────────────────────────────────────────

/**
 * 관리자 주문 상태 액션 실행. 호출부(action)가 manager+직무 게이트를 통과한 뒤 부른다.
 *
 * ① orders 를 읽고 ② allowedAdminOrderActions 로 **서버가 다시 판정** ③ 원장 전용 액션은
 * roleAtLeast(admin) ④ 사유 trim 후 최소 글자수 ⑤ 실행 ⑥ 성공 시 order_status_logs +
 * audit_logs. 실행 중 예외는 {ok:false} 로 감싼다(지급 헬퍼가 throw 할 수 있다).
 */
export async function applyAdminOrderAction(input: {
  orderId: string;
  action: AdminOrderAction;
  reason: string;
  actorId: string;
  /** getStaffRole 결과(UserRole | null) 또는 문자열 — 여기서 UserRole 로 좁힌다. */
  actorRole: string | null;
  refund?: { refundKrw: number; evidenceNo: string; method: "bank" | "etc" };
}): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (reason.length < MIN_ORDER_STATUS_REASON_LENGTH) {
    return {
      ok: false,
      error: `변경 사유를 ${MIN_ORDER_STATUS_REASON_LENGTH}자 이상 입력해 주세요.`,
    };
  }
  const actorRole = asUserRole(input.actorRole);
  if (
    ADMIN_ONLY_ORDER_ACTIONS.includes(input.action) &&
    !roleAtLeast(actorRole, "admin")
  ) {
    return {
      ok: false,
      error: `「${ADMIN_ORDER_ACTION_LABEL[input.action]}」 처리는 원장만 할 수 있습니다.`,
    };
  }

  const { data: order, error: readErr } = await adminClient
    .from("orders")
    .select(
      "order_id, status, payment_method, archived_at, user_id, total_krw, created_at",
    )
    .eq("order_id", input.orderId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!order) return { ok: false, error: "주문을 찾을 수 없습니다." };

  const allowed = allowedAdminOrderActions({
    status: order.status,
    paymentMethod: order.payment_method,
    archivedAt: order.archived_at,
  });
  if (!allowed.includes(input.action)) {
    return {
      ok: false,
      error: `현재 상태(${adminOrderStatusLabel(order.status)})에서는 「${ADMIN_ORDER_ACTION_LABEL[input.action]}」 처리를 할 수 없습니다.`,
    };
  }

  let outcome: ActionOutcome;
  try {
    switch (input.action) {
      case "confirm_deposit":
        outcome = await runConfirmDeposit({
          order,
          actorId: input.actorId,
          reason,
        });
        break;
      case "cancel":
        outcome = await runCancel({ order, reason });
        break;
      case "reopen_deposit":
        outcome = await runReopenDeposit({ order });
        break;
      case "refund_complete":
        outcome = await runRefundComplete({
          order,
          actorId: input.actorId,
          actorRole,
          reason,
          refund: input.refund,
        });
        break;
      case "archive":
      case "unarchive":
        outcome = await runArchive({ order, action: input.action });
        break;
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "처리 중 오류가 발생했습니다.",
    };
  }
  if (!outcome.ok) return outcome;

  // ── 이력 — 서버가 adminClient 로 직접 insert(트리거·GUC 방식 아님, D2) + audit_logs 미러 ──
  const { error: logErr } = await adminClient.from("order_status_logs").insert({
    order_id: order.order_id,
    from_status: order.status,
    to_status: outcome.toStatus,
    reason,
    actor_id: input.actorId,
  });
  await logAuditEvent({
    actorId: input.actorId,
    actorRole,
    action: AUDIT_ACTION,
    entityType: "order",
    entityId: order.order_id,
    metadata: {
      action: input.action,
      from: order.status,
      to: outcome.toStatus,
      reason,
      ...(outcome.refundId ? { refundId: outcome.refundId } : {}),
    },
  });
  // 처리는 끝났으므로 성공으로 돌려주되, 이력이 안 남은 것은 숨기지 않는다.
  return {
    ok: true,
    detail: logErr
      ? `${outcome.detail} ★이력 저장 실패: ${logErr.message}`
      : outcome.detail,
  };
}

/**
 * 주문별 상태 변경 이력(최신순) — 처리자 이름은 profiles 배치 조인(★타 사용자 조회 = adminClient).
 * ★orderIds 는 여기서 잘라 조회한다 — 호출부 상한(200)을 단일 `.in()` 에 실으면 URL 길이 초과 400.
 *   같은 order_id 는 같은 배치에 있으므로 배치 내 created_at desc 가 곧 주문별 정렬이다.
 */
export async function listOrderStatusLogs(
  orderIds: string[],
): Promise<Map<string, OrderStatusLogRow[]>> {
  const out = new Map<string, OrderStatusLogRow[]>();
  if (!orderIds.length) return out;
  const chunks: string[][] = [];
  for (let i = 0; i < orderIds.length; i += LOG_QUERY_BATCH_SIZE) {
    chunks.push(orderIds.slice(i, i + LOG_QUERY_BATCH_SIZE));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      adminClient
        .from("order_status_logs")
        .select(
          "log_id, order_id, from_status, to_status, reason, created_at, actor:profiles!order_status_logs_actor_id_fkey(name)",
        )
        .in("order_id", chunk)
        .order("created_at", { ascending: false }),
    ),
  );
  for (const { data, error } of results) {
    if (error) throw error;
    for (const r of data ?? []) {
      const rows = out.get(r.order_id) ?? [];
      rows.push({
        logId: r.log_id,
        fromStatus: r.from_status,
        toStatus: r.to_status,
        reason: r.reason,
        actorName: (r.actor as { name: string | null } | null)?.name ?? null,
        createdAt: r.created_at,
      });
      out.set(r.order_id, rows);
    }
  }
  return out;
}
