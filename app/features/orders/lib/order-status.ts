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
//   뜻이 다르므로 합치지 않는다 — 여기 있는 것은 **학생 대면 표기**다.

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
