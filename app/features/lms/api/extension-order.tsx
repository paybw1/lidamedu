// feat-11-010 — [수강연장] 클릭 → 연장 주문 + pending 결제 생성 → 토스 orderId 반환.
// 요청서_0901 §3 "별도 신청 절차 없이 기존 PG 결제화면으로 바로 연결".
//
// ★서버 권위 — 금액도 가능 여부도 클라이언트 값을 믿지 않는다. 여기서 정책을 **다시**
//   해석해(resolveExtensionForEnrollment) 실패하면 주문 자체를 만들지 않는다.
//   요청서가 명시한 "직접 URL 접근이나 결제 우회 차단" 이 이 재검증이다.
import { randomUUID } from "node:crypto";

import { data } from "react-router";

import { getCourseExtensionDefaults } from "~/core/lib/app-settings.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  createExtensionOrder,
  resolveExtensionForEnrollment,
} from "~/features/lms/extension.server";
import { EXTENSION_BLOCK_MESSAGE } from "~/features/lms/lib/extension-policy";
import { createPendingCartPayment } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/extension-order";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "로그인이 필요합니다" }, { status: 401 });

  const fd = await request.formData();
  const enrollmentId = String(fd.get("enrollmentId") ?? "");
  if (!UUID_RE.test(enrollmentId)) {
    return data({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const defaults = await getCourseExtensionDefaults(adminClient);
  // ★본인 수강권 확인 + 30일 마감·횟수·대상 상품까지 여기서 다시 판정한다.
  const ctx = await resolveExtensionForEnrollment({
    enrollmentId,
    userId: user.id,
    defaults,
  });
  if (!ctx) return data({ error: "수강권을 찾을 수 없습니다" }, { status: 404 });
  if (!ctx.offer.ok) {
    return data(
      { error: EXTENSION_BLOCK_MESSAGE[ctx.offer.reason ?? "disabled"] },
      { status: 400 },
    );
  }

  const order = await createExtensionOrder({ userId: user.id, ctx });
  if (order.amountKrw <= 0) {
    return data({ error: "결제 금액이 0원입니다" }, { status: 400 });
  }

  const tossOrderId = `lidam-${randomUUID()}`;
  const res = await createPendingCartPayment({
    userId: user.id,
    tossOrderId,
    amountKrw: order.amountKrw,
    orderId: order.orderId,
  });
  if (!res.ok) return data({ error: res.error }, { status: 500 });

  return data({
    ok: true,
    orderId: tossOrderId,
    amount: order.amountKrw,
    orderName: `수강기간 연장 ${ctx.offer.policy.days}일`,
  });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
