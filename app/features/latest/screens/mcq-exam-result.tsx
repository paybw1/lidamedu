// 통합 1차 모의고사 응시 결과 (feat-10-005).
// /latest/mcq/exam/:examId/result/:attemptId — 평균·합격/불합격(과락 포함)·등수 + 교시별 점수.

import {
  CheckCircle2Icon,
  CircleXIcon,
  TrophyIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { cn } from "~/core/lib/utils";
import { IndexCard, Pill } from "~/features/latest/components/latest-list";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import { MCQ_PACK_SUBJECT_LABELS } from "~/features/mcq-packs/labels";
import {
  getExamAttemptBreakdown,
  getExamAttemptRanking,
} from "~/features/mcq-exams/queries.server";

import type { Route } from "./+types/mcq-exam-result";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d?.breakdown) {
    return [{ title: "응시 결과 | Lidam Patent Attorney Academy" }];
  }
  return [
    {
      title: `${d.breakdown.examTitle} 응시 결과 | Lidam Patent Attorney Academy`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.examId || !params.attemptId) {
    throw data("Missing id", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const breakdown = await getExamAttemptBreakdown(
    client,
    user.id,
    params.attemptId,
  );
  if (!breakdown || breakdown.examId !== params.examId) {
    throw data("Attempt not found", { status: 404 });
  }

  // 등수 RPC 는 최신 완료 응시 기준 — 보고 있는 응시가 최신일 때만 노출.
  const ranking = await getExamAttemptRanking(client, params.examId);
  const showRanking = ranking !== null && ranking.attemptId === params.attemptId;

  return { breakdown, ranking: showRanking ? ranking : null };
}

function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function McqExamResult({ loaderData }: Route.ComponentProps) {
  const { breakdown, ranking } = loaderData;
  const { papers, average, passAverage, passed, hasFloorFail } = breakdown;

  const failReason =
    passed === false
      ? hasFloorFail
        ? "과목 과락"
        : "평균 미달"
      : null;

  return (
    <MockExamShell
      category="full"
      width="index"
      backLink={{
        to: `/latest/mcq/exam/${breakdown.examId}`,
        label: "시험으로 돌아가기",
      }}
      title={`${breakdown.examTitle} — 응시 결과`}
      desc={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Pill tone="outline">{papers.length}교시 통합</Pill>
          {breakdown.completedAt ? (
            <Pill tone="emerald">제출 완료</Pill>
          ) : (
            <Pill tone="amber">진행 중</Pill>
          )}
        </span>
      }
    >
      {/* 평균 점수 · 합격 판정 · 등수 */}
      <div className="border-border bg-card mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <span className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
            전 과목 평균
          </span>
          <span
            data-testid="exam-average"
            className="text-primary text-4xl font-extrabold tabular-nums"
          >
            {fmtScore(average)}
          </span>
          <span className="text-muted-foreground text-sm">/ 100점</span>
          {passed === true ? (
            <span data-testid="exam-verdict">
              <Pill tone="emerald">합격</Pill>
            </span>
          ) : passed === false ? (
            <span data-testid="exam-verdict">
              <Pill tone="rose">불합격 · {failReason}</Pill>
            </span>
          ) : null}
          <span className="text-muted-foreground text-xs tabular-nums">
            합격 기준 평균 {passAverage}점 이상 · 과목별 과락 회피
          </span>
        </div>
        {ranking ? (
          <div className="text-right">
            <p className="inline-flex items-center gap-1 text-lg font-bold tabular-nums">
              <TrophyIcon className="text-primary size-4" />
              전체 {ranking.totalTakers}명 중{" "}
              <span className="text-primary">{ranking.rank}등</span>
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              백분위 {ranking.percentile} · 표준점수 z {ranking.zScore}
            </p>
          </div>
        ) : null}
      </div>

      {/* 교시별 점수 */}
      <p className="mb-2 text-sm font-bold tracking-tight">
        교시별 점수
        <span className="text-muted-foreground ml-2 text-xs font-normal">
          교시를 클릭하면 유형·지문별 분석을 볼 수 있습니다.
        </span>
      </p>
      <IndexCard>
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-border bg-muted/60 border-b">
              {["교시", "과목", "정답", "점수", "과락선", "판정"].map(
                (h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "text-muted-foreground px-3 py-3 font-mono text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
                      i === 0 || i >= 2 ? "text-center" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {papers.map((p, idx) => (
              <tr
                key={p.packId}
                data-testid="exam-paper-row"
                className="border-border/60 hover:bg-muted/40 border-b transition-colors"
              >
                <td className="text-muted-foreground px-3 py-3 text-center text-[13px] tabular-nums">
                  {idx + 1}교시
                </td>
                <td className="px-3 py-3 text-[13px]">
                  <Link
                    to={`/latest/mcq/${p.packId}/result/${p.sessionId}`}
                    className="hover:text-primary font-medium"
                  >
                    {p.packTitle}
                  </Link>
                  <span className="text-muted-foreground ml-1.5 text-[11px]">
                    {MCQ_PACK_SUBJECT_LABELS[p.subjectScope]}
                  </span>
                </td>
                <td className="px-3 py-3 text-center text-[13px] tabular-nums">
                  {p.correct} / {p.total}
                </td>
                <td
                  className={cn(
                    "px-3 py-3 text-center text-[13px] font-bold tabular-nums",
                    p.belowFloor ? "text-rose-600" : "text-foreground",
                  )}
                >
                  {fmtScore(p.score)}점
                </td>
                <td className="text-muted-foreground px-3 py-3 text-center text-[13px] tabular-nums">
                  {p.failFloor}점
                </td>
                <td className="px-3 py-3 text-center">
                  {p.belowFloor ? (
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-rose-600">
                      <CircleXIcon className="size-4" /> 과락
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-600">
                      <CheckCircle2Icon className="size-4" /> 통과
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </IndexCard>

      {hasFloorFail ? (
        <p className="text-muted-foreground mt-3 text-xs">
          한 과목이라도 과락선 미만이면 평균과 무관하게 불합격입니다.
        </p>
      ) : null}
    </MockExamShell>
  );
}
