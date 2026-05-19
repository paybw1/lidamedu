// 통합 1차 모의고사 시험 러너 (feat-10-005) — /latest/mcq/exam/:examId.
// 응시 시작 + 교시별 진행 상태·다음 교시 응시 허브. staff 는 교시 구성 패널.

import {
  CheckCircle2Icon,
  ClockIcon,
  LayersIcon,
  LockIcon,
  PlayIcon,
  RotateCcwIcon,
  TrophyIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { LatestEmpty, Pill } from "~/features/latest/components/latest-list";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { ExamPapersPanel } from "~/features/mcq-exams/components/exam-papers-panel";
import type {
  ExamAttemptInfo,
  ExamPaperStatus,
  ExamRunnerPaper,
  McqExamItem,
} from "~/features/mcq-exams/labels";
import { getExamRunnerData } from "~/features/mcq-exams/queries.server";
import {
  MCQ_PACK_SUBJECT_LABELS,
  isMockKind,
} from "~/features/mcq-packs/labels";
import { listPacks } from "~/features/mcq-packs/queries.server";

import type { Route } from "./+types/mcq-exam-runner";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d?.runner) {
    return [{ title: "통합 모의고사 | Lidam Patent Attorney Academy" }];
  }
  return [
    { title: `${d.runner.exam.title} | Lidam Patent Attorney Academy` },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.examId) throw data("Missing examId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const runner = await getExamRunnerData(client, params.examId, user.id);
  if (!runner) throw data("Exam not found", { status: 404 });

  const role = await getStaffRole(client, user.id);
  const canEdit = role !== null;

  // staff 교시 구성 패널 — 교시로 추가 가능한 공개 모의 팩 목록.
  let availablePacks: Array<{
    packId: string;
    title: string;
    subjectLabel: string;
  }> = [];
  if (canEdit) {
    const packs = await listPacks(client, {});
    const used = new Set(runner.papers.map((rp) => rp.paper.packId));
    availablePacks = packs
      .filter(
        (p) => isMockKind(p.kind) && p.isPublished && !used.has(p.packId),
      )
      .map((p) => ({
        packId: p.packId,
        title: p.title,
        subjectLabel: MCQ_PACK_SUBJECT_LABELS[p.subjectScope],
      }));
  }

  return { runner, canEdit, availablePacks };
}

export default function McqExamRunner({ loaderData }: Route.ComponentProps) {
  const { runner, canEdit, availablePacks } = loaderData;
  const { exam, papers, attempt } = runner;
  const noPapers = papers.length === 0;

  return (
    <MockExamShell
      category="full"
      width="feed"
      backLink={{ to: "/latest/mcq/exams", label: "통합 모의고사 목록" }}
      title={exam.title}
      desc={`${papers.length}교시 통합 — 전 과목 평균 ${exam.passAverage}점 이상 + 과목별 과락 회피 시 합격`}
    >
      {exam.description ? (
        <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
          {exam.description}
        </p>
      ) : null}

      {noPapers ? (
        <LatestEmpty
          icon={LayersIcon}
          tone="subdued"
          title="교시가 아직 구성되지 않았습니다"
          body={
            canEdit
              ? "아래 '교시 구성' 에서 과목별 모의 팩을 교시로 추가하세요."
              : "교시가 구성되면 응시할 수 있습니다."
          }
        />
      ) : (
        <>
          <StatusBanner exam={exam} attempt={attempt} papers={papers} />
          <ol className="mt-4 space-y-2.5">
            {papers.map((rp, idx) => (
              <PaperCard
                key={rp.paper.packId}
                runnerPaper={rp}
                index={idx + 1}
                attemptId={attempt?.attemptId ?? null}
              />
            ))}
          </ol>
        </>
      )}

      {canEdit ? (
        <div className="mt-6">
          <ExamPapersPanel
            examId={exam.examId}
            papers={papers}
            availablePacks={availablePacks}
          />
        </div>
      ) : null}
    </MockExamShell>
  );
}

