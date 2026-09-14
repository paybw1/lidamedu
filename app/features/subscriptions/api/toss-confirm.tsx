// 토스 결제 성공 콜백 (successUrl).
// 토스가 GET ?paymentKey=...&orderId=...&amount=... 로 호출.
// 서버에서 confirm API 호출 + payment·subscription 갱신 + /me/subscription 으로 redirect.

import { data, redirect } from "react-router";

import { PAYMENT_RETURN } from "~/features/orders/lib/payment-return";
import {
  confirmPayment,
  getPaymentSurface,
} from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/toss-confirm";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const paymentKey = url.searchParams.get("paymentKey");
  const orderId = url.searchParams.get("orderId");
  const amountStr = url.searchParams.get("amount");

  if (!paymentKey || !orderId || !amountStr) {
    return data(
      { error: "필수 파라미터 누락 (paymentKey/orderId/amount)" },
      { status: 400 },
    );
  }
  const amountKrw = Number(amountStr);
  if (!Number.isFinite(amountKrw) || amountKrw < 0) {
    return data({ error: "amount 형식 오류" }, { status: 400 });
  }

  // ★어느 플랫폼의 결제인지 먼저 본다 — 실패·가상계좌 복귀 주소가 갈린다(feat-11-012 P5).
  const surface = await getPaymentSurface(orderId);
  const home = surface === "lecture" ? "/lecture" : "/me/subscription";

  const res = await confirmPayment({
    tossOrderId: orderId,
    tossPaymentKey: paymentKey,
    amountKrw,
  });
  if (!res.ok) {
    const params = new URLSearchParams({
      [PAYMENT_RETURN.failed]: "1",
      [PAYMENT_RETURN.message]: res.error.slice(0, 200),
    });
    throw redirect(`${home}?${params.toString()}`);
  }
  // 가상계좌 — 입금 전이라 구독 미활성. 입금 완료는 토스 웹훅이 반영.
  if ("pendingDeposit" in res) {
    throw redirect(`${home}?${PAYMENT_RETURN.deposit}=1`);
  }
  // feat-11 — 강의/도서(주문 fulfill=enrollment·배송) 결제는 강의 플랫폼으로 복귀.
  //   ★복귀 시 비우는 것은 **결제한 항목만**이다(cart.ts clearPurchasedItems) —
  //     종전에는 장바구니를 통째로 비워, 담아둔 다른 항목까지 사라졌다.
  if ("fulfilledOrder" in res) {
    throw redirect(`/lecture?${PAYMENT_RETURN.paid}=1`);
  }
  throw redirect("/me/subscription?paid=1");
}
