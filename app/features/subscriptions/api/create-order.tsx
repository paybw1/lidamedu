// 결제 준비 — pending payment row 생성 후 토스 orderId 반환.
// 클라이언트가 받은 orderId 로 토스 SDK 결제 호출.

import { randomUUID } from "node:crypto";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { createSinglePlanOrder } from "~/features/orders/orders.server";
import { resolveCheckoutDiscount } from "~/features/subscriptions/discounts.server";
import {
  cancelPendingCheckout,
  createPendingPayment,
  getPlanByCode,
} from "~/features/subscriptions/queries.server";
import { lawSubjectSlugSchema } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/create-order";

const schema = z.object({
  intent: z.literal("create-order"),
  planCode: z.string().min(1).max(40),
  // 자기학습 과목별 결제 — 법률과목 슬러그만(자연과학은 기본 무료라 결제 대상 아님).
  subjectCode: lawSubjectSlugSchema.optional(),
  // feat-8-028 — 쿠폰 코드(선택).
  discountCode: z.string().trim().max(40).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success)
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력 내용이 올바르지 않습니다" },
      { status: 400 },
    );

  const plan = await getPlanByCode(client, parsed.data.planCode);
  if (!plan)
    return data({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  if (plan.priceKrw <= 0)
    return data({ error: "유료 상품만 결제할 수 있습니다" }, { status: 400 });
  if (plan.availableFrom && new Date(plan.availableFrom).getTime() > Date.now())
    return data(
      { error: "아직 오픈 전 상품입니다" },
      { status: 400 },
    );

  // 재시도 정리 — 같은 상품(+과목)의 이전 미완료(pending) 결제를 취소 처리한 뒤 새로 만든다.
  // 토스 결제창을 열었다 닫으면 pending 이 남는데, 예전에는 이를 "이미 진행 중인 결제"로 차단해
  // 사용자가 10분간 재결제할 수 없었다. 이제 이전 시도를 취소(failed)하고 재시도를 허용한다.
  // 이중청구는 confirmPayment 가 orderId 단위 멱등(완료 결제 재확인 차단)이라 방지된다.
  await cancelPendingCheckout({
    userId: user.id,
    planId: plan.planId,
    subjectCode: parsed.data.subjectCode ?? null,
    reason: "재결제 시도 — 이전 미완료 결제 취소",
  });

  // feat-8-028 — 유효 할인 계산(쿠폰 또는 자동 프로모션). 서버 권위 금액.
  const disc = await resolveCheckoutDiscount({
    plan: { code: plan.code, productKind: plan.productKind, priceKrw: plan.priceKrw },
    code: parsed.data.discountCode ?? null,
    userId: user.id,
  });
  if (!disc.ok) return data({ error: disc.error }, { status: 400 });
  if (disc.amountKrw <= 0)
    return data(
      { error: "할인 후 결제 금액이 0원입니다. 운영자에게 문의해 주세요." },
      { status: 400 },
    );

  // feat-11-004 4a — ★이중 경로 금지: 단건 결제도 1-item 주문 경유.
  const order = await createSinglePlanOrder({
    userId: user.id,
    planId: plan.planId,
    subjectCode: parsed.data.subjectCode ?? null,
    amountKrw: disc.amountKrw,
    discountId: disc.discount?.discountId ?? null,
    paymentMethod: "toss",
  });

  // 토스 orderId 는 6~64자 영숫자/하이픈/언더스코어. UUID 사용.
  const tossOrderId = `lidam-${randomUUID()}`;
  const res = await createPendingPayment({
    userId: user.id,
    plan,
    tossOrderId,
    subjectCode: parsed.data.subjectCode ?? null,
    amountKrw: disc.amountKrw,
    discountId: disc.discount?.discountId ?? null,
    orderId: order.orderId,
  });
  if (!res.ok) return data({ error: res.error }, { status: 500 });

  return data({
    ok: true,
    orderId: tossOrderId,
    paymentId: res.paymentId,
    amount: disc.amountKrw,
  });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
