// feat-7-035 위험군 학생 일괄 알림 발송 — staff 전용.
// 선택한 profile_id 들에게 `announcement` kind 의 in-app notification 만 발송.
// 카카오 알림톡·이메일은 후속 (v1.1).

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

import type { Route } from "./+types/at-risk-notify";

const Schema = z.object({
  intent: z.literal("send-encouragement"),
  profileIds: z.string().min(1),
  message: z.string().min(2).max(300),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false, error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ ok: false, error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return data(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // profileIds 는 CSV.
  const ids = parsed.data.profileIds
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length === 0) {
    return data({ ok: false, error: "선택된 학생이 없습니다." }, { status: 400 });
  }

  await createUserNotifications({
    recipientIds: ids,
    kind: "announcement",
    entityType: "at_risk_outreach",
    entityId: user.id,
    title: "강사 학습 격려",
    body: parsed.data.message,
    href: "/dashboard",
  });

  return data({ ok: true, sent: ids.length });
}
