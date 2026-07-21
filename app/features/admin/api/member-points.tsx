// feat-7-046 Stage 4 — 회원 CRM 포인트 수동 조정. manager+ 전용.
// point_transactions 에 delta 1건 insert(적립 + / 차감 −). 서버 권위(adminClient).

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { adjustMemberPoints } from "~/features/admin/queries/member-crm.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";

import type { Route } from "./+types/member-points";

const schema = z.object({
  userId: z.string().uuid(),
  direction: z.enum(["earn", "spend"]),
  amount: z.coerce.number().int().positive("포인트를 입력하세요").max(10_000_000),
  reason: z.string().trim().min(1, "사유를 입력하세요").max(200),
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
  if (!role || !roleAtLeast(role, "manager")) {
    return data({ error: "Forbidden — manager only" }, { status: 403 });
  }

  const fd = await request.formData();
  const parsed = schema.safeParse({
    userId: fd.get("userId"),
    direction: fd.get("direction"),
    amount: fd.get("amount"),
    reason: fd.get("reason"),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const delta =
    parsed.data.direction === "earn" ? parsed.data.amount : -parsed.data.amount;
  const res = await adjustMemberPoints({
    userId: parsed.data.userId,
    delta,
    reason: parsed.data.reason,
  });
  if (!res.ok) return data({ error: res.error }, { status: 400 });

  await logAuditEvent({
    actorId: user.id,
    actorRole: role,
    action: "member.points.adjust",
    entityType: "profile",
    entityId: parsed.data.userId,
    metadata: { delta, reason: parsed.data.reason, newBalance: res.newBalance },
  });
  return data({ ok: true, newBalance: res.newBalance });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
