// 결제창 취소(사용자가 토스 창을 닫음) 시 서버의 pending 결제를 정리한다.
// best-effort — 실패해도 무시(재결제 시 create-order 가 이전 pending 을 자동 취소).
// keepalive 로 페이지 이탈 중에도 요청이 전송되게 한다.
export function cancelPendingCheckout(orderId: string): void {
  if (!orderId) return;
  const fd = new FormData();
  fd.append("orderId", orderId);
  void fetch("/api/payments/cancel-pending", {
    method: "POST",
    body: fd,
    keepalive: true,
  }).catch(() => {});
}

// 토스 SDK 가 사용자 결제창 취소 시 던지는 에러 코드 — 이 경우 오류 알림을 띄우지 않는다.
export function isTossUserCancel(e: unknown): boolean {
  const code =
    e && typeof e === "object" && "code" in e
      ? (e as { code?: unknown }).code
      : undefined;
  return code === "USER_CANCEL" || code === "PAY_PROCESS_CANCELED";
}
