// 학생 본인 시리즈 추이 — 8회 동안 본인 점수 변화, 코호트 평균과의 비교, 누적 z-score, 종합 순위.
// 다른 학생 개별 점수는 노출되지 않음 (코호트 평균/표편만).

import {
  CrownIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Card, CardContent } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import {
  Bar,
  Chip,
  Section,
  StatTile,
} from "~/features/community/components/community-ui";
import {
  getGsSeries,
  getMySeriesProgress,
  getMySeriesSummary,
} from "~/features/gs/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/gs-my-series";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.series
      ? `${loaderData.series.title} 내 추이 | 리담변리사학원`
      : "내 시리즈 추이 | 리담변리사학원",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const seriesId = params.seriesId;
  if (!seriesId) throw data("Missing seriesId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [series, progress, summary] = await Promise.all([
    getGsSeries(client, seriesId),
    getMySeriesProgress(client, seriesId),
    getMySeriesSummary(client, seriesId),
  ]);
  if (!series) throw data("Series not found", { status: 404 });

  return { series, progress, summary };
}

export default function GsMySeries({ loaderData }: Route.ComponentProps) {
  const { series, progress, summary } = loaderData;

  const subjectLabel = LAW_SUBJECTS[series.subject]?.name ?? series.subject;

  return (
    <MockExamShell
      category="gs"
      backLink={{ to: "/gs", label: "온라인 GS" }}
      title={`시리즈 추이 · ${series.title}`}
      desc={
        summary
          ? `${subjectLabel} · 응시 ${summary.roundsTaken}회 · 반 평균 대비 추이`
          : `${subjectLabel} · 예정 ${series.expectedRounds}회 · 반 평균 대비 추이`
      }
    >
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="응시 회차" value={`${summary.roundsTaken}회`} />
          <StatTile
            label="평균 점수"
            value={String(summary.avgTotal)}
            tone="primary"
            emph
          />
          <StatTile
            label="평균 z-score"
            value={`${summary.avgZ > 0 ? "+" : ""}${summary.avgZ.toFixed(2)}σ`}
            tone={summary.avgZ >= 0 ? "emerald" : "coral"}
            sub={
              summary.avgZ >= 0.5
                ? "평균 이상"
                : summary.avgZ <= -0.5
                  ? "분발 필요"
                  : "평균 수준"
            }
          />
          <StatTile
            label="시리즈 순위"
            value={
              summary.totalStudents > 0
                ? `${summary.seriesRank} / ${summary.totalStudents}`
                : "—"
            }
            sub={
              summary.totalStudents > 0
                ? `상위 ${Math.round((summary.seriesRank / summary.totalStudents) * 100)}%`
                : undefined
            }
          />
        </div>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            아직 채점 완료된 응시가 없습니다. 회차 채점이 끝나면 추이가
            표시됩니다.
          </CardContent>
        </Card>
      )}

      {progress.length > 0 ? (
        <Section eyebrow="회차별 반 비교">
          <p className="text-muted-foreground mb-2.5 -mt-1 text-xs leading-relaxed">
            z-score는 같은 회차의 다른 응시자 평균(0σ) 기준 본인 위치입니다.
            +1σ ~ +2σ가 상위권, -1σ 이하면 분발이 필요합니다. 회차마다 난이도가
            달라도 z-score로 객관 비교할 수 있습니다.
          </p>
          <div className="bg-card overflow-hidden rounded-2xl border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b">
                    {[
                      ["#", "left"],
                      ["회차", "left"],
                      ["내 점수", "right"],
                      ["반 평균", "right"],
                      ["z-score", "left"],
                      ["순위", "left"],
                      ["분포 비교", "left"],
                    ].map(([label, align]) => (
                      <th
                        key={label}
                        className={cn(
                          "text-muted-foreground px-3.5 py-2.5 font-mono text-[11px] font-bold tracking-[0.06em] whitespace-nowrap uppercase",
                          align === "right" ? "text-right" : "text-left",
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {progress.map((p, i) => (
                    <tr
                      key={p.roundId}
                      className="border-border/60 hover:bg-muted/40 border-b transition-colors"
                    >
                      <td className="text-muted-foreground px-3.5 py-3 font-medium tabular-nums">
                        {p.roundNumber ?? i + 1}회
                      </td>
                      <td className="px-3.5 py-3">
                        <Link
                          to={`/gs/${p.roundId}/result`}
                          className="hover:text-link text-[13px] font-semibold hover:underline"
                        >
                          {p.roundTitle}
                        </Link>
                        <p className="text-muted-foreground text-[10px]">
                          {new Date(p.startAt).toLocaleDateString("ko-KR")}
                        </p>
                      </td>
                      <td className="px-3.5 py-3 text-right font-extrabold tabular-nums">
                        {p.myTotal}
                      </td>
                      <td className="text-muted-foreground px-3.5 py-3 text-right tabular-nums">
                        {p.cohortAvg}
                        <span className="ml-1 text-[10px]">
                          ±{p.cohortStdev}
                        </span>
                      </td>
                      <td className="px-3.5 py-3">
                        <ZScoreBadge z={p.myZ} />
                      </td>
                      <td className="px-3.5 py-3">
                        <RankCell
                          rank={p.myRank}
                          n={p.cohortN}
                          percentile={p.myPercentile}
                        />
                      </td>
                      <td className="px-3.5 py-3">
                        <ScoreBarPair
                          myTotal={p.myTotal}
                          cohortAvg={p.cohortAvg}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      ) : null}

      {progress.length >= 2 ? (
        <Section eyebrow="z-score 추이">
          <Card>
            <CardContent className="py-5">
              <ZScoreTrend points={progress} />
            </CardContent>
          </Card>
        </Section>
      ) : null}
    </MockExamShell>
  );
}

function ZScoreBadge({ z }: { z: number }) {
  const sign = z > 0 ? "+" : "";
  if (z >= 1) {
    return (
      <Chip tone="emerald" className="tabular-nums">
        <TrendingUpIcon className="size-3" /> {sign}
        {z.toFixed(2)}σ
      </Chip>
    );
  }
  if (z <= -1) {
    return (
      <Chip tone="coral" className="tabular-nums">
        <TrendingDownIcon className="size-3" /> {z.toFixed(2)}σ
      </Chip>
    );
  }
  return (
    <Chip tone="outline" className="tabular-nums">
      {sign}
      {z.toFixed(2)}σ
    </Chip>
  );
}

// 본인 점수 vs 코호트 평균 — 키트 BarPair (분포 비교 컬럼).
function ScoreBarPair({
  myTotal,
  cohortAvg,
}: {
  myTotal: number;
  cohortAvg: number;
}) {
  const max = Math.max(myTotal, cohortAvg, 1);
  return (
    <div className="w-40 space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-link w-7 shrink-0 font-mono text-[10px]">
          본인
        </span>
        <Bar value={myTotal} max={max} tone="primary" className="flex-1" />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground w-7 shrink-0 font-mono text-[10px]">
          평균
        </span>
        <Bar
          value={cohortAvg}
          max={max}
          className="bg-muted [&>div]:bg-muted-foreground/45 flex-1"
        />
      </div>
    </div>
  );
}

function RankCell({
  rank,
  n,
  percentile,
}: {
  rank: number;
  n: number;
  percentile: number;
}) {
  return (
    <div className="text-xs">
      <p className="inline-flex items-center gap-1 font-semibold tabular-nums">
        {rank === 1 ? (
          <CrownIcon className="text-amber-500 size-3.5" />
        ) : null}
        {rank} / {n}
      </p>
      <p className="text-muted-foreground text-[10px] tabular-nums">
        상위 {(100 - percentile).toFixed(0)}%
      </p>
    </div>
  );
}

// 회차 순서대로 z-score 막대 추이 — 차트 라이브러리 없이 인라인 시각화.
function ZScoreTrend({
  points,
}: {
  points: { roundNumber: number | null; myZ: number; roundTitle: string }[];
}) {
  const max = 2; // ±2σ 클램프
  return (
    <div className="space-y-2.5">
      <div className="flex items-end gap-2 overflow-x-auto pb-1">
        {points.map((p, i) => {
          const z = Math.max(-max, Math.min(max, p.myZ));
          const heightPct = (Math.abs(z) / max) * 100;
          const positive = p.myZ >= 0;
          const fill = positive ? "bg-emerald-500" : "bg-rose-500";
          const text = positive
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400";
          return (
            <div
              key={i}
              className="flex w-12 shrink-0 flex-col items-center"
              title={`${p.roundTitle}: ${p.myZ > 0 ? "+" : ""}${p.myZ.toFixed(2)}σ`}
            >
              <div className="bg-muted relative flex h-32 w-4 flex-col justify-center overflow-hidden rounded-full">
                {/* 가운데 평균선 */}
                <div className="bg-foreground/40 absolute top-1/2 left-0 h-px w-full" />
                {positive ? (
                  <div
                    className={cn(
                      "absolute bottom-1/2 left-0 w-full rounded-t-full transition-[height]",
                      fill,
                    )}
                    style={{ height: `${heightPct / 2}%` }}
                  />
                ) : (
                  <div
                    className={cn(
                      "absolute top-1/2 left-0 w-full rounded-b-full transition-[height]",
                      fill,
                    )}
                    style={{ height: `${heightPct / 2}%` }}
                  />
                )}
              </div>
              <p className="text-muted-foreground mt-1.5 font-mono text-[10px] tabular-nums">
                {p.roundNumber ?? i + 1}회
              </p>
              <p
                className={cn(
                  "font-mono text-[10px] font-bold tabular-nums",
                  text,
                )}
              >
                {p.myZ > 0 ? "+" : ""}
                {p.myZ.toFixed(1)}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        세로 가운데 선이 반 평균(0σ)입니다. 위로 갈수록 상위권, 아래로 갈수록
        하위권입니다.
      </p>
    </div>
  );
}
