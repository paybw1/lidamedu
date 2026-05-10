// 학생 동료 채점 — 점수/피드백 저장, 마무리 제출, 첨부 signed URL 발급.
// 첨부는 답안 작성자(다른 학생) 폴더에 있어 학생 RLS 로 직접 접근 불가 — admin client 로 우회 발급.
//   단, 호출 측에서 'auth.uid() == reviewer && path 의 owner == submission.user_id' 조건을 검증.

import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  submitPeerReview,
  upsertPeerReviewAnswer,
} from "~/features/gs/queries-peer.server";
import { listSubmissionPages } from "~/features/gs/queries.server";

import type { Route } from "./+types/peer";

const saveSchema = z.object({
  intent: z.literal("save"),
  assignmentId: z.string().uuid(),
  questionId: z.string().uuid(),
  score: z.string().optional(),
  feedbackMd: z.string().optional(),
});
const submitSchema = z.object({
  intent: z.literal("submit"),
  assignmentId: z.string().uuid(),
});

// GET — 첨부 signed URL 발급. ?assignmentId=...&path=...
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const assignmentId = url.searchParams.get("assignmentId");
  const path = url.searchParams.get("path");
  if (!assignmentId || !path) {
    return data({ error: "Missing params" }, { status: 400 });
  }

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  // 검증: 본인 reviewer 인 assignment 인지 + path 가 그 assignment 의 submission 작성자 폴더인지.
  const { data: assign } = await client
    .from("gs_peer_assignments")
    .select("submission_id, reviewer_user_id, gs_submissions!inner(user_id)")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (!assign) return data({ error: "Forbidden" }, { status: 403 });
  if (assign.reviewer_user_id !== user.id) {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  const submissionAuthor = assign.gs_submissions.user_id;
  const ownerInPath = path.split("/")[0];
  if (ownerInPath !== submissionAuthor) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  // path 가 실제 답안지 페이지 첨부에 속하는지(임의 path 우회 방지).
  const pages = await listSubmissionPages(client, assign.submission_id);
  const allPaths = new Set<string>();
  for (const p of pages) allPaths.add(p.attachment.path);
  if (!allPaths.has(path)) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  // RLS 우회 발급 — 검증된 path 만.
  const { data: signed, error } = await adminClient.storage
    .from("gs-answers")
    .createSignedUrl(path, 600);
  if (error) return data({ url: null });
  return data({ url: signed?.signedUrl ?? null });
}

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

  if (intent === "save") {
    const parsed = saveSchema.safeParse({
      intent,
      assignmentId: fd.get("assignmentId"),
      questionId: fd.get("questionId"),
      score: fd.get("score") ?? undefined,
      feedbackMd: fd.get("feedbackMd") ?? undefined,
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });

    const scoreStr = parsed.data.score?.trim() ?? "";
    const score: number | null = scoreStr === "" ? null : Number(scoreStr);
    if (score != null && !Number.isFinite(score))
      return data({ error: "score must be number" }, { status: 400 });
    const feedback =
      parsed.data.feedbackMd === undefined
        ? undefined
        : parsed.data.feedbackMd === ""
          ? null
          : parsed.data.feedbackMd;

    await upsertPeerReviewAnswer(
      client,
      parsed.data.assignmentId,
      parsed.data.questionId,
      { score, feedbackMd: feedback },
    );
    return data({ ok: true });
  }

  if (intent === "submit") {
    const parsed = submitSchema.safeParse({
      intent,
      assignmentId: fd.get("assignmentId"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    await submitPeerReview(client, parsed.data.assignmentId);
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}
