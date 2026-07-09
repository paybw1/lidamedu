// 강의 플랫폼 다건 결제 개시(클라이언트) — 장바구니 결제·도서 바로구매 공용.
// /api/payments/create-cart-order(서버 가격 재검증) → 토스 requestPayment.
import type { CartItem } from "./cart";

export async function startCartCheckout(
  items: CartItem[],
  tossClientKey: string,
  failPath: string,
  couponCode?: string,
): Promise<void> {
  if (items.length === 0) return;
  const fd = new FormData();
  fd.append("items", JSON.stringify(items));
  if (couponCode) fd.append("couponCode", couponCode);
  const res = await fetch("/api/payments/create-cart-order", {
    method: "POST",
    body: fd,
  });
  const json = (await res.json()) as {
    ok?: boolean;
    orderId?: string;
    amount?: number;
    orderName?: string;
    error?: string;
  };
  if (!json.ok || !json.orderId) {
    alert(`결제 준비에 실패했습니다: ${json.error ?? "알 수 없는 오류"}`);
    return;
  }
  try {
    const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
    const tossPayments = await loadTossPayments(tossClientKey);
    const payment = tossPayments.payment({ customerKey: json.orderId });
    await payment.requestPayment({
      method: "CARD",
      amount: { currency: "KRW", value: json.amount ?? 0 },
      orderId: json.orderId,
      orderName: json.orderName ?? "리담 강의",
      successUrl: `${window.location.origin}/api/payments/toss/confirm`,
      failUrl: `${window.location.origin}${failPath}`,
    });
  } catch (e) {
    alert(
      `결제 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
