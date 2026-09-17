// 주문 상태 — 학생에게 보일 말 (feat-11-012 P6-c). 서버 전용 아님.
//
// ★고치기 전 증상: 상태 표시명이 화면마다 따로 적혀 있었고, 학생 화면의 표가
//   **서버가 실제로 쓰는 값을 전부 담고 있지 않았다.** 못 담은 값은 `?? o.status` 폴백으로
//   **원시 영문이 그대로** 학생에게 나갔다.
//
// ★구조적으로 닫는 장치는 모듈이 아니라 **타입**이다. orders.status 는 Postgres enum 이
//   아니라 text 라서 생성 타입(database.types.ts)에서 후보를 못 얻는다. 그래서
//   ① 서버가 실제로 쓰는 값을 여기 배열로 세우고 ② 그 배열에서 타입을 뽑아
//   ③ 표를 `Record<OrderStatus, …>` 로 선언한다 — 값을 하나 추가하면서 문구를 빠뜨리면
//   **컴파일이 깨진다.** 폴백을 쓸 수 없게 만드는 것이 요점이다.
//
// ★상품명(주문 항목) 표시명 SSOT 는 따로 있다 — `./order-item-label`(feat-11-011 D4).
//   이 파일은 **상태어**만 소유한다.
// ★운영자 화면은 같은 값에 다른 말을 쓴다(draft = 학생 「임시」 vs 운영자 「장바구니」).
//   뜻이 다르므로 합치지 않는다 — 학생 대면 표(ORDER_STATUS)와 운영자 표
//   (ADMIN_ORDER_STATUS_LABEL)를 **따로** 둔다. 다만 둘 다 `Record<OrderStatus, …>` 로
//   같은 타입에 묶어, 값이 늘면 두 표 모두 컴파일이 깨진다(feat-11-014 Q1 —
//   종전 admin-orders.tsx 의 untyped 표는 여기로 옮겼다).
// ★운영자 상태 변경 셀렉트의 전이 규칙(allowedAdminOrderActions)도 여기 있다 —
//   화면이 option 활성/비활성에 쓰고, 서버(order-status-admin.server.ts)가 **같은 함수로
//   재판정**한다. 두 곳에 표를 두면 반드시 어긋난다.

/**
 * orders.status 의 허용값 전체 — DB CHECK 제약(20260903_order_attempt_status.sql)과 일치.
 * ★순서는 주문의 생애 흐름 순이다.
 */
export const ORDER_STATUSES = [
  "draft", // 장바구니 예약(현재 미사용)
  "attempted", // 결제창까지 갔으나 미확정
  "pending_payment", // (레거시 default) 결제 대기
  "pending_deposit", // 무통장 입금 대기
  "paid",
  "partially_refunded",
  "refunded",
  "cancelled",
  "failed",
  "expired", // 결제시도 TTL 경과
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type StatusTone = "ok" | "warn" | "muted" | "bad";

/** ★값을 추가하면 여기도 채워야 컴파일된다 — 원시코드 노출이 구조적으로 막힌다. */
const ORDER_STATUS: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "임시", tone: "muted" },
  attempted: { label: "결제 진행 중", tone: "warn" },
  pending_payment: { label: "결제 대기", tone: "warn" },
  pending_deposit: { label: "입금 대기", tone: "warn" },
  paid: { label: "결제 완료", tone: "ok" },
  partially_refunded: { label: "부분 환불", tone: "muted" },
  refunded: { label: "환불 완료", tone: "muted" },
  cancelled: { label: "취소", tone: "muted" },
  failed: { label: "결제 실패", tone: "bad" },
  expired: { label: "기한 만료", tone: "muted" },
};

function asOrderStatus(v: string): OrderStatus | null {
  return (ORDER_STATUSES as readonly string[]).includes(v)
    ? (v as OrderStatus)
    : null;
}

/** 상태 표시명. ★모르는 값이어도 원시코드를 내보내지 않는다. */
export function orderStatusLabel(status: string): string {
  const s = asOrderStatus(status);
  return s ? ORDER_STATUS[s].label : "확인 중";
}

export function orderStatusTone(status: string): StatusTone {
  const s = asOrderStatus(status);
  return s ? ORDER_STATUS[s].tone : "muted";
}

/**
 * 학생 주문·결제 목록에서 **감출** 상태 — feat-11-011 D3.
 * 결제창까지만 갔다가 끝난 건은 학생에게 「주문」이 아니다. 라벨만 붙이고 목록에 남기면
 * 결제하지 않은 건이 내역에 쌓여 보인다.
 */
