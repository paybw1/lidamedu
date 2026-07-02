// 구독 해지/환불 — 본인 구독. 결제 후 3일 이내 전액 환불+즉시 종료,
// 3일 경과 시 정기결제 해지(잔여기간 이용·다음 갱신 청구 없음). feat-8-028.
// 서버 권위: cancelSubscription 이 소유권·상태·기간을 모두 재검증한다.

import { redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { cancelSubscription } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/cancel-subscription";

const schema = z.object({
  intent: z.literal("cancel"),
  subscriptionId: z.string().uuid(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw redirect("/me/subscription");
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const fd = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    throw redirect(
      `/me/subscription?cancelError=${encodeURIComponent("잘못된 요청입니다")}`,
    );
  }

  const res = await cancelSubscription({
    userId: user.id,
    subscriptionId: parsed.data.subscriptionId,
  });
  if (!res.ok) {
    throw redirect(
      `/me/subscription?cancelError=${encodeURIComponent(res.error).slice(0, 200)}`,
    );
  }
  // refunded=1(전액 환불+종료) / cancelled=1(정기결제 해지, 잔여기간 이용)
  throw redirect(
    `/me/subscription?${res.refunded ? "refunded=1" : "cancelled=1"}`,
  );
}
