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
  // rubric_scores 전체 JSON. { [criterionId]: { score: number, note?: string } }
  rubricScoresJson: z.string().optional(),
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
      rubricScoresJson: fd.get("rubricScoresJson") ?? undefined,
      feedbackMd: fd.get("feedbackMd") ?? undefined,
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });

    // rubricScoresJson 이 들어오면 우선 — 합산값을 서버에서 score 로 자동 반영.
    let rubricScores: Record<string, { score: number; note?: string }> | undefined;
    if (parsed.data.rubricScoresJson !== undefined) {
      try {
        const raw = JSON.parse(parsed.data.rubricScoresJson);
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          const out: Record<string, { score: number; note?: string }> = {};
          for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            if (!v || typeof v !== "object") continue;
            const o = v as Record<string, unknown>;
            if (typeof o.score !== "number" || !Number.isFinite(o.score)) continue;
            out[k] = { score: o.score };
            if (typeof o.note === "string") out[k].note = o.note;
          }
          rubricScores = out;
        }
      } catch {
        return data({ error: "Invalid rubricScoresJson" }, { status: 400 });
      }
    }

    const scoreStr = parsed.data.score?.trim() ?? "";
    const score: number | null | undefined =
      rubricScores !== undefined
        ? undefined // upsert 가 rubric 합으로 자동 계산
        : scoreStr === ""
          ? null
          : Number(scoreStr);
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
      { score, rubricScores, feedbackMd: feedback },
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
