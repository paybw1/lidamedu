// 결제 준비 — pending payment row 생성 후 토스 orderId 반환.
// 클라이언트가 받은 orderId 로 토스 SDK 결제 호출.

import { randomUUID } from "node:crypto";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  createPendingPayment,
  getPlanByCode,
} from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/create-order";

const schema = z.object({
  intent: z.literal("create-order"),
  planCode: z.string().min(1).max(40),
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
      { error: parsed.error.issues[0]?.message ?? "입력 오류" },
      { status: 400 },
    );

  const plan = await getPlanByCode(client, parsed.data.planCode);
  if (!plan)
    return data({ error: "플랜을 찾을 수 없습니다" }, { status: 404 });
  if (plan.priceKrw <= 0)
    return data({ error: "유료 플랜만 결제 가능합니다" }, { status: 400 });

  // 토스 orderId 는 6~64자 영숫자/하이픈/언더스코어. UUID 사용.
  const tossOrderId = `lidam-${randomUUID()}`;
  const res = await createPendingPayment({
    userId: user.id,
    plan,
    tossOrderId,
  });
  if (!res.ok) return data({ error: res.error }, { status: 500 });

  return data({
    ok: true,
    orderId: tossOrderId,
    paymentId: res.paymentId,
  });
}