export const HIDDEN_FROM_STUDENT: readonly OrderStatus[] = [
  "draft",
  "attempted",
  "pending_payment",
  "expired",
];

/** PostgREST `.not("status","in", …)` 에 넣을 문자열. */
export const HIDDEN_FROM_STUDENT_FILTER = `(${HIDDEN_FROM_STUDENT.join(",")})`;

// ── 결제수단 ────────────────────────────────────────────────────────────
// orders.payment_method CHECK(20260709_lms_m4a_orders.sql) = toss / bank_transfer / free / manual.
// ★종전 학생 화면 표에는 `manual` 이 없어 원시 영문이 나갔고, 도메인에 없는 `card` 가 남아 있었다.

export const PAYMENT_METHODS = [
  "toss",
  "bank_transfer",
  "free",
  "manual",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  toss: "카드·간편결제",
  bank_transfer: "무통장 입금",
  free: "무료",
  manual: "운영자 처리",
};

export function paymentMethodLabel(method: string | null): string {
  if (!method) return "-";
  return (PAYMENT_METHODS as readonly string[]).includes(method)
    ? PAYMENT_METHOD_LABEL[method as PaymentMethod]
    : "-";
}

/** 무통장 입금 주문의 `orders.payment_method` 값 — bank-transfer.server.ts 가 넣는 값. */
export const BANK_TRANSFER_PAYMENT_METHOD: PaymentMethod = "bank_transfer";

// ── 운영자 표기 (feat-11-014 Q1) ──────────────────────────────────────────
// ★학생 표와 같은 값에 다른 말을 쓴다(draft = 「장바구니」, attempted = 「결제시도」).
//   Record<OrderStatus, …> 로 고정 — 값이 늘면 여기서 컴파일이 깨진다.

export const ADMIN_ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "장바구니",
  attempted: "결제시도",
  pending_payment: "결제 대기",
  pending_deposit: "입금 대기",
  paid: "결제 완료",
  partially_refunded: "부분 환불",
  refunded: "환불",
  cancelled: "취소",
  failed: "실패",
  expired: "만료",
};

export type AdminStatusTone =
  | "emerald"
  | "amber"
  | "coral"
  | "neutral"
  | "violet";

export const ADMIN_ORDER_STATUS_TONE: Record<OrderStatus, AdminStatusTone> = {
  draft: "neutral",
  attempted: "neutral",
  pending_payment: "amber",
  pending_deposit: "amber",
  paid: "emerald",
  partially_refunded: "violet",
  refunded: "coral",
  cancelled: "neutral",
  failed: "neutral",
  expired: "neutral",
};

/** 운영자 상태 표시명. 모르는 값이어도 원시코드를 내보내지 않는다. */
export function adminOrderStatusLabel(status: string): string {
  const s = asOrderStatus(status);
  return s ? ADMIN_ORDER_STATUS_LABEL[s] : "확인 중";
}

// ── 운영자 상태 변경 셀렉트 (feat-11-014 D1) ──────────────────────────────
// ★셀렉트 값은 「상태」가 아니라 **보호된 경로**다 — 값만 바꾸면 돈·수강권·정산이 어긋난다
//   (docs/features/feat-11-014 §0). 각 액션이 실제로 무엇을 실행하는지는 서버 파일이 갖고,
//   여기는 **어느 상태에서 무엇이 허용되는가**만 갖는다.

export const ADMIN_ORDER_ACTIONS = [
  "reopen_deposit", // 무통장 재접수: cancelled/expired → pending_deposit + 기한 재설정
  "confirm_deposit", // 무통장 입금 확인: pending_deposit → paid + 지급
  "cancel", // 미결제 주문 취소 + 포인트 반환 (★paid 계열 불허 — 환불 경로로만)
  "refund_complete", // 환불관리 수동 종결 단축(원장 전용, PG 호출 0)
  "archive", // 보관(목록에서 숨김) — status 가 아니라 archived_at
  "unarchive",
] as const;

export type AdminOrderAction = (typeof ADMIN_ORDER_ACTIONS)[number];

/** 셀렉트 option 라벨 — 원장 결정 A1(「주문접수」 대신 기존 「입금대기」)·A2(「삭제」 대신 「보관」). */
export const ADMIN_ORDER_ACTION_LABEL: Record<AdminOrderAction, string> = {
  reopen_deposit: "입금대기",
  confirm_deposit: "결제완료",
  cancel: "취소",
  refund_complete: "환불완료",
  archive: "보관",
  unarchive: "보관 해제",
};

