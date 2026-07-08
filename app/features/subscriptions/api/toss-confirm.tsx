// 토스 결제 성공 콜백 (successUrl).
// 토스가 GET ?paymentKey=...&orderId=...&amount=... 로 호출.
// 서버에서 confirm API 호출 + payment·subscription 갱신 + /me/subscription 으로 redirect.

import { data, redirect } from "react-router";

import { confirmPayment } from "~/features/subscriptions/queries.server";

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

  const res = await confirmPayment({
    tossOrderId: orderId,
    tossPaymentKey: paymentKey,
    amountKrw,
  });
  if (!res.ok) {
    const params = new URLSearchParams({
      failed: "1",
      msg: res.error.slice(0, 200),
    });
    throw redirect(`/me/subscription?${params.toString()}`);
  }
  // 가상계좌 — 입금 전이라 구독 미활성. 입금 완료는 토스 웹훅이 반영.
  if ("pendingDeposit" in res) {
    throw redirect("/me/subscription?deposit=1");
  }
  // feat-11 — 강의/도서(주문 fulfill=enrollment·배송) 결제는 강의 플랫폼으로 복귀
  //   (?purchased=1 시 강의 플랫폼이 장바구니를 비운다). 학습 구독은 기존대로.
  if ("fulfilledOrder" in res) {
    throw redirect("/lecture?purchased=1");
  }
  throw redirect("/me/subscription?paid=1");
}
