// POST /api/orders/bank-transfer — 무통장 입금 주문 신청 (feat-11-004 4b).
// 서버 권위 금액(할인 리졸버) → 주문 pending_deposit + bank_transfers 생성 → 입금 안내 반환.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { createBankTransferOrder } from "~/features/orders/bank-transfer.server";
import { resolveCheckoutDiscount } from "~/features/subscriptions/discounts.server";
import { getPlanByCode } from "~/features/subscriptions/queries.server";
import { lawSubjectSlugSchema } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/bank-transfer";

const schema = z.object({
  planCode: z.string().min(1).max(40),
  subjectCode: lawSubjectSlugSchema.optional(),
  discountCode: z.string().trim().max(40).optional(),
  depositorName: z.string().trim().min(1).max(40),
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
  if (!parsed.success) {
    return data({ error: "입력을 확인해 주세요 (입금자명 필수)." }, { status: 400 });
  }
  const plan = await getPlanByCode(client, parsed.data.planCode);
  if (!plan) return data({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  if (plan.priceKrw <= 0) return data({ error: "유료 상품만 신청할 수 있습니다" }, { status: 400 });

  const disc = await resolveCheckoutDiscount({
    plan: { code: plan.code, productKind: plan.productKind, priceKrw: plan.priceKrw },
    code: parsed.data.discountCode ?? null,
    userId: user.id,
  });
  if (!disc.ok) return data({ error: disc.error }, { status: 400 });

  // 중복 신청 가드 — 같은 사용자·상품의 대기 중 무통장 주문.
  const { data: dup } = await client
    .from("orders")
    .select("order_id, order_items!inner(plan_id)")
    .eq("user_id", user.id)
    .eq("status", "pending_deposit")
    .eq("order_items.plan_id", plan.planId)
    .limit(1)
    .maybeSingle();
  if (dup) {
    return data(
      { error: "이미 입금 대기 중인 신청이 있습니다. 입금 확인을 기다려 주세요." },
      { status: 409 },
    );
  }

  const result = await createBankTransferOrder({
    userId: user.id,
    planId: plan.planId,
    subjectCode: parsed.data.subjectCode ?? null,
    amountKrw: disc.amountKrw,
    discountId: disc.discount?.discountId ?? null,
    depositorName: parsed.data.depositorName,
  });
  return data({
    ok: true as const,
    orderId: result.orderId,
    amount: disc.amountKrw,
    expiresAt: result.expiresAt,
  });
}
