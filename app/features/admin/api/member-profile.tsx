// feat-7-046 회원 CRM — 회원정보 안전 편집 저장. manager+ 전용.
// 편집 대상은 연락/신원 정정 필드만(이름·닉네임·전화·주소·마케팅동의).
// ★ profiles RLS 는 staff 에게도 본인만 허용 → updateMemberProfile 이 adminClient 사용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { updateMemberProfile } from "~/features/admin/queries/member-crm.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";

import type { Route } from "./+types/member-profile";

const schema = z.object({
  profileId: z.string().uuid(),
  name: z.string().trim().min(1, "이름을 입력하세요").max(60),
  nickname: z.string().trim().max(60),
  phoneE164: z.string().trim().max(20),
  address: z.string().trim().max(200),
  marketingConsent: z.boolean(),
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
    profileId: fd.get("profileId"),
    name: fd.get("name"),
    nickname: fd.get("nickname") ?? "",
    phoneE164: fd.get("phoneE164") ?? "",
    address: fd.get("address") ?? "",
    marketingConsent: fd.get("marketingConsent") === "1",
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const res = await updateMemberProfile(client, parsed.data.profileId, {
    name: parsed.data.name,
    nickname: parsed.data.nickname || null,
    phoneE164: parsed.data.phoneE164 || null,
    address: parsed.data.address || null,
    marketingConsent: parsed.data.marketingConsent,
  });
  if (!res.ok) return data({ error: res.error }, { status: 400 });

  await logAuditEvent({
    actorId: user.id,
    actorRole: role,
    action: "member.profile.update",
    entityType: "profile",
    entityId: parsed.data.profileId,
    metadata: { name: parsed.data.name },
  });
  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
