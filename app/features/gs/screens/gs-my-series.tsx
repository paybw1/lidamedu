// 학생 본인 시리즈 추이 — 8회 동안 본인 점수 변화, 코호트 평균과의 비교, 누적 z-score, 종합 순위.
// 다른 학생 개별 점수는 노출되지 않음 (코호트 평균/표편만).

import {
  ArrowLeftIcon,
  ChartLineIcon,
  CrownIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
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
      ? `${loaderData.series.title} 내 추이 | Lidam Edu`
      : "내 시리즈 추이 | Lidam Edu",
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

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <Link
          to="/gs"
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 온라인 GS
        </Link>
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <ChartLineIcon className="size-3.5" /> 내 시리즈 추이
        </p>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">
          {series.title}
        </h1>
        <p className="text-muted-foreground text-sm">
          {LAW_SUBJECTS[series.subject]?.name ?? series.subject} · 예정{" "}
          {series.expectedRounds}회
        </p>
      </header>

      {summary ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <SummaryCard label="응시 회차" value={`${summary.roundsTaken}회`} />
          <SummaryCard
            label="평균 점수"
            value={String(summary.avgTotal)}
          />
          <SummaryCard
            label="평균 z-score"
            value={`${summary.avgZ > 0 ? "+" : ""}${summary.avgZ.toFixed(2)}σ`}
            tone={
              summary.avgZ >= 1 ? "ok" : summary.avgZ <= -1 ? "bad" : undefined
            }
            hint={
              summary.avgZ >= 0.5
                ? "평균 이상"
                : summary.avgZ <= -0.5
                  ? "분발 필요"
                  : "평균 수준"
            }
          />
          <SummaryCard
            label="시리즈 종합 순위"
            value={
              summary.totalStudents > 0
                ? `${summary.seriesRank} / ${summary.totalStudents}`
                : "—"
            }
            hint={
              summary.totalStudents > 0
                ? `상위 ${Math.round((summary.seriesRank / summary.totalStudents) * 100)}%`
                : undefined
            }
          />
        </div>
      ) : (
        <Card className="mb-6">
          <CardContent className="text-muted-foreground py-6 text-center text-sm">
            아직 채점 완료된 응시가 없습니다. 회차 채점이 끝나면 추이가
            표시됩니다.
          </CardContent>
        </Card>
      )}

      {progress.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-sm font-semibold tracking-tight">
              회차별 내 점수와 코호트 비교
            </h2>
            <p className="text-muted-foreground text-xs">
              z-score 는 같은 회차의 다른 응시자 평균(0σ) 기준 본인 위치입니다. +1σ
              ~ +2σ 가 상위권, -1σ 이하면 분발이 필요합니다. 회차마다 난이도가
              달라도 z-score 로 객관 비교할 수 있습니다.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead className="min-w-[180px]">회차</TableHead>
                  <TableHead className="w-[100px]">내 점수</TableHead>
                  <TableHead className="w-[120px]">코호트 평균</TableHead>
                  <TableHead className="w-[120px]">z-score</TableHead>
                  <TableHead className="w-[120px]">순위</TableHead>
                  <TableHead>편차</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {progress.map((p, i) => (
                  <TableRow key={p.roundId}>
                    <TableCell className="font-medium tabular-nums">
                      {p.roundNumber ?? i + 1}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/gs/${p.roundId}/result`}
                        className="hover:text-primary text-sm font-medium hover:underline"
                      >
                        {p.roundTitle}
                      </Link>
                      <p className="text-muted-foreground text-[10px]">
                        {new Date(p.startAt).toLocaleDateString("ko-KR")}
                      </p>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      {p.myTotal}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {p.cohortAvg}
                      <span className="text-muted-foreground ml-1 text-[10px]">
                        ±{p.cohortStdev}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ZScoreBadge z={p.myZ} />
                    </TableCell>
                    <TableCell>
                      <RankCell
                        rank={p.myRank}
                        n={p.cohortN}
                        percentile={p.myPercentile}
                      />
                    </TableCell>
                    <TableCell>
                      <ZScoreBar z={p.myZ} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {progress.length >= 2 ? (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold tracking-tight">
              z-score 추이
            </h2>
            <p className="text-muted-foreground text-xs">
              회차에 따라 본인의 상대 위치가 어떻게 변했는지 시각화. 위쪽으로 갈수록
              상위권.
            </p>
          </CardHeader>
          <CardContent>
            <ZScoreTrend points={progress} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "bad";
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
          {label}
        </p>
        <p
          className={cn(
            "mt-1 text-xl font-bold tabular-nums",
            tone === "ok" && "text-emerald-600 dark:text-emerald-400",
            tone === "bad" && "text-rose-600 dark:text-rose-400",
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="text-muted-foreground mt-1 text-[10px]">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ZScoreBadge({ z }: { z: number }) {
  const sign = z > 0 ? "+" : "";
  if (z >= 1) {
    return (
      <Badge className="bg-emerald-600 text-white text-[11px] tabular-nums hover:bg-emerald-600">
        <TrendingUpIcon className="size-3" /> {sign}
        {z.toFixed(2)}σ
      </Badge>
    );
  }
  if (z <= -1) {
    return (
      <Badge className="bg-rose-600 text-white text-[11px] tabular-nums hover:bg-rose-600">
        <TrendingDownIcon className="size-3" /> {z.toFixed(2)}σ
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[11px] tabular-nums">
      {sign}
      {z.toFixed(2)}σ
    </Badge>
  );
}

function ZScoreBar({ z }: { z: number }) {
  const clamped = Math.max(-2, Math.min(2, z));
  const widthPct = (Math.abs(clamped) / 2) * 50;
  const tone =
    z >= 1
      ? "bg-emerald-500"
      : z <= -1
        ? "bg-rose-500"
        : "bg-muted-foreground/40";
  return (
    <div className="relative h-2 w-32 rounded-full bg-muted">
      <div className="bg-foreground/30 absolute left-1/2 top-0 h-full w-px" />
      {z >= 0 ? (
        <div
          className={cn("absolute left-1/2 top-0 h-full rounded-r-full", tone)}
          style={{ width: `${widthPct}%` }}
        />
      ) : (
        <div
          className={cn("absolute right-1/2 top-0 h-full rounded-l-full", tone)}
          style={{ width: `${widthPct}%` }}
        />
      )}
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
    <div className="space-y-2">
      <div className="flex items-end gap-2 overflow-x-auto pb-2">
        {points.map((p, i) => {
          const z = Math.max(-max, Math.min(max, p.myZ));
          const heightPct = (Math.abs(z) / max) * 100;
          const tone =
            p.myZ >= 1
              ? "bg-emerald-500"
              : p.myZ <= -1
                ? "bg-rose-500"
                : "bg-primary/60";
          return (
            <div
              key={i}
              className="flex w-12 shrink-0 flex-col items-center"
              title={`${p.roundTitle}: ${p.myZ > 0 ? "+" : ""}${p.myZ.toFixed(2)}σ`}
            >
              <div className="bg-muted relative flex h-32 w-3 flex-col justify-center overflow-hidden rounded-full">
                {/* 가운데 평균선 */}
                <div className="bg-foreground/40 absolute top-1/2 left-0 h-px w-full" />
                {p.myZ >= 0 ? (
                  <div
                    className={cn(
                      "absolute bottom-1/2 left-0 w-full rounded-t-full",
                      tone,
                    )}
                    style={{ height: `${heightPct / 2}%` }}
                  />
                ) : (
                  <div
                    className={cn(
                      "absolute top-1/2 left-0 w-full rounded-b-full",
                      tone,
                    )}
                    style={{ height: `${heightPct / 2}%` }}
                  />
                )}
              </div>
              <p className="text-muted-foreground mt-1 text-[10px] tabular-nums">
                {p.roundNumber ?? i + 1}회
              </p>
              <p className="font-mono text-[10px] tabular-nums">
                {p.myZ > 0 ? "+" : ""}
                {p.myZ.toFixed(1)}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground text-[10px]">
        세로 가운데 선이 코호트 평균(0σ). 위로 갈수록 상위권, 아래로 갈수록 하위권.
      </p>
    </div>
  );
}
