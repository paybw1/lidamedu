// 시리즈 통계 — 회차별 요약 + 학생 × 회차 매트릭스(점수 + z-score) + 시리즈 누적 z-score 순위.

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
  getSeriesMatrix,
  getSeriesRoundSummary,
  getSeriesStudentStats,
} from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-series-stats";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.series
      ? `${loaderData.series.title} 통계 | Lidam Edu`
      : "시리즈 통계 | Lidam Edu",
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
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const [series, roundSummary, studentStats, matrix] = await Promise.all([
    getGsSeries(client, seriesId),
    getSeriesRoundSummary(client, seriesId),
    getSeriesStudentStats(client, seriesId),
    getSeriesMatrix(client, seriesId),
  ]);
  if (!series) throw data("Series not found", { status: 404 });

  return { series, roundSummary, studentStats, matrix };
}

export default function AdminGsSeriesStats({
  loaderData,
}: Route.ComponentProps) {
  const { series, roundSummary, studentStats, matrix } = loaderData;

  // 매트릭스: 학생 × 회차로 재구성.
  const roundIds = roundSummary.map((r) => r.roundId);
  const roundLabels = new Map<string, { label: string; idx: number }>();
  roundSummary.forEach((r, i) =>
    roundLabels.set(r.roundId, {
      label: r.roundNumber ? `${r.roundNumber}회` : `R${i + 1}`,
      idx: i,
    }),
  );
  const byStudent = new Map<
    string,
    {
      userName: string | null;
      cells: Map<string, { totalScore: number; zScore: number }>;
    }
  >();
  for (const c of matrix) {
    const cur = byStudent.get(c.userId) ?? {
      userName: c.userName,
      cells: new Map(),
    };
    cur.cells.set(c.roundId, {
      totalScore: c.totalScore,
      zScore: c.zScore,
    });
    byStudent.set(c.userId, cur);
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <Link
          to="/admin/gs/series"
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 시리즈 목록
        </Link>
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <ChartLineIcon className="size-3.5" /> 시리즈 통계
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{series.title}</h1>
        <p className="text-muted-foreground text-sm">
          {LAW_SUBJECTS[series.subject]?.name ?? series.subject} · 예정{" "}
          {series.expectedRounds}회 · 등록{" "}
          {roundSummary.length}회 · 채점 완료 회차{" "}
          {roundSummary.filter((r) => r.n > 0).length}회
        </p>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-sm font-semibold tracking-tight">회차별 요약</h2>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead className="min-w-[200px]">회차</TableHead>
                <TableHead className="w-[80px]">N</TableHead>
                <TableHead className="w-[100px]">평균</TableHead>
                <TableHead className="w-[100px]">표준편차</TableHead>
                <TableHead className="w-[120px]">범위</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roundSummary.map((r, i) => (
                <TableRow key={r.roundId}>
                  <TableCell className="font-medium tabular-nums">
                    {r.roundNumber ?? i + 1}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/admin/gs/${r.roundId}/stats`}
                      className="hover:text-primary text-sm font-medium hover:underline"
                    >
                      {r.title}
                    </Link>
                    <p className="text-muted-foreground text-[10px]">
                      {new Date(r.startAt).toLocaleDateString("ko-KR")}
                    </p>
                  </TableCell>
                  <TableCell className="tabular-nums">{r.n}</TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    {r.n > 0 ? r.avgTotal : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.n > 0 ? `±${r.stdev}` : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.n > 0 ? `${r.minTotal} ~ ${r.maxTotal}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/admin/gs/${r.roundId}/stats`}
                      className="text-primary text-xs hover:underline"
                    >
                      상세 →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {studentStats.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-sm font-semibold tracking-tight">
              시리즈 종합 순위
            </h2>
            <p className="text-muted-foreground text-xs">
              회차별 z-score 평균 기준. 회차마다 난이도가 달라도 객관적 비교가
              가능합니다.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">순위</TableHead>
                  <TableHead className="min-w-[200px]">학생</TableHead>
                  <TableHead className="w-[100px]">응시</TableHead>
                  <TableHead className="w-[110px]">평균 점수</TableHead>
                  <TableHead className="w-[140px]">평균 z-score</TableHead>
                  <TableHead>편차</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentStats.map((s) => (
                  <TableRow key={s.userId}>
                    <TableCell>
                      <RankBadge rank={s.seriesRank} />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {s.userName ?? (
                          <span className="text-muted-foreground italic">
                            미설정
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground text-[10px] tabular-nums">
                        {s.userId.slice(0, 8)}
                      </p>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {s.roundsTaken}회
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      {s.avgTotal}
                    </TableCell>
                    <TableCell>
                      <ZScoreBadge z={s.avgZScore} />
                    </TableCell>
                    <TableCell>
                      <ZScoreBar z={s.avgZScore} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {byStudent.size > 0 ? (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold tracking-tight">
              학생 × 회차 매트릭스 (z-score)
            </h2>
            <p className="text-muted-foreground text-xs">
              각 셀: 회차 점수 / z-score. 색상은 z-score 기준 (녹/주/적). 빈 셀은
              해당 회차 미응시 또는 미채점.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card min-w-[180px]">
                    학생
                  </TableHead>
                  {roundIds.map((rid) => (
                    <TableHead
                      key={rid}
                      className="w-[110px] text-center text-[11px]"
                    >
                      {roundLabels.get(rid)?.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...byStudent.entries()]
                  .sort((a, b) => {
                    // 시리즈 평균 z-score 순으로 정렬.
                    const za =
                      studentStats.find((s) => s.userId === a[0])?.avgZScore ??
                      0;
                    const zb =
                      studentStats.find((s) => s.userId === b[0])?.avgZScore ??
                      0;
                    return zb - za;
                  })
                  .map(([uid, info]) => (
                    <TableRow key={uid}>
                      <TableCell className="sticky left-0 bg-card font-medium">
                        {info.userName ?? (
                          <span className="text-muted-foreground italic">
                            미설정
                          </span>
                        )}
                        <p className="text-muted-foreground text-[10px] tabular-nums">
                          {uid.slice(0, 8)}
                        </p>
                      </TableCell>
                      {roundIds.map((rid) => {
                        const cell = info.cells.get(rid);
                        if (!cell) {
                          return (
                            <TableCell
                              key={rid}
                              className="text-muted-foreground text-center text-xs"
                            >
                              —
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell
                            key={rid}
                            className={cn(
                              "text-center text-xs tabular-nums",
                              cell.zScore >= 1
                                ? "bg-emerald-50 dark:bg-emerald-950/30"
                                : cell.zScore <= -1
                                  ? "bg-rose-50 dark:bg-rose-950/30"
                                  : "",
                            )}
                          >
                            <p className="font-semibold">{cell.totalScore}</p>
                            <p
                              className={cn(
                                "text-[10px]",
                                cell.zScore >= 1
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : cell.zScore <= -1
                                    ? "text-rose-700 dark:text-rose-400"
                                    : "text-muted-foreground",
                              )}
                            >
                              {cell.zScore > 0 ? "+" : ""}
                              {cell.zScore.toFixed(2)}σ
                            </p>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            아직 시리즈에 채점 완료된 응시 데이터가 없습니다.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <Badge className="bg-amber-500 text-white text-[11px] hover:bg-amber-500">
        <CrownIcon className="size-3" /> {rank}
      </Badge>
    );
  if (rank <= 3)
    return (
      <Badge variant="default" className="text-[11px] tabular-nums">
        {rank}위
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[11px] tabular-nums">
      {rank}위
    </Badge>
  );
}

function ZScoreBadge({ z }: { z: number }) {
  const sign = z > 0 ? "+" : "";
  if (z >= 1)
    return (
      <Badge className="bg-emerald-600 text-white text-[11px] tabular-nums hover:bg-emerald-600">
        <TrendingUpIcon className="size-3" /> {sign}
        {z.toFixed(2)}σ
      </Badge>
    );
  if (z <= -1)
    return (
      <Badge className="bg-rose-600 text-white text-[11px] tabular-nums hover:bg-rose-600">
        <TrendingDownIcon className="size-3" /> {z.toFixed(2)}σ
      </Badge>
    );
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
