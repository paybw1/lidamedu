// 학생 — ③④ AI 강약 코칭 트리거. cap blocked 시 graceful 503.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { analyzeCaseConclusion } from "~/features/cases/lib/ai-case-conclusion-analyzer.server";
import {
  getApprovedCaseTrainingItem,
  getMyConclusionAttempt,
  setConclusionAttemptAiAnalysis,
} from "~/features/cases/queries-case-training.server";
import {
  capBlockedMessage,
  checkAiCap,
  notifyCapReachedOnce,
  recordAiUsage,
} from "~/features/gs/lib/usage-tracker.server";
import type { MasterIssueWithConclusion } from "~/features/issue-extraction/lib/types";

import type { Route } from "./+types/case-training-conclusion-analyze";

const schema = z.object({ itemId: z.string().uuid() });

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const parsed = schema.safeParse({ itemId: fd.get("itemId") });
  if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });

  const itemBundle = await getApprovedCaseTrainingItem(client, parsed.data.itemId);
  if (!itemBundle)
    return data({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
  const attempt = await getMyConclusionAttempt(client, user.id, parsed.data.itemId);
  if (!attempt || !attempt.submittedAt)
    return data(
      { error: "제출 후에만 AI 코칭을 받을 수 있습니다." },
      { status: 400 },
    );

  // 결론 정보가 있는 쟁점만 대상.
  const masterIssues: MasterIssueWithConclusion[] = itemBundle.approvedIssues
    .filter((i) => (i.modelConclusionDirection ?? "").trim().length > 0)
    .map((i) => ({
      issueId: i.issueId,
      label: i.label,
      descriptionMd: i.descriptionMd,
      importance: i.importance,
      refHint: i.refHint,
      weight: i.weight,
      modelConclusionDirection: i.modelConclusionDirection,
      modelConclusionMd: i.modelConclusionMd,
    }));
  if (masterIssues.length === 0)
    return data(
      { error: "③④ 채점 기준이 없는 항목입니다." },
      { status: 400 },
    );

  const capCheck = await checkAiCap();
  if (capCheck.blocked) {
    await recordAiUsage({
      kind: "ai_case_conclusion_analyze",
      model: "claude-opus-4-7",
      inputTokens: 0,
      outputTokens: 0,
      outcome: "skipped_cap",
      meta: { userId: user.id },
      reason: capCheck.reason,
    });
    runAfterResponse(notifyCapReachedOnce(capCheck));
    return data(
      { error: capBlockedMessage(capCheck), capBlocked: true as const },
      { status: 503 },
    );
  }

  const result = await analyzeCaseConclusion({
    caseTitle: itemBundle.caseRef.caseTitle,
    factsSummaryMd: itemBundle.item.factsSummaryMd,
    masterIssues,
    studentConclusions: attempt.conclusions ?? {},
    studentEmphasis: attempt.emphasisMap ?? {},
    studentOutlineMd: attempt.outlineMd,
    usage: { meta: { userId: user.id } },
  });
  if (!result) {
    return data(
      { error: "AI 코칭에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  await setConclusionAttemptAiAnalysis(client, user.id, parsed.data.itemId, result);
  return data({ ok: true as const, result });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
