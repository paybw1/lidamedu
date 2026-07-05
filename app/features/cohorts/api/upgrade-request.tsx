// 종합반 등업 신청 action — 학생 본인(RLS insert). pricing 카드에서 호출.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { createUpgradeRequest } from "~/features/cohorts/upgrade-requests.server";

import type { Route } from "./+types/upgrade-request";

const schema = z.object({
  message: z.string().trim().max(500).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "로그인이 필요합니다." }, { status: 401 });
  const fd = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success)
    return data({ error: "입력 오류" }, { status: 400 });
  const res = await createUpgradeRequest(
    client,
    user.id,
    parsed.data.message ?? null,
  );
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return data({ ok: true });
}
