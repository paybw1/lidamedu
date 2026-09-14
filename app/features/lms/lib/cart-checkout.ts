// 강의 플랫폼 다건 결제 개시(클라이언트) — 장바구니 결제·도서 바로구매 공용.
// /api/payments/create-cart-order(서버 가격 재검증) → 토스 requestPayment 또는 입금 안내.
//
// ★feat-11-012 P5-d·P5-e — 결제수단이 둘(카드·무통장)이 되고 실물 도서에는 배송지가
//   붙었다. 그 둘을 **여기서 갈라 태우지 않는다** — 이 함수는 서버가 내준 답을 따라갈 뿐이고,
//   무엇을 받을지 묻는 일은 결제 시트(checkout-sheet)가, 무엇이 유효한지 정하는 일은
//   서버 액션이 한다. 셋을 섞으면 경로가 늘 때마다 규칙이 복제된다.
import { toast } from "sonner";

import {
  cancelPendingCheckout,
  isTossUserCancel,
} from "~/features/subscriptions/lib/cancel-pending-checkout.client";
import type { ShippingAddress } from "~/features/orders/lib/shipping-address";

import { paymentFailPath } from "~/features/orders/lib/payment-return";

import { clearPurchasedItems, markCheckoutPending, type CartItem } from "./cart";

export interface CheckoutOptions {
  /** 기본 카드(토스). */
  method?: "toss" | "bank_transfer";
  /** 무통장일 때만 — 입금자명. */
  depositorName?: string;
  /** 실물 도서가 있을 때만 — 주문 시점 배송지. */
  shipping?: ShippingAddress | null;
  couponCode?: string;
  /**
   * 포인트 사용액(원). 1P=1원 (feat-11-013 D15).
   *
   * ★서버가 다시 검증한다 — 화면의 검사는 친절함이고 권위가 아니다(이 파일 머리 주석).
   * ★무통장은 v1 에서 포인트를 못 쓴다. 시트가 안 보내고 서버도 거절한다 — 되돌릴 훅이
   *   없어 예약한 포인트가 72시간 넘게 묶이거나 영영 사라지기 때문이다.
   */
  pointAmountKrw?: number;
}

export async function startCartCheckout(
  items: CartItem[],
  tossClientKey: string,
  /** 실패 시 돌아올 **경로만** 넘긴다 — 파라미터는 payment-return.ts 가 붙인다. */
  failPath: string,
  options: CheckoutOptions = {},
): Promise<void> {
  if (items.length === 0) return;
  const method = options.method ?? "toss";
  const fd = new FormData();
  fd.append("items", JSON.stringify(items));
  fd.append("method", method);
  if (options.couponCode) fd.append("couponCode", options.couponCode);
  if (options.depositorName) fd.append("depositorName", options.depositorName);
  if (options.shipping) fd.append("shipping", JSON.stringify(options.shipping));
  // ★무통장이면 값이 있어도 보내지 않는다 — 숨기기만 하면 시트 상태가 남아 딸려 나간다.
  if (method === "toss" && (options.pointAmountKrw ?? 0) > 0) {
    fd.append("pointAmountKrw", String(options.pointAmountKrw));
  }
  const res = await fetch("/api/payments/create-cart-order", {
    method: "POST",
    body: fd,
  });
  const json = (await res.json()) as {
    ok?: boolean;
    method?: "toss" | "bank_transfer";
    orderId?: string;
    amount?: number;
    orderName?: string;
    expiresAt?: string;
    error?: string;
  };
  if (!json.ok || !json.orderId) {
    // ★서버가 만든 사유가 그대로 온다(재고 부족·판매 종료·한도 초과·배송지 오류 등) — 지우지 말 것.
    toast.error(json.error ?? "결제를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return;
  }
  // ★결제한 항목만 복귀 시 지우기 위한 표식(장바구니를 통째로 비우지 않는다).
  markCheckoutPending(items);

  if (json.method === "bank_transfer") {
    // ★무통장은 **결제 복귀 경로가 없다.** 카드는 결제창에서 돌아올 때 표식을 소모해
    //   장바구니를 정리하는데(P5-a), 무통장은 돌아오는 일이 없어 표식이 영영 남는다 —
    //   주문은 만들어졌는데 장바구니에는 그 책이 그대로 있게 된다. 그래서 여기서 바로 소모한다.
    clearPurchasedItems();
    // 주문은 이미 「입금 대기」로 만들어졌으므로 안내 화면으로 보낸다. 여기서 토스를
    // 부르면(또는 아무 데도 안 보내면) 학생은 계좌를 못 보고 끝난다.
    window.location.assign(`/lecture/orders/${json.orderId}/deposit`);
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
