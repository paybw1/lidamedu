// 학생 — ③④ 결론·강약 응시 화면.
// 사실관계 + 쟁점 목록(처음부터 노출) → ConclusionWriteStage → SelfCheck → Done.
// ⑤ linked_gs_round_id 있으면 Done에서 답안작성 진입.

import { ArrowRightIcon, TimerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { Chip } from "~/features/community/components/community-ui";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";
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
    title: d?.itemBundle?.problemRef
      ? `${d.itemBundle.problemRef.year ?? "?"}년 2차 제${d.itemBundle.problemRef.problemNumber ?? "?"}문 — 결론·강약 | 리담변리사학원`
      : d?.itemBundle?.caseRef.caseTitle
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
  const { item, caseRef, problemRef } = itemBundle;
  const hiddenFields = { itemId: item.itemId };
  const gsTakeHref =
    item.linkedGsRoundId !== null ? `/gs/${item.linkedGsRoundId}/take` : null;
  const subjectLabel = problemRef?.lawCode
    ? (LAW_SUBJECTS[problemRef.lawCode as LawSubjectSlug]?.name ??
      problemRef.lawCode)
    : null;

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
          {problemRef
            ? `${subjectLabel ?? ""} ${problemRef.year ?? "?"}년 2차 제${problemRef.problemNumber ?? "?"}문 — 결론·강약 훈련`.trim()
            : `${caseRef.caseTitle} — 결론·강약 훈련`}
        </h1>
        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
          {problemRef ? (
            <Chip tone="primary">2차 기출</Chip>
          ) : (
            <>
              <Chip tone="outline">{caseRef.court}</Chip>
              <Chip tone="outline">{caseRef.decidedAt}</Chip>
            </>
          )}
        </div>
      </header>

      <section className="border-border bg-card mb-4 rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          {problemRef ? "발문" : "사실관계"}
        </p>
        <p className="text-foreground whitespace-pre-line text-sm leading-relaxed">
          {problemRef ? problemRef.bodyMd : item.factsSummaryMd}
        </p>
      </section>

      {phase === "blank" || phase === "in-progress" ? (
        <OutlineTimerHint />
      ) : null}

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
          aiConfirmMessage="AI 강약 코칭을 받습니다. AI 사용 한도가 적용되며, 자기채점 결과는 그대로 유지됩니다. 계속하시겠습니까?"
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

/**
 * 목차·강약 작성 소프트 타이머 — 실전(2차)은 목차 구상이 10~15분 안에 끝나야
 * 답안 작성 시간이 남는다. 강제 마감 없이 경과만 보여준다(초과 시 색만 전환).
 */
const OUTLINE_RECOMMENDED_MIN = 15;

function OutlineTimerHint() {
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const over = elapsedSec >= OUTLINE_RECOMMENDED_MIN * 60;
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");
  return (
    <div
      className={
        "mb-4 flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs " +
        (over
          ? "border-amber-400/60 bg-amber-50/60 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
          : "bg-muted/40 text-muted-foreground")
      }
    >
      <TimerIcon className="size-3.5" />
      <span>
        경과 <strong className="tabular-nums">{mm}:{ss}</strong> · 권장 목차
        작성 시간 {OUTLINE_RECOMMENDED_MIN}분
        {over ? " — 실전에서는 이제 답안 작성으로 넘어가야 할 시간입니다." : ""}
      </span>
    </div>
  );
}
