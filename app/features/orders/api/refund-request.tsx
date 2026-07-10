// feat-8-029 P3 — 학생 환불요청 접수 API (POST). RLS client — 소유권 서버 검증.
import { data, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { createRefundRequest } from "~/features/orders/refund-requests.server";

import type { Route } from "./+types/refund-request";

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const fd = await request.formData();
  const orderItemId = String(fd.get("orderItemId") ?? "").trim();
  const reason = String(fd.get("reason") ?? "").trim();
  if (!orderItemId) return data({ error: "잘못된 요청입니다." }, { status: 400 });

  const result = await createRefundRequest(client, {
    userId: user.id,
    orderItemId,
    reason,
  });
  if (!result.ok) return data({ error: result.error }, { status: 400 });
  return data({ ok: true as const });
}
