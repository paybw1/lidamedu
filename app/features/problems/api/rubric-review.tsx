// 주관식 채점기준·모범답안 검수완료 토글 (staff 전용) — 문제 뷰어 모범답안 헤더의 검수 버튼.
// reviewed=true → rubric_reviewed_at=now()·rubric_reviewed_by=본인, false → 해제.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/rubric-review";

const schema = z.object({
  problemId: z.string().uuid(),
  reviewed: z.union([z.literal("true"), z.literal("false")]),
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
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const parsed = schema.safeParse({
    problemId: fd.get("problemId"),
    reviewed: fd.get("reviewed"),
  });
  if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });

  const reviewed = parsed.data.reviewed === "true";
  const { error } = await client
    .from("problems")
    .update({
      rubric_reviewed_at: reviewed ? new Date().toISOString() : null,
      rubric_reviewed_by: reviewed ? user.id : null,
    })
    .eq("problem_id", parsed.data.problemId);
  if (error) return data({ error: error.message }, { status: 400 });

  return data({ ok: true, reviewedAt: reviewed ? new Date().toISOString() : null });
}

// GET(브라우저 직접 접근) — POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
