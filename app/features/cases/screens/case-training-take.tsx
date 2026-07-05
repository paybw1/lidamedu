// 학생 — 판례 기반 쟁점추출 응시.
// phase machine: blank → in-progress → submitted → self-checked.
// 공통 모듈(features/issue-extraction) 의 WriteStage/SelfCheckStage/DoneStage 사용.
// 게이트: phase='self-checked' 단계에서만 판례 전문 PDF URL 발급.

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { Chip } from "~/features/community/components/community-ui";
import {
  getApprovedCaseTrainingItem,
  getMyCaseAttempt,
  isConclusionTrainingReady,
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
      ? `${d.itemBundle.caseRef.caseTitle} — 쟁점추출 | 리담변리사학원`
      : "쟁점추출 훈련 | 리담변리사학원",
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

  // ③④ 결론·강약 훈련 진입 — 준비된 경우만(채점 후 노출).
  const conclusionReady =
    phase === "self-checked"
      ? await isConclusionTrainingReady(client, itemId)
      : false;

  return { itemBundle, attempt, phase, pdfUrl, conclusionReady };
}

export default function CaseTrainingTake({
  loaderData,
}: Route.ComponentProps) {
  const { itemBundle, attempt, phase, pdfUrl, conclusionReady } = loaderData;
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
          aiConfirmMessage="AI 의견을 받습니다. AI 사용 한도가 적용되며, 자기채점 결과는 그대로 유지됩니다. 계속하시겠습니까?"
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
            <>
              {conclusionReady ? (
                <Link
                  to={`/case-training/${item.itemId}/conclusion`}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-bold"
                >
                  ③ 결론·강약 훈련으로 →
                </Link>
              ) : null}
              {item.linkedGsRoundId !== null && !conclusionReady ? (
                <Link
                  to={`/gs/${item.linkedGsRoundId}/take`}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-bold"
                >
                  답안 작성으로 <ArrowRightIcon className="size-4" />
                </Link>
              ) : null}
              <Link
                to="/case-training"
                className="border-input bg-background hover:bg-accent inline-flex items-center gap-1 rounded-full border px-4 py-2 text-sm font-medium"
              >
                <ArrowLeftIcon className="size-4" /> 목록으로
              </Link>
            </>
          }
          topSlot={
            <div className="space-y-3">
              {pdfUrl ? (
                <div className="border-primary/30 bg-primary/[0.04] flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3">
                  <div className="text-xs">
                    <p className="text-foreground font-bold">
                      🎉 채점 완료 — 판례 전문이 공개되었습니다
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      출제자가 실제로 어떻게 판단했는지 확인해 보세요.
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
              ) : null}
              <NextStepBox
                conclusionReady={conclusionReady}
                linkedGsRoundId={item.linkedGsRoundId}
                itemId={item.itemId}
              />
            </div>
          }
        />
      )}
    </main>
  );
}

/**
 * 채점 후 "다음 단계" 안내 박스.
 * 1순위: ③④ 결론·강약 (준비된 경우, 권장 동선)
 * 2순위: 답안 작성 (linked 있을 때, ③④을 건너뛰는 보조 동선)
 * 모두 없으면: GS 메인으로 (회차 직접 고르기)
 */
function NextStepBox({
  conclusionReady,
  linkedGsRoundId,
  itemId,
}: {
  conclusionReady: boolean;
  linkedGsRoundId: string | null;
  itemId: string;
}) {
  // 둘 다 없으면 단순 안내.
  if (!conclusionReady && linkedGsRoundId === null) {
    return (
      <div className="border-border bg-card rounded-2xl border p-4 text-sm">
        <p className="text-foreground font-bold">다음 단계</p>
        <p className="text-muted-foreground mt-1 text-xs">
          이 항목은 ③④ 결론·강약 채점기준이 준비 중이고 GS 회차도 연결돼 있지
          않습니다. GS 메인에서 직접 회차를 골라 답안 작성으로 이어갈 수
          있습니다.
        </p>
        <Link
          to="/gs"
          className="text-link mt-2 inline-flex items-center gap-1 text-xs font-bold hover:underline"
        >
          GS 메인으로 <ArrowRightIcon className="size-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="border-primary/20 bg-primary/[0.03] rounded-2xl border p-4 text-sm">
      <p className="text-foreground font-bold">다음 단계</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed">
        {conclusionReady ? (
          <li>
            <span className="text-muted-foreground">권장: </span>
            <Link
              to={`/case-training/${itemId}/conclusion`}
              className="text-link font-bold hover:underline"
            >
              ③④ 결론·강약 훈련으로 →
            </Link>{" "}
            <span className="text-muted-foreground">
              (결론 방향과 답안 목차·강약을 정리)
            </span>
          </li>
        ) : null}
        {linkedGsRoundId !== null ? (
          <li>
            <span className="text-muted-foreground">
              {conclusionReady ? "건너뛰기: " : "이어서: "}
            </span>
            <Link
              to={`/gs/${linkedGsRoundId}/take`}
              className="text-link font-bold hover:underline"
            >
              ⑤ 답안 작성으로 →
            </Link>{" "}
            <span className="text-muted-foreground">
              {conclusionReady
                ? "(③④을 먼저 거치는 걸 권장)"
                : "(이 항목 전용 GS 회차)"}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
