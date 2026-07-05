// 학생 — AI 의미 매칭 분석 트리거.
// 본인 attempt(제출 후) + 승인 쟁점 → Claude → ai_analysis 저장.
// cap 도달 시 graceful 503 — 클라가 capBlocked 패널 표시.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { analyzeCaseIssueExtraction } from "~/features/cases/lib/ai-case-issue-analyzer.server";
import {
  getApprovedCaseTrainingItem,
  getMyCaseAttempt,
  setCaseAttemptAiAnalysis,
} from "~/features/cases/queries-case-training.server";
import {
  capBlockedMessage,
  checkAiCap,
  notifyCapReachedOnce,
  recordAiUsage,
} from "~/features/gs/lib/usage-tracker.server";

import type { Route } from "./+types/case-training-analyze";

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
  const attempt = await getMyCaseAttempt(client, user.id, parsed.data.itemId);
  if (!attempt || !attempt.submittedAt) {
    return data(
      { error: "제출 후에만 AI 분석을 받을 수 있습니다." },
      { status: 400 },
    );
  }
  if (!attempt.studentIssuesMd.trim()) {
    return data({ error: "빈 답안은 분석할 수 없습니다." }, { status: 400 });
  }
  if (itemBundle.approvedIssues.length === 0) {
    return data({ error: "승인된 쟁점이 없습니다." }, { status: 400 });
  }

  // cap preflight.
  const capCheck = await checkAiCap();
  if (capCheck.blocked) {
    await recordAiUsage({
      kind: "ai_case_issue_analyze",
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

  const result = await analyzeCaseIssueExtraction({
    caseTitle: itemBundle.caseRef.caseTitle,
    factsSummaryMd: itemBundle.item.factsSummaryMd,
    masterIssues: itemBundle.approvedIssues,
    studentIssuesMd: attempt.studentIssuesMd,
    usage: { meta: { userId: user.id } },
  });
  if (!result) {
    return data(
      { error: "AI 분석에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  await setCaseAttemptAiAnalysis(client, user.id, parsed.data.itemId, result);
  return data({ ok: true as const, result });
}
