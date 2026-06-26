// 학생 — ③④ 결론·강약 응시 화면.
// 사실관계 + 쟁점 목록(처음부터 노출) → ConclusionWriteStage → SelfCheck → Done.
// ⑤ linked_gs_round_id 있으면 Done에서 답안작성 진입.

import { ArrowRightIcon } from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { Chip } from "~/features/community/components/community-ui";
import {
  getApprovedCaseTrainingItem,
  getMyConclusionAttempt,
} from "~/features/cases/queries-case-training.server";
import {
  ConclusionDoneStage,
  ConclusionSelfCheckStage,
  ConclusionWriteStage,
  determineConclusionPhase,
  type MasterIssueWithConclusion,
} from "~/features/issue-extraction";

import type { Route } from "./+types/case-training-conclusion";

export const meta: Route.MetaFunction = ({ data: d }) => [
  {
    title: d?.itemBundle?.caseRef.caseTitle
      ? `${d.itemBundle.caseRef.caseTitle} — 결론·강약 | 리담변리사학원`
      : "결론·강약 훈련 | 리담변리사학원",
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

  // 결론 정보가 있는 쟁점만 ③④ 트레이닝 대상.
  const issuesWithConclusion: MasterIssueWithConclusion[] =
    itemBundle.approvedIssues
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
  if (issuesWithConclusion.length < 2) {
    throw data(
      "③④ 결론·강약 훈련 준비 중입니다 (강사 채점기준 미설정).",
      { status: 404 },
    );
  }

  const attempt = await getMyConclusionAttempt(client, user.id, itemId);
  const phase = determineConclusionPhase(
    attempt
      ? {
          outlineMd: attempt.outlineMd,
          conclusions: attempt.conclusions,
          emphasisMap: attempt.emphasisMap,
          submittedAt: attempt.submittedAt,
          selfCheckedAt: attempt.selfCheckedAt,
          selfCheck: attempt.selfCheck,
          aiAnalysis: attempt.aiAnalysis,
        }
      : null,
  );

  return { itemBundle, issuesWithConclusion, attempt, phase };
}

export default function CaseTrainingConclusion({
  loaderData,
}: Route.ComponentProps) {
  const { itemBundle, issuesWithConclusion, attempt, phase } = loaderData;
  const { item, caseRef } = itemBundle;
  const hiddenFields = { itemId: item.itemId };
  const gsTakeHref =
    item.linkedGsRoundId !== null ? `/gs/${item.linkedGsRoundId}/take` : null;

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
          {caseRef.caseTitle} — 결론·강약 훈련
        </h1>
        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
          <Chip tone="outline">{caseRef.court}</Chip>
          <Chip tone="outline">{caseRef.decidedAt}</Chip>
        </div>
      </header>

      <section className="border-border bg-card mb-4 rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          사실관계
        </p>
        <p className="text-foreground whitespace-pre-line text-sm leading-relaxed">
          {item.factsSummaryMd}
        </p>
      </section>

      {phase === "blank" || phase === "in-progress" ? (
        <ConclusionWriteStage
          masterIssues={issuesWithConclusion}
          initialConclusions={attempt?.conclusions ?? null}
          initialEmphasis={attempt?.emphasisMap ?? null}
          initialOutlineMd={attempt?.outlineMd ?? ""}
          actionUrl="/api/case-training/conclusion-attempt"
          hiddenFields={hiddenFields}
        />
      ) : phase === "submitted" ? (
        <ConclusionSelfCheckStage
          studentConclusions={attempt!.conclusions}
          studentEmphasis={attempt!.emphasisMap}
          studentOutline={attempt!.outlineMd}
          masterIssues={issuesWithConclusion}
          previousSelfCheck={attempt!.selfCheck}
          savedAiAnalysis={attempt!.aiAnalysis}
          selfCheckActionUrl="/api/case-training/conclusion-attempt"
          aiActionUrl="/api/case-training/conclusion-analyze"
          hiddenFields={hiddenFields}
          aiConfirmMessage="AI 강약 코칭을 받습니다 (Claude 호출 — 비용 가드). 자기채점 결과는 그대로 유지됩니다."
        />
      ) : (
        <ConclusionDoneStage
          masterIssues={issuesWithConclusion}
          studentConclusions={attempt!.conclusions}
          studentEmphasis={attempt!.emphasisMap}
          studentOutline={attempt!.outlineMd}
          selfCheck={attempt!.selfCheck}
          savedAiAnalysis={attempt!.aiAnalysis}
          resetActionUrl="/api/case-training/conclusion-attempt"
          hiddenFields={hiddenFields}
          gsTakeHref={gsTakeHref}
          bottomSlot={
            gsTakeHref === null ? (
              <div className="border-amber-300/40 bg-amber-50/30 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-2xl border p-4">
                <p className="text-foreground text-sm font-bold">
                  연결된 답안 작성 회차가 없습니다
                </p>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  이 항목은 강사가 GS 회차를 연결하지 않았습니다. 답안 작성은
                  GS 메인에서 직접 회차를 골라 진행할 수 있습니다.
                </p>
                <Link
                  to="/gs"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-bold"
                >
                  GS 메인으로 <ArrowRightIcon className="size-4" />
                </Link>
              </div>
            ) : null
          }
        />
      )}
    </main>
  );
}
