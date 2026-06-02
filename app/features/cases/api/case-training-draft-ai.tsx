// 강사 — AI 초안 생성. mode="facts" → 사실관계 요약. mode="issues" → 쟁점 목록.
// GS 비용 가드 재사용 (kind = ai_case_facts_draft / ai_case_issues_draft).

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import {
  draftCaseFactsFromCase,
  draftCaseIssuesFromCase,
} from "~/features/cases/lib/ai-case-drafter.server";
import { draftCaseConclusionsFromIssues } from "~/features/cases/lib/ai-case-conclusion-drafter.server";
import {
  bulkApplyAiConclusionDrafts,
  bulkInsertCaseTrainingIssues,
  getCaseTrainingItemForStaff,
  updateCaseTrainingItemFacts,
} from "~/features/cases/queries-case-training.server";
import {
  capBlockedMessage,
  checkAiCap,
  notifyCapReachedOnce,
  recordAiUsage,
} from "~/features/gs/lib/usage-tracker.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/case-training-draft-ai";

const schema = z.object({
  itemId: z.string().uuid(),
  mode: z.enum(["facts", "issues", "conclusions"]),
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
    itemId: fd.get("itemId"),
    mode: fd.get("mode"),
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  const item = await getCaseTrainingItemForStaff(client, parsed.data.itemId);
  if (!item) return data({ error: "Item not found" }, { status: 404 });
  if (!item.caseOfficialTextMd || item.caseOfficialTextMd.trim().length < 200) {
    return data(
      { error: "판례 전문이 비어있거나 너무 짧아 AI 초안 생성 불가합니다." },
      { status: 400 },
    );
  }

  const kind =
    parsed.data.mode === "facts"
      ? ("ai_case_facts_draft" as const)
      : parsed.data.mode === "issues"
        ? ("ai_case_issues_draft" as const)
        : ("ai_case_conclusion_draft" as const);

  // cap preflight.
  const capCheck = await checkAiCap();
  if (capCheck.blocked) {
    await recordAiUsage({
      kind,
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

  const args = {
    caseTitle: item.caseRef.caseTitle,
    caseNumber: item.caseRef.caseNumber,
    court: item.caseRef.court,
    decidedAt: item.caseRef.decidedAt,
    officialTextMd: item.caseOfficialTextMd,
    usage: { meta: { userId: user.id } },
  };

  if (parsed.data.mode === "facts") {
    const factsMd = await draftCaseFactsFromCase(args);
    if (!factsMd) {
      return data(
        { error: "AI 사실관계 초안 생성 실패 — API 키/전문 점검 필요." },
        { status: 500 },
      );
    }
    await updateCaseTrainingItemFacts(client, item.item.itemId, factsMd, "ai");
    return data({ ok: true as const, mode: "facts" as const, factsMd });
  }

  if (parsed.data.mode === "issues") {
    const issues = await draftCaseIssuesFromCase(args);
    if (!issues) {
      return data(
        { error: "AI 쟁점 초안 생성 실패 — API 키/전문 점검 필요." },
        { status: 500 },
      );
    }
    await bulkInsertCaseTrainingIssues(
      client,
      item.item.itemId,
      issues,
      "ai",
      user.id,
    );
    return data({ ok: true as const, mode: "issues" as const, inserted: issues.length });
  }

  // mode === "conclusions"
  const liveIssues = item.issues.filter(
    (i) => i.reviewStatus !== "rejected",
  );
  if (liveIssues.length < 2) {
    return data(
      { error: "결론 초안 생성에는 쟁점 ≥2건이 필요합니다." },
      { status: 400 },
    );
  }
  const conclusions = await draftCaseConclusionsFromIssues({
    caseTitle: item.caseRef.caseTitle,
    caseNumber: item.caseRef.caseNumber,
    factsSummaryMd: item.item.factsSummaryMd,
    officialTextMd: item.caseOfficialTextMd,
    issues: liveIssues.map((i) => ({
      issueId: i.issueId,
      label: i.label,
      descriptionMd: i.descriptionMd,
      importance: i.importance,
      refHint: i.refHint,
    })),
    usage: { meta: { userId: user.id } },
  });
  if (!conclusions) {
    return data(
      { error: "AI 결론 초안 생성 실패." },
      { status: 500 },
    );
  }
  await bulkApplyAiConclusionDrafts(client, conclusions);
  return data({
    ok: true as const,
    mode: "conclusions" as const,
    inserted: conclusions.length,
  });
}
