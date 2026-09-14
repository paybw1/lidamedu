// feat-11-013 P6 — 환불 처리상태 12값과 전이 규칙 (요청서 PART B §4·§6·§8·§10, 설계 D11).
//
// ★DB 접근 0. 입력은 값 묶음, 출력은 판정. 화면·액션·RPC 가 모두 이 한 곳을 본다.
//   상태 문자열의 권위는 DB 의 refunds_status_check 이고, **사람이 읽는 라벨의 권위는 여기**다.
//
// ★전이를 switch 로 쓰지 않는다 — 12×12 는 분기로 적으면 읽을 수 없고, 빠진 칸이 보이지 않는다.
//   표로 두면 「어디서 어디로 갈 수 있는가」가 한눈에 보이고 테스트가 표 자체를 검사한다.

export const REFUND_STATUSES = [
  "received",
  "reviewing",
  "need_info",
  "awaiting_return",
  "amount_fixed",
  "pg_pending",
  "pg_done",
  "partial_done",
  "full_done",
  "rejected",
  "withdrawn",
  "error",
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  received: "환불접수",
  reviewing: "검토중",
  need_info: "추가확인 필요",
  awaiting_return: "반품대기",
  amount_fixed: "환불금액 확정",
  pg_pending: "PG 취소대기",
  pg_done: "PG 취소완료·내부처리대기",
  partial_done: "부분환불완료",
  full_done: "전체환불완료",
  rejected: "환불반려",
  withdrawn: "환불철회",
  error: "처리오류",
};

/** 종결 상태 — 더 진행되지 않고, refunds.closed_at 이 선다(DB 트리거). */
export const TERMINAL_REFUND_STATUSES = [
  "partial_done",
  "full_done",
  "rejected",
  "withdrawn",
] as const satisfies readonly RefundStatus[];

/**
 * ★돈이 이미 나간 종결 — 되돌리려면 원장 권한과 사유가 필요하다(요청서 §10
 * 「환불완료 후 금액 수정 제한 / 수정 필요 시 원장 권한과 수정사유 필수」).
 * 반려·철회는 돈이 움직이지 않았으므로 일반 담당자가 되돌릴 수 있다.
 */
const MONEY_MOVED_STATUSES = ["partial_done", "full_done"] as const satisfies readonly RefundStatus[];

export function isTerminalRefundStatus(status: RefundStatus): boolean {
  return (TERMINAL_REFUND_STATUSES as readonly RefundStatus[]).includes(status);
}

export function isMoneyMovedStatus(status: RefundStatus): boolean {
  return (MONEY_MOVED_STATUSES as readonly RefundStatus[]).includes(status);
}

export const REFUND_INTAKE_CHANNELS = ["phone", "kakao", "board", "visit", "etc"] as const;
export type RefundIntakeChannel = (typeof REFUND_INTAKE_CHANNELS)[number];
export const REFUND_INTAKE_CHANNEL_LABELS: Record<RefundIntakeChannel, string> = {
  phone: "전화",
  kakao: "카카오톡",
  board: "게시판",
  visit: "방문",
  etc: "기타",
};

export const REFUND_METHODS = ["original", "bank", "etc"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];
export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  original: "원결제수단 취소",
  bank: "계좌환불",
  etc: "기타",
};

/**
 * 전이표 — 요청서 §4 의 처리순서가 주 경로이고, 되돌리기는 **돈이 움직이기 전까지만** 열려 있다.
 *
 *   접수 → 검토중 → (추가확인 | 반품대기) → 금액확정 → PG 취소대기 → PG 취소완료 → 부분/전체완료
 *
 * ★`pg_done` 에서 앞으로 되돌아가는 칸이 없다 — 그 시점에 토스에서 **돈이 이미 나갔다.**
 *   금액을 다시 만지려면 종결 후 원장 권한으로 열거나 새 환불건을 접수한다.
 * ★`error`(처리오류)는 종결이 아니다. 후속처리가 중간에 깨진 자리이므로 어느 단계로든 복귀한다.
 */
export const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  received: ["reviewing", "need_info", "rejected", "withdrawn", "error"],
  reviewing: ["need_info", "awaiting_return", "amount_fixed", "rejected", "withdrawn", "error"],
  need_info: ["reviewing", "awaiting_return", "amount_fixed", "rejected", "withdrawn", "error"],
  awaiting_return: ["reviewing", "need_info", "amount_fixed", "rejected", "withdrawn", "error"],
  amount_fixed: [
    "reviewing",
    "need_info",
    "awaiting_return",
    "pg_pending",
    "rejected",
    "withdrawn",
    "error",
  ],
  pg_pending: ["amount_fixed", "pg_done", "withdrawn", "error"],
  pg_done: ["partial_done", "full_done", "error"],
  partial_done: ["reviewing", "error"],
  full_done: ["reviewing", "error"],
  rejected: ["reviewing", "withdrawn"],
  withdrawn: ["reviewing"],
  error: ["reviewing", "amount_fixed", "pg_pending", "pg_done", "rejected", "withdrawn"],
};

/** 토스 취소결과 4값 — 요청서 §6 「다음 값이 없으면 환불완료 처리 불가」. */
export type PgCancelRecord = {
  cancelKrw: number | null;
  cancelledAt: string | null;
  transactionNo: string | null;
  operatorId: string | null;
};

