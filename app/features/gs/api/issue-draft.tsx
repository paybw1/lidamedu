// 운영자 — 한 문항의 모범답안에서 AI 로 논점 목록 초안 추출.
// 결과는 gs_question_issues 에 review_status='draft' 로 일괄 insert.
// GS 비용 가드 적용 (kind='ai_issue_extract').

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { extractIssuesFromModelAnswer } from "~/features/gs/lib/ai-issue-extractor.server";
import {
  capBlockedMessage,
  checkAiCap,
  notifyCapReachedOnce,
  recordAiUsage,
} from "~/features/gs/lib/usage-tracker.server";
import { getGsRound } from "~/features/gs/queries.server";
import {
  getMaxOrderIndex,
  insertDraftIssuesFromAi,
} from "~/features/gs/queries-issues.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/issue-draft";

const schema = z.object({
  questionId: z.string().uuid(),
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
  const parsed = schema.safeParse({ questionId: fd.get("questionId") });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  // 문항·회차 메타 lookup.
  const { data: q } = await client
    .from("gs_questions")
    .select("question_id, round_id, title, body_md, model_answer_md")
    .eq("question_id", parsed.data.questionId)
    .maybeSingle();
  if (!q) return data({ error: "Question not found" }, { status: 404 });
  if (!q.model_answer_md || q.model_answer_md.trim().length < 50) {
    return data(
      { error: "모범답안이 비어있거나 너무 짧아 논점 추출 불가합니다." },
      { status: 400 },
    );
  }
  const round = await getGsRound(client, q.round_id);
  if (!round) return data({ error: "Round not found" }, { status: 404 });

  // cap preflight — 차단 시 skipped_cap 기록 + 알림 + UI 메시지.
  const capCheck = await checkAiCap();
  if (capCheck.blocked) {
    await recordAiUsage({
      kind: "ai_issue_extract",
      model: "claude-opus-4-7",
      inputTokens: 0,
      outputTokens: 0,
      outcome: "skipped_cap",
      meta: { roundId: round.roundId, userId: user.id },
      reason: capCheck.reason,
    });
    runAfterResponse(notifyCapReachedOnce(capCheck));
    return data(
      { error: capBlockedMessage(capCheck), capBlocked: true as const },
      { status: 503 },
    );
  }

  const issues = await extractIssuesFromModelAnswer({
    questionTitle: q.title,
    questionBody: q.body_md,
    modelAnswer: q.model_answer_md,
    usage: {
      meta: { roundId: round.roundId, userId: user.id },
    },
  });
  if (!issues) {
    return data(
      { error: "AI 추출 실패 — ANTHROPIC_API_KEY 또는 모범답안 내용 점검 필요." },
      { status: 500 },
    );
  }

  const maxIdx = await getMaxOrderIndex(client, q.question_id);
  const inserted = await insertDraftIssuesFromAi(client, {
    gsQuestionId: q.question_id,
    createdBy: user.id,
    startingOrderIndex: maxIdx + 1,
    items: issues,
  });

  return data({ ok: true, inserted });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
