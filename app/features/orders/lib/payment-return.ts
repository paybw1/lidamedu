// 결제 복귀 파라미터 — 이름의 단일 소스 (feat-11-012 P5).
//
// ★새 이름을 만들지 않았다. 실패 복귀 6곳 중 5곳이 이미 `failed=1` 이었고 성공은
//   `purchased=1`, 가상계좌는 `deposit=1`, 사유는 `msg` 였다 — 어긋난 곳은 수강연장
//   한 곳(`extFailed=1`)뿐이라 그것만 맞췄다.
// ★토스는 failUrl 에 `code`·`message` 를 **스스로 붙여 보낸다**. 즉 실패 사유가 이미
//   복귀 주소에 도착해 있었는데 **아무도 읽지 않았다** — 사용자는 결제창이 닫히고 튕겨
//   돌아왔는데 성공인지 실패인지 알 수 없었다.
// ★이 파일은 서버(toss-confirm)와 화면(PaymentResultNotice)이 함께 import 한다 —
//   `.server`·`.client` 를 일절 참조하지 않는 순수 모듈로 둔다.

/** 우리가 붙이는 파라미터. */
export const PAYMENT_RETURN = {
  paid: "purchased",
  failed: "failed",
  deposit: "deposit",
  message: "msg",
} as const;

/** 토스가 failUrl 에 덧붙이는 파라미터. */
const TOSS_CODE = "code";
const TOSS_MESSAGE = "message";

/** 표시한 뒤 주소에서 지울 것들 — 새로고침·뒤로가기에 알림이 되살아나지 않게. */
export const PAYMENT_RETURN_PARAMS: readonly string[] = [
  PAYMENT_RETURN.paid,
  PAYMENT_RETURN.failed,
  PAYMENT_RETURN.deposit,
  PAYMENT_RETURN.message,
  TOSS_CODE,
  TOSS_MESSAGE,
];

/** 결제 실패 시 돌아올 주소. 호출부는 경로만 넘긴다(파라미터는 여기서 붙인다). */
export function paymentFailPath(basePath: string): string {
  const sep = basePath.includes("?") ? "&" : "?";
  return `${basePath}${sep}${PAYMENT_RETURN.failed}=1`;
}

export type PaymentReturnKind = "paid" | "failed" | "deposit";

export interface PaymentReturn {
  kind: PaymentReturnKind;
  /** 실패 사유(토스 문구 또는 우리 문구). 없으면 null. */
  message: string | null;
}

export function readPaymentReturn(
  sp: URLSearchParams | { get(name: string): string | null },
): PaymentReturn | null {
  if (sp.get(PAYMENT_RETURN.paid) === "1") return { kind: "paid", message: null };
  if (sp.get(PAYMENT_RETURN.deposit) === "1") {
    return { kind: "deposit", message: null };
  }
  const ours = sp.get(PAYMENT_RETURN.failed) === "1";
  const tossCode = sp.get(TOSS_CODE);
  const tossMessage = sp.get(TOSS_MESSAGE);
  // 토스만의 경우는 code·message 가 **둘 다** 있을 때만 실패로 본다
  // (다른 화면이 쓰는 code 파라미터를 결제 실패로 오인하지 않게).
  if (ours || (tossCode && tossMessage)) {
    return {
      kind: "failed",
      message: sp.get(PAYMENT_RETURN.message) ?? tossMessage,
    };
  }
  return null;
}
