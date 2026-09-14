// 강의 플랫폼 다건 결제 개시(클라이언트) — 장바구니 결제·도서 바로구매 공용.
// /api/payments/create-cart-order(서버 가격 재검증) → 토스 requestPayment.
import { toast } from "sonner";

import {
  cancelPendingCheckout,
  isTossUserCancel,
} from "~/features/subscriptions/lib/cancel-pending-checkout.client";

import { paymentFailPath } from "~/features/orders/lib/payment-return";

import { markCheckoutPending, type CartItem } from "./cart";

export async function startCartCheckout(
  items: CartItem[],
  tossClientKey: string,
  /** 실패 시 돌아올 **경로만** 넘긴다 — 파라미터는 payment-return.ts 가 붙인다. */
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
    // ★서버가 만든 사유가 그대로 온다(재고 부족·판매 종료·한도 초과 등) — 지우지 말 것.
    toast.error(json.error ?? "결제를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return;
  }
  // ★결제한 항목만 복귀 시 지우기 위한 표식(장바구니를 통째로 비우지 않는다).
  markCheckoutPending(items);
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
      failUrl: `${window.location.origin}${paymentFailPath(failPath)}`,
    });
  } catch (e) {
    // 결제창 취소·오류 — 남은 pending 결제 정리 후 취소는 조용히.
    cancelPendingCheckout(json.orderId);
    if (!isTossUserCancel(e)) {
      toast.error(
        `결제 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
