// 사용자 역할 변경 API — admin 전용 (instructor 도 막음).

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { updateUserRole } from "~/features/admin/queries/users.server";

import type { Route } from "./+types/user-role";

const schema = z.object({
  profileId: z.string().uuid(),
  role: z.enum(["student", "instructor", "admin"]),
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
  if (role !== "admin") return data({ error: "Forbidden — admin only" }, { status: 403 });

  const fd = await request.formData();
  const parsed = schema.safeParse({
    profileId: fd.get("profileId"),
    role: fd.get("role"),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // 본인 강등 방지 — admin 본인이 student 로 내릴 수 없음.
  if (parsed.data.profileId === user.id && parsed.data.role !== "admin") {
    return data(
      { error: "본인의 admin 권한을 강등할 수 없습니다." },
      { status: 400 },
    );
  }

  const res = await updateUserRole(parsed.data.profileId, parsed.data.role);
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return data({ ok: true });
}
