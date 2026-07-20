// 미완료 결제 취소 — 토스 결제창을 열었다 닫으면(사용자 취소) 클라이언트가 호출한다.
// pending 결제를 정리해 같은 상품 재결제 시 "이미 진행 중인 결제" 가드에 걸리지 않게 한다.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { cancelPendingCheckout } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/cancel-pending";

const schema = z.object({
  orderId: z.string().min(1).max(80), // 토스 orderId(create-order 가 반환한 값)
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
    return data({ error: "입력이 올바르지 않습니다" }, { status: 400 });
  }

  // 본인 소유(user.id) + 해당 tossOrderId 의 pending 만 취소(cancelPendingCheckout 내부 필터).
  const res = await cancelPendingCheckout({
    userId: user.id,
    tossOrderId: parsed.data.orderId,
  });
  return data({ ok: true, cancelled: res.cancelled });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
