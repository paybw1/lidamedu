// 결제 준비 — pending payment row 생성 후 토스 orderId 반환.
// 클라이언트가 받은 orderId 로 토스 SDK 결제 호출.

import { randomUUID } from "node:crypto";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { createSinglePlanOrder } from "~/features/orders/orders.server";
import { resolveCheckoutDiscount } from "~/features/subscriptions/discounts.server";
import {
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

  // 중복 결제 가드 — 같은 상품(+과목)의 최근(10분 내) 미완료 결제가 있으면 거부.
  // 더블클릭·중복 호출로 pending 이 2건 생겨 둘 다 결제되는 이중청구를 서버단에서 차단.
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  let dupQuery = client
    .from("payments")
    .select("payment_id")
    .eq("user_id", user.id)
    .eq("plan_id", plan.planId)
    .eq("status", "pending")
    .gte("created_at", tenMinAgo);
  dupQuery = parsed.data.subjectCode
    ? dupQuery.eq("subject_code", parsed.data.subjectCode)
    : dupQuery.is("subject_code", null);
  const { data: dup } = await dupQuery.limit(1).maybeSingle();
  if (dup)
    return data(
      { error: "이미 진행 중인 결제가 있습니다. 잠시 후 다시 시도해 주세요." },
      { status: 409 },
    );

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
