// 자동결제 카드 등록 콜백 — Toss requestBillingAuth 성공 리다이렉트(GET).
// authKey→billingKey 발급·저장 후 첫 달 청구 + 구독 활성화(auto_renew=true). feat-8-028 Stage 5.
// 서버 권위: 금액·할인은 서버에서 재계산(create-order 와 동일 규칙).

import { redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { resolveCheckoutDiscount } from "~/features/subscriptions/discounts.server";
import {
  chargeAndActivateBilling,
  getPlanByCode,
  issueAndSaveBillingKey,
} from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/billing-confirm";

// 라우트: /api/payments/toss/billing-confirm

function fail(msg: string): never {
  throw redirect(
    `/me/subscription?failed=1&msg=${encodeURIComponent(msg).slice(0, 200)}`,
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const url = new URL(request.url);
  const authKey = url.searchParams.get("authKey");
  const customerKey = url.searchParams.get("customerKey");
  const planCode = url.searchParams.get("planCode");
  const discountCode = url.searchParams.get("discountCode");
  if (!authKey || !customerKey || !planCode) fail("자동결제 정보가 없습니다");
  // customerKey 는 우리가 넘긴 본인 식별자여야 한다(위조 방지).
  if (customerKey !== user.id) fail("결제자 정보가 일치하지 않습니다");

  const plan = await getPlanByCode(client, planCode!);
  if (!plan) fail("플랜을 찾을 수 없습니다");
  if (plan!.priceKrw <= 0) fail("유료 플랜만 자동결제할 수 있습니다");
  if (plan!.availableFrom && new Date(plan!.availableFrom).getTime() > Date.now())
    fail("아직 오픈 전 상품입니다");

  // 서버 권위 금액(쿠폰/자동 프로모션).
  const disc = await resolveCheckoutDiscount({
    plan: {
      code: plan!.code,
      productKind: plan!.productKind,
      priceKrw: plan!.priceKrw,
    },
    code: discountCode,
    userId: user.id,
  });
  if (!disc.ok) fail(disc.error);
  if (disc.amountKrw <= 0) fail("할인 후 결제 금액이 0원입니다");

  // 1) billingKey 발급·저장
  const issued = await issueAndSaveBillingKey({
    userId: user.id,
    authKey: authKey!,
    customerKey: customerKey!,
  });
  if (!issued.ok) fail(issued.error);

  // 2) 첫 달 청구 + 구독 활성화(auto_renew=true)
  const activated = await chargeAndActivateBilling({
    userId: user.id,
    customerKey: customerKey!,
    plan: plan!,
    amountKrw: disc.amountKrw,
    discountId: disc.discount?.discountId ?? null,
  });
  if (!activated.ok) fail(activated.error);

  throw redirect("/me/subscription?paid=1&auto=1");
}
