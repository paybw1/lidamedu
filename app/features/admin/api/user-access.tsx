// 서비스 접근 승인/해제 API — admin + '수강생 관리 접근' duty 배정 스태프.
// access_approved_at 은 profiles 가드 트리거로 service_role 만 변경 가능하므로
// 반드시 adminClient(setUserAccessApproval) 경유.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { setUserAccessApproval } from "~/features/admin/queries/users.server";

import type { Route } from "./+types/user-access";

const schema = z.object({
  profileId: z.string().uuid(),
  approved: z.enum(["1", "0"]),
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
  const role = await getStaffRole(client, user.id);
  const canAccess = await hasDutyAccess("student_admin_access", user.id, role);
  if (!canAccess) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const parsed = schema.safeParse({
    profileId: fd.get("profileId"),
    approved: fd.get("approved"),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const approved = parsed.data.approved === "1";
  const res = await setUserAccessApproval(parsed.data.profileId, approved);
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  void logAuditEvent({
    actorId: user.id,
    actorRole: role,
    action: approved ? "user.access.approve" : "user.access.revoke",
    entityType: "profile",
    entityId: parsed.data.profileId,
    metadata: { approved },
  });
  return data({ ok: true });
}
