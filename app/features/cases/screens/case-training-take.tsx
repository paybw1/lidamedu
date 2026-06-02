// 학생 — 판례 기반 쟁점추출 응시.
// phase machine: blank → in-progress → submitted → self-checked.
// 공통 모듈(features/issue-extraction) 의 WriteStage/SelfCheckStage/DoneStage 사용.
// 게이트: phase='self-checked' 단계에서만 판례 전문 PDF URL 발급.

import { ArrowLeftIcon } from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { Chip } from "~/features/community/components/community-ui";
import {
  getApprovedCaseTrainingItem,
  getMyCaseAttempt,
} from "~/features/cases/queries-case-training.server";
import {
  DoneStage,
  SelfCheckStage,
  WriteStage,
  determinePhase,
} from "~/features/issue-extraction";

import type { Route } from "./+types/case-training-take";

export const meta: Route.MetaFunction = ({ data: d }) => [
  {
    title: d?.itemBundle?.caseRef.caseTitle
      ? `${d.itemBundle.caseRef.caseTitle} — 쟁점추출 | Lidam`
      : "쟁점추출 훈련 | Lidam",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const itemId = params.itemId;
  if (!itemId) throw data("Missing itemId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const itemBundle = await getApprovedCaseTrainingItem(client, itemId);
  if (!itemBundle)
    throw data("승인되지 않았거나 존재하지 않는 항목입니다.", { status: 404 });

  const attempt = await getMyCaseAttempt(client, user.id, itemId);
  const phase = determinePhase(
    attempt
      ? {
          studentIssuesMd: attempt.studentIssuesMd,
          submittedAt: attempt.submittedAt,
          selfCheckedAt: attempt.selfCheckedAt,
          selfCheck: attempt.selfCheck,
          aiAnalysis: attempt.aiAnalysis,
        }
      : null,
  );

  // PDF 게이트: 채점 완료(self-checked) 단계에서만 URL 노출.
  // /api/cases/:caseId/official-text-pdf 는 매 클릭마다 fresh signed URL.
  const pdfUrl =
    phase === "self-checked" && itemBundle.caseRef.hasPdf
      ? `/api/cases/${itemBundle.caseRef.caseId}/official-text-pdf`
      : null;

  return { itemBundle, attempt, phase, pdfUrl };
}

export default function CaseTrainingTake({
  loaderData,
}: Route.ComponentProps) {
  const { itemBundle, attempt, phase, pdfUrl } = loaderData;
  const { item, caseRef, approvedIssues } = itemBundle;
  const hiddenFields = { itemId: item.itemId };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-4">
        <Link
          to="/case-training"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← 목록으로
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-extrabold tracking-tight">
          {caseRef.caseTitle}
        </h1>
        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
          <Chip tone="outline">{caseRef.court}</Chip>
          <Chip tone="outline">{caseRef.decidedAt}</Chip>
          {phase === "self-checked" ? (
            <Chip tone="outline">{caseRef.caseNumber}</Chip>
          ) : null}
        </div>
      </header>

      {/* 사실관계 — 모든 phase 노출. 쟁점·판단 누출 금지(강사 lint 통과 후 노출). */}
      <section className="border-border bg-card mb-4 rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          사실관계
        </p>
        <p className="text-foreground whitespace-pre-line text-sm leading-relaxed">
          {item.factsSummaryMd}
        </p>
      </section>

      {phase === "blank" || phase === "in-progress" ? (
        <WriteStage
          initialDraft={attempt?.studentIssuesMd ?? ""}
          actionUrl="/api/case-training/attempt"
          hiddenFields={hiddenFields}
          placeholder={`예:
신규성 위반 여부 — 제29조 제1항
진보성 판단 — 통상의 기술자`}
        />
      ) : phase === "submitted" ? (
        <SelfCheckStage
          studentDraft={attempt!.studentIssuesMd}
          masterIssues={approvedIssues}
          previousSelfCheck={attempt!.selfCheck}
          savedAiAnalysis={attempt!.aiAnalysis}
          selfCheckActionUrl="/api/case-training/attempt"
          aiActionUrl="/api/case-training/analyze"
          hiddenFields={hiddenFields}
          aiConfirmMessage="AI 의견을 받습니다 (Claude 호출 — 비용 가드 적용). 자기채점 결과는 그대로 유지됩니다."
        />
      ) : (
        <DoneStage
          studentDraft={attempt!.studentIssuesMd}
          masterIssues={approvedIssues}
          selfCheck={attempt!.selfCheck}
          savedAiAnalysis={attempt!.aiAnalysis}
          resetActionUrl="/api/case-training/attempt"
          hiddenFields={hiddenFields}
          primaryAction={
            <Link
              to="/case-training"
              className="border-input bg-background hover:bg-accent inline-flex items-center gap-1 rounded-full border px-4 py-2 text-sm font-medium"
            >
              <ArrowLeftIcon className="size-4" /> 목록으로
            </Link>
          }
          topSlot={
            pdfUrl ? (
              <div className="border-primary/30 bg-primary/[0.04] flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3">
                <div className="text-xs">
                  <p className="text-foreground font-bold">
                    🎉 채점 완료 — 판례 전문이 공개되었습니다
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    출제자가 실제로 어떻게 판단했는지 확인해보세요.
                  </p>
                </div>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-bold"
                >
                  📄 판례 전문 PDF
                </a>
              </div>
            ) : null
          }
        />
      )}
    </main>
  );
}