export type RefundTransitionContext = {
  /** 최초 결제금액 — 원주문 실제 결제금액. */
  originalPaidKrw: number | null;
  /** 접수 시점의 기존 누적 환불액. */
  priorRefundedKrw: number | null;
  /** 이번 환불금액(확정액). */
  thisRefundKrw: number | null;
  /** 토스 취소결과. 아직 입력 전이면 null. */
  pg: PgCancelRecord | null;
  /** 되돌리기 권한 — 원장(admin)인가. */
  actorIsAdmin: boolean;
  /** 되돌리기 사유 — 돈이 나간 건을 되돌릴 때 필수. */
  editReason?: string | null;
};

export type RefundTransitionCheck = { ok: true } | { ok: false; error: string };

const label = (s: RefundStatus) => REFUND_STATUS_LABELS[s];

/** 토스 취소결과 4값이 다 찼는지 — 하나라도 비면 환불완료로 갈 수 없다. */
export function hasCompletePgRecord(pg: PgCancelRecord | null): boolean {
  if (!pg) return false;
  return (
    typeof pg.cancelKrw === "number" &&
    pg.cancelKrw > 0 &&
    !!pg.cancelledAt &&
    !!pg.transactionNo?.trim() &&
    !!pg.operatorId
  );
}

/**
 * 상태 전이 가능 여부. 표에 없는 칸이면 그것만으로 거부하고,
 * 표에 있으면 요청서 §6·§10 의 금액·증빙 가드를 추가로 건다.
 */
export function checkRefundTransition(
  from: RefundStatus,
  to: RefundStatus,
  ctx: RefundTransitionContext,
): RefundTransitionCheck {
  if (from === to) {
    return { ok: false, error: `이미 ${label(to)} 상태입니다.` };
  }
  if (!REFUND_TRANSITIONS[from].includes(to)) {
    return { ok: false, error: `${label(from)}에서 ${label(to)}(으)로는 바꿀 수 없습니다.` };
  }

  // ★돈이 나간 건을 되돌리기 — 원장 권한 + 사유 필수(요청서 §10).
  if (isMoneyMovedStatus(from)) {
    if (!ctx.actorIsAdmin) {
      return { ok: false, error: `${label(from)} 건은 원장만 되돌릴 수 있습니다.` };
    }
    if (!ctx.editReason?.trim()) {
      return { ok: false, error: `${label(from)} 건을 되돌리려면 수정사유가 필요합니다.` };
    }
  }

  const prior = ctx.priorRefundedKrw ?? 0;
  const original = ctx.originalPaidKrw;

  // 금액 확정 이후 단계로 가려면 이번 환불금액이 서 있어야 한다.
  if (to === "pg_pending" || to === "pg_done" || to === "partial_done" || to === "full_done") {
    if (typeof ctx.thisRefundKrw !== "number" || ctx.thisRefundKrw <= 0) {
      return { ok: false, error: "환불금액을 먼저 확정해 주세요." };
    }
    if (typeof original !== "number") {
      return { ok: false, error: "최초 결제금액이 없어 환불금액을 검증할 수 없습니다." };
    }
    // 요청서 §10 — 최초 결제금액을 초과하는 누적 환불 차단.
    if (prior + ctx.thisRefundKrw > original) {
      return {
        ok: false,
        error: `누적 환불액이 최초 결제금액을 넘습니다. 남은 환불 가능금액은 ${(
          original - prior
        ).toLocaleString("ko-KR")}원입니다.`,
      };
    }
  }

  // 요청서 §6 — 토스 취소결과가 다 차야 완료로 간다.
  if (to === "partial_done" || to === "full_done") {
    if (!hasCompletePgRecord(ctx.pg)) {
      return {
        ok: false,
        error: "토스 취소금액·취소일시·거래번호·처리담당자를 모두 입력해야 환불완료로 바꿀 수 있습니다.",
      };
    }
    // 전체/부분은 고르는 값이 아니라 **금액에서 나오는 값**이다.
    const isFull = prior + (ctx.thisRefundKrw ?? 0) === original;
    if (to === "full_done" && !isFull) {
      return { ok: false, error: "누적 환불액이 최초 결제금액과 같지 않아 전체환불완료로 바꿀 수 없습니다." };
    }
    if (to === "partial_done" && isFull) {
      return { ok: false, error: "환불금액이 결제금액 전액이므로 전체환불완료로 처리해야 합니다." };
    }
  }

  return { ok: true };
}

/** 이번 환불이 전액인지 — 화면이 완료 버튼의 목적지를 정할 때 쓴다. */
export function resolveDoneStatus(ctx: {
  originalPaidKrw: number | null;
  priorRefundedKrw: number | null;
  thisRefundKrw: number | null;
}): RefundStatus | null {
  if (typeof ctx.originalPaidKrw !== "number" || typeof ctx.thisRefundKrw !== "number") return null;
  const total = (ctx.priorRefundedKrw ?? 0) + ctx.thisRefundKrw;
  if (total > ctx.originalPaidKrw) return null;
  return total === ctx.originalPaidKrw ? "full_done" : "partial_done";
}

/** 남은 환불 가능금액 — 저장하지 않는 파생값(요청서 §6). */
export function remainingRefundableKrw(ctx: {
  originalPaidKrw: number | null;
  priorRefundedKrw: number | null;
}): number {
  if (typeof ctx.originalPaidKrw !== "number") return 0;
  return Math.max(0, ctx.originalPaidKrw - (ctx.priorRefundedKrw ?? 0));
}
