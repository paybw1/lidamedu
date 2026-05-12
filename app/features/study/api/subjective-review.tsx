// 주관식 첨삭 요청 / 완료 (feat-3-402).
// intent=request : 학생 본인 — 자기 답안에 첨삭 요청.
// intent=complete : 강사/운영자 — 검토 완료 + 점수 + 코멘트.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  notifyReviewCompleted,
  notifyReviewRequested,
} from "~/features/study/notify-review.server";
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
    // 알림 — 모든 staff 에게. best-effort, 응답 전 await 하지 않음.
    void (async () => {
      const { data: prob } = await client
        .from("problems")
        .select("year, problem_number, body_md, laws(law_code)")
        .eq("problem_id", parsed.data.problemId)
        .maybeSingle();
      const label = prob
        ? `${prob.year ? `${prob.year}년 ` : ""}${
            prob.problem_number ? `${prob.problem_number}번` : "주관식"
          } (${prob.laws?.law_code ?? "subject"})`
        : "주관식 문제";
      const body = result.attempt.answerMd ?? "";
      const excerpt = body.length > 600 ? `${body.slice(0, 600)}…` : body;
      await notifyReviewRequested({
        studentId: user.id,
        problemId: parsed.data.problemId,
        problemLabel: label,
        excerpt,
      });
    })();
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
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "subjective_review.complete",
      entityType: "user_subjective_attempt",
      entityId: parsed.data.attemptId,
      metadata: {
        score: parsed.data.score ?? null,
        hasComment: !!parsed.data.commentMd,
      },
    });
    // 학생에게 알림 — attempt 의 user_id + problem 정보 lookup.
    void (async () => {
      const { data: row } = await client
        .from("user_subjective_attempts")
        .select(
          "user_id, problem_id, problems(year, problem_number, laws(law_code))",
        )
        .eq("attempt_id", parsed.data.attemptId)
        .maybeSingle();
      if (!row) return;
      const lawCode = row.problems?.laws?.law_code ?? "patent";
      const label = `${row.problems?.year ? `${row.problems.year}년 ` : ""}${
        row.problems?.problem_number ? `${row.problems.problem_number}번` : "주관식"
      } (${lawCode})`;
      await notifyReviewCompleted({
        studentId: row.user_id,
        reviewerId: user.id,
        problemId: row.problem_id,
        problemLabel: label,
        problemHref: `/subjects/${lawCode}/problems/${row.problem_id}`,
        score: result.attempt.reviewerScore,
        commentMd: result.attempt.reviewerCommentMd,
      });
    })();
    return data({ ok: true, attempt: result.attempt });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}
