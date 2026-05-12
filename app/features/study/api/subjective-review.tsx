// 주관식 첨삭 요청 / 완료 (feat-3-402).
// intent=request : 학생 본인 — 자기 답안에 첨삭 요청.
// intent=complete : 강사/운영자 — 검토 완료 + 점수 + 코멘트.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  completeSubjectiveReview,
  requestSubjectiveReview,
} from "~/features/study/queries.server";

import type { Route } from "./+types/subjective-review";

const requestSchema = z.object({
  problemId: z.string().uuid(),
});

const completeSchema = z.object({
  attemptId: z.string().uuid(),
  score: z.coerce.number().int().min(0).max(100).nullable().optional(),
  commentMd: z.string().max(20000).nullable().optional(),
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

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "request") {
    const parsed = requestSchema.safeParse({ problemId: fd.get("problemId") });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const result = await requestSubjectiveReview(
      client,
      user.id,
      parsed.data.problemId,
    );
    if (!result.ok) return data({ error: result.error }, { status: 400 });
    return data({ ok: true, attempt: result.attempt });
  }

  if (intent === "complete") {
    const role = await getStaffRole(client, user.id);
    if (!role) return data({ error: "Forbidden" }, { status: 403 });
    const parsed = completeSchema.safeParse({
      attemptId: fd.get("attemptId"),
      score: fd.get("score"),
      commentMd: (fd.get("commentMd") as string | null) || null,
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const result = await completeSubjectiveReview(client, user.id, parsed.data.attemptId, {
      score: parsed.data.score ?? null,
      commentMd: parsed.data.commentMd ?? null,
    });
    if (!result.ok) return data({ error: result.error }, { status: 400 });
    return data({ ok: true, attempt: result.attempt });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}
