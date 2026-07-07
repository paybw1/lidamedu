// 종합반 등업 신청 action — 학생 본인(RLS insert). pricing 카드에서 호출.
import { data } from "react-router";
import { z } from "zod";

import { isStaffRole } from "~/core/lib/roles";
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
  // 접근 승인 게이트 — 화면(/pricing)은 private.layout 이 막지만, API 직접 호출도
  // 미승인 학생은 차단(staff 는 승인 개념 없음 — 면제).
  const { data: prof } = await client
    .from("profiles")
    .select("role, access_approved_at")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (prof && !isStaffRole(prof.role) && !prof.access_approved_at)
    return data(
      { error: "서비스 이용 승인 후 신청할 수 있습니다." },
      { status: 403 },
    );
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
