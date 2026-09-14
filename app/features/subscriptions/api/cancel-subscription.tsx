// 구독 해지 — 본인 구독. ★결제 후 3일 이내는 **전액 환불 대상**이라 여기서 처리하지 않고
// 거부한다(고객센터 신청 → 관리자 환불관리, feat-11-013 D10).
// 3일 경과 시에만 정기결제 해지(잔여기간 이용·다음 갱신 청구 없음). feat-8-028.
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
  // ★셀프 해지는 이제 **정기결제 해지 한 갈래**뿐이다(feat-11-013 D10).
  //   3일 이내 전액환불은 고객센터 신청 → 관리자 환불관리로 처리하므로 여기 오지 않는다.
  throw redirect("/me/subscription?cancelled=1");
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