/** 원장(admin)만 실행할 수 있는 액션 — 환불 확정 게이트(refund-gate.server.ts)와 같은 문. */
export const ADMIN_ONLY_ORDER_ACTIONS: readonly AdminOrderAction[] = [
  "refund_complete",
];

/** 상태 변경 사유 최소 글자수(D2 — zod min 2). 다이얼로그·서버가 같은 값을 본다. */
export const MIN_ORDER_STATUS_REASON_LENGTH = 2;

// ── 이력(order_status_logs)의 to_status 에 들어가는 비-status 값 ──────────────
// 보관/보관 해제는 status 전이가 아니라 archived_at 이지만 같은 이력 표에 남긴다(db-schema.md).
// ★서버가 쓰는 값과 화면이 읽는 라벨을 **한 곳**에 둔다 — 두 곳에 문자열을 손으로 복제하면
//   어긋난 행이 「확인 중」 폴백으로 조용히 떨어진다.

export const ARCHIVE_LOG_STATUS = {
  archive: "archived",
  unarchive: "unarchived",
} as const;

export type ArchiveLogStatus =
  (typeof ARCHIVE_LOG_STATUS)[keyof typeof ARCHIVE_LOG_STATUS];

export const ARCHIVE_LOG_STATUS_LABEL: Record<ArchiveLogStatus, string> = {
  archived: "보관",
  unarchived: "보관 해제",
};

function asArchiveLogStatus(v: string): ArchiveLogStatus | null {
  return Object.hasOwn(ARCHIVE_LOG_STATUS_LABEL, v)
    ? (v as ArchiveLogStatus)
    : null;
}

/** 이력 행(from/to)의 표시명 — 보관 값이면 그 라벨, 아니면 운영자 상태 표시명. null 은 「—」. */
export function orderStatusLogLabel(status: string | null): string {
  if (!status) return "—";
  const a = asArchiveLogStatus(status);
  return a ? ARCHIVE_LOG_STATUS_LABEL[a] : adminOrderStatusLabel(status);
}

/** 보관 가능 = 비결제 상태만. paid/partially_refunded/refunded 는 돈이 걸려 있어 숨기지 않는다. */
export const ARCHIVABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "draft",
  "attempted",
  "pending_payment",
  "expired",
  "cancelled",
  "failed",
];

/** 무통장 재접수(입금대기 복귀)가 가능한 출발 상태. */
export const REOPENABLE_DEPOSIT_STATUSES: readonly OrderStatus[] = [
  "cancelled",
  "expired",
];

/** 관리자 단건 취소가 가능한 출발 상태 — 돈을 받지 않은 주문만. */
export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending_deposit",
  "pending_payment",
  "attempted",
];

/** 환불완료 단축이 가능한 출발 상태 — 돈을 받은 주문만. */
export const REFUND_COMPLETABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "paid",
  "partially_refunded",
];

/**
 * 현재 주문에서 허용되는 액션 — ADMIN_ORDER_ACTIONS 순서로 돌려준다(option 순서가 흔들리지 않게).
 *
 * ★순수 함수. 화면은 option 활성/비활성에, 서버는 요청을 **다시 판정**하는 데 같은 함수를 쓴다.
 * ★보관 여부는 재접수·보관에만 걸린다 — 보관된 건이라도 입금 확인·취소·환불 정리는 막지 않는다
 *   (보관은 「목록에서 숨김」이지 잠금이 아니다).
 */
export function allowedAdminOrderActions(o: {
  status: string;
  paymentMethod: string | null;
  archivedAt: string | null;
}): AdminOrderAction[] {
  const archived = o.archivedAt != null;
  const s = asOrderStatus(o.status);
  if (!s) return archived ? ["unarchive"] : [];
  const isBank = o.paymentMethod === BANK_TRANSFER_PAYMENT_METHOD;
  const rules: Record<AdminOrderAction, boolean> = {
    reopen_deposit:
      isBank && REOPENABLE_DEPOSIT_STATUSES.includes(s) && !archived,
    confirm_deposit: isBank && s === "pending_deposit",
    cancel: CANCELLABLE_ORDER_STATUSES.includes(s),
    refund_complete: REFUND_COMPLETABLE_ORDER_STATUSES.includes(s),
    archive: ARCHIVABLE_ORDER_STATUSES.includes(s) && !archived,
    unarchive: archived,
  };
  return ADMIN_ORDER_ACTIONS.filter((a) => rules[a]);
}
