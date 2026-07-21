// feat-7-046 Stage 3 — 회원 CRM '개별완료처리'. manager+ 전용.
// 완료 처리/취소는 서버 권위(adminClient) — lesson_completions override.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import {
  markLessonComplete,
  unmarkLessonComplete,
} from "~/features/admin/queries/member-crm.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";

import type { Route } from "./+types/lesson-completion";

const schema = z.object({
  intent: z.enum(["complete", "uncomplete"]),
  userId: z.string().uuid(),
  lessonId: z.string().uuid(),
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
    intent: fd.get("intent"),
    userId: fd.get("userId"),
    lessonId: fd.get("lessonId"),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const res =
    parsed.data.intent === "complete"
      ? await markLessonComplete({
          userId: parsed.data.userId,
          lessonId: parsed.data.lessonId,
          completedBy: user.id,
        })
      : await unmarkLessonComplete({
          userId: parsed.data.userId,
          lessonId: parsed.data.lessonId,
        });
  if (!res.ok) return data({ error: res.error }, { status: 400 });

  await logAuditEvent({
    actorId: user.id,
    actorRole: role,
    action: `lesson.completion.${parsed.data.intent}`,
    entityType: "lesson",
    entityId: parsed.data.lessonId,
    metadata: { userId: parsed.data.userId },
  });
  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
