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
  throw redirect("/me/subscription?paid=1");
}