function StatusBanner({
  exam,
  attempt,
  papers,
}: {
  exam: McqExamItem;
  attempt: ExamAttemptInfo | null;
  papers: ExamRunnerPaper[];
}) {
  const total = papers.length;
  const doneCount = papers.filter((p) => p.status === "completed").length;
  const inProgress = attempt !== null && attempt.completedAt === null;
  const completed = attempt !== null && attempt.completedAt !== null;
  const allDone = total > 0 && doneCount === total;

  // 응시 전 — 응시 시작.
  if (!attempt) {
    return (
      <div className="border-primary/20 bg-primary/[0.04] rounded-2xl border p-5">
        <p className="font-bold tracking-tight">응시 준비 완료</p>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          총 {total}교시 — 교시별로 타이머가 적용되며, 한 교시를 마치면 다음
          교시가 열립니다.
        </p>
        <Form method="post" action="/api/mcq-exam/start" className="mt-3">
          <input type="hidden" name="examId" value={exam.examId} />
          <Button
            type="submit"
            className="rounded-full"
            data-testid="exam-start"
          >
            <PlayIcon className="size-4" /> 응시 시작
          </Button>
        </Form>
      </div>
    );
  }

  // 완료 — 결과 보기 + 다시 응시.
  if (completed || allDone) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5">
        <p className="inline-flex items-center gap-1.5 font-bold tracking-tight">
          <CheckCircle2Icon className="size-4 text-emerald-600" />
          전 교시 응시 완료
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          채점 결과와 합격 판정·등수를 확인하세요.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild className="rounded-full">
            <Link
              to={`/latest/mcq/exam/${exam.examId}/result/${attempt.attemptId}`}
            >
              <TrophyIcon className="size-4" /> 결과 보기
            </Link>
          </Button>
          <Form
            method="post"
            action="/api/mcq-exam/start"
            onSubmit={(e) => {
              if (
                !confirm(
                  "새 응시를 시작하시겠습니까? 이전 응시 결과는 그대로 보존됩니다.",
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="examId" value={exam.examId} />
            <Button type="submit" variant="outline" className="rounded-full">
              <RotateCcwIcon className="size-4" /> 다시 응시
            </Button>
          </Form>
        </div>
      </div>
    );
  }

  // 응시 중.
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
      <p className="inline-flex items-center gap-1.5 font-bold tracking-tight">
        <ClockIcon className="size-4 text-amber-600" />
        응시 중 · {doneCount}/{total}교시 완료
      </p>
      <p className="text-muted-foreground mt-1 text-sm">
        아래에서 다음 교시를 응시하세요. 교시는 순서대로 진행됩니다.
      </p>
    </div>
  );
}

function PaperCard({
  runnerPaper,
  index,
  attemptId,
}: {
  runnerPaper: ExamRunnerPaper;
  index: number;
  attemptId: string | null;
}) {
  const { paper, status, sessionId } = runnerPaper;
  return (
    <li
      data-testid="exam-paper-card"
      data-status={status}
      className="border-border bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm"
    >
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums",
          status === "completed"
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : status === "locked"
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary",
        )}
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold tracking-tight">{paper.packTitle}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Pill tone="outline">
            {MCQ_PACK_SUBJECT_LABELS[paper.subjectScope]}
          </Pill>
          <Pill tone="neutral">문항 {paper.problemCount}</Pill>
          {paper.durationMin ? (
            <Pill tone="neutral">제한 {paper.durationMin}분</Pill>
          ) : null}
          <Pill tone="neutral">과락 {paper.failFloor}점</Pill>
        </div>
      </div>
      <div className="ml-auto shrink-0">
        <PaperAction
          status={status}
          packId={paper.packId}
          sessionId={sessionId}
          attemptId={attemptId}
        />
      </div>
    </li>
  );
}

function PaperAction({
  status,
  packId,
  sessionId,
  attemptId,
}: {
  status: ExamPaperStatus;
  packId: string;
  sessionId: string | null;
  attemptId: string | null;
}) {
  if (status === "completed") {
    return (
      <div className="flex items-center gap-1.5">
        <Pill tone="emerald">
          <CheckCircle2Icon className="size-3" /> 완료
        </Pill>
        {sessionId ? (
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-8 rounded-full"
          >
            <Link to={`/latest/mcq/${packId}/result/${sessionId}`}>결과</Link>
          </Button>
        ) : null}
      </div>
    );
  }
  // 응시 전(미리보기) — 액션 없음.
  if (!attemptId) return null;
  if (status === "locked") {
    return (
      <Pill tone="outline">
        <LockIcon className="size-3" /> 이전 교시 먼저
      </Pill>
    );
  }
  // available | in_progress
  return (
    <Form method="post" action="/api/mcq-pack/start">
      <input type="hidden" name="packId" value={packId} />
      <input type="hidden" name="examAttemptId" value={attemptId} />
      <input type="hidden" name="mode" value="exam" />
      <Button
        type="submit"
        size="sm"
        className="h-9 rounded-full"
        data-testid="paper-start"
      >
        <PlayIcon className="size-3.5" />
        {status === "in_progress" ? "이어서 응시" : "교시 응시"}
      </Button>
    </Form>
  );
}
