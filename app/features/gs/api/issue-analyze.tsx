// 학생 — AI 의미 매칭 분석 트리거.
// 본인 attempt + 승인된 모범 논점 → Claude 호출 → ai_analysis 저장.
// 비용 가드 (kind='ai_issue_analyze') + cap 도달 시 graceful (자기채점은 그대로).

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { analyzeIssueExtraction } from "~/features/gs/lib/ai-issue-analyzer.server";
import {
  capBlockedMessage,
  checkAiCap,
  notifyCapReachedOnce,
  recordAiUsage,
} from "~/features/gs/lib/usage-tracker.server";
import { getIssueQuestionForStudent } from "~/features/gs/queries-issue-attempts.server";
import { listApprovedIssuesForGsQuestion } from "~/features/gs/queries-issues.server";

import type { Route } from "./+types/issue-analyze";

const schema = z.object({
  gsQuestionId: z.string().uuid(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const parsed = schema.safeParse({ gsQuestionId: fd.get("gsQuestionId") });
  if (!parsed.success)
    return data({ error: "Invalid input" }, { status: 400 });

  // 본인 attempt + 게이트 검증 (승인된 논점 ≥1).
  const ctx = await getIssueQuestionForStudent(
    client,
    user.id,
    parsed.data.gsQuestionId,
  );
  if (!ctx) return data({ error: "문항을 찾을 수 없습니다." }, { status: 404 });
  const attempt = ctx.myAttempt;
  if (!attempt || !attempt.submittedAt)
    return data(
      { error: "제출 후에만 AI 분석을 받을 수 있습니다." },
      { status: 400 },
    );
  if (!attempt.studentIssuesMd.trim()) {
    return data(
      { error: "빈 답안은 분석할 수 없습니다." },
      { status: 400 },
    );
  }

  // cap preflight.
  const capCheck = await checkAiCap();
  if (capCheck.blocked) {
    await recordAiUsage({
      kind: "ai_issue_analyze",
      model: "claude-opus-4-7",
      inputTokens: 0,
      outputTokens: 0,
      outcome: "skipped_cap",
      meta: {
        roundId: ctx.round.roundId,
        userId: user.id,
      },
      reason: capCheck.reason,
    });
    runAfterResponse(notifyCapReachedOnce(capCheck));
    return data(
      { error: capBlockedMessage(capCheck), capBlocked: true as const },
      { status: 503 },
    );
  }

  const masterIssues = await listApprovedIssuesForGsQuestion(
    client,
    parsed.data.gsQuestionId,
  );
  if (masterIssues.length === 0) {
    return data(
      { error: "승인된 모범 논점이 없습니다." },
      { status: 400 },
    );
  }

  const result = await analyzeIssueExtraction({
    questionTitle: ctx.question.title,
    questionBody: ctx.question.bodyMd,
    masterIssues,
    studentIssuesMd: attempt.studentIssuesMd,
    usage: {
      meta: { roundId: ctx.round.roundId, userId: user.id },
    },
  });

  if (!result) {
    return data(
      { error: "AI 분석에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  // ai_analysis 저장.
  await client
    .from("user_issue_attempts")
    .update({
      ai_analysis:
        result as unknown as import("database.types").Database["public"]["Tables"]["user_issue_attempts"]["Update"]["ai_analysis"],
      ai_analyzed_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("gs_question_id", parsed.data.gsQuestionId);

  return data({ ok: true, result });
}
