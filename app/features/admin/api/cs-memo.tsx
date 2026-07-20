// CS 상담 메모 등록 — cs_actions(kind='memo'). manager+ 전용.
// 회원 CS 처리 이력(admin-student-detail)에 상담/응대 메모를 남긴다.
import { data } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { recordCsAction } from "~/features/orders/cs.server";

import type { Route } from "./+types/cs-memo";

const schema = z.object({
  studentId: z.string().uuid(),
  note: z.string().trim().min(1).max(2000),
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
  if (!roleAtLeast(role, "manager")) {
    return data({ error: "Forbidden — manager 이상" }, { status: 403 });
  }

  const fd = await request.formData();
  const parsed = schema.safeParse({
    studentId: fd.get("studentId"),
    note: fd.get("note"),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력 오류" },
      { status: 400 },
    );
  }

  await recordCsAction({
    userId: parsed.data.studentId,
    actorId: user.id,
    kind: "memo",
    note: parsed.data.note,
  });
  return data({ ok: true as const });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
