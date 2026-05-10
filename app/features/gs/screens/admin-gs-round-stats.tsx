// 회차 통계 — 학생별 총점·z-score·순위 + 4문제(또는 N문제) 각 분포(평균/표편/사분위).

import {
  ArrowLeftIcon,
  BarChart3Icon,
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
  getGsRound,
  getRoundQuestionStats,
  getRoundStudentStats,
} from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-round-stats";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 통계 | Lidam Edu`
      : "회차 통계 | Lidam Edu",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const roundId = params.roundId;
  if (!roundId) throw data("Missing roundId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const [round, students, questions] = await Promise.all([
    getGsRound(client, roundId),
    getRoundStudentStats(client, roundId),
    getRoundQuestionStats(client, roundId),
  ]);
  if (!round) throw data("Round not found", { status: 404 });
  return { round, students, questions };
}

export default function AdminGsRoundStats({
  loaderData,
}: Route.ComponentProps) {
  const { round, students, questions } = loaderData;
  const totalMax = questions.reduce((s, q) => s + q.maxScore, 0);
  const cohortAvg =
    students.length > 0
      ? students.reduce((s, x) => s + x.totalScore, 0) / students.length
      : 0;
  const cohortStdev =
    students.length > 0
      ? Math.sqrt(
          students.reduce(
            (s, x) => s + Math.pow(x.totalScore - cohortAvg, 2),
            0,
          ) / students.length,
        )
      : 0;
  const cohortMax = students.length > 0 ? students[0].totalScore : 0;
  const cohortMin =
    students.length > 0 ? students[students.length - 1].totalScore : 0;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <Link
          to={`/admin/gs/${round.roundId}`}
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 회차 편집
        </Link>
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <BarChart3Icon className="size-3.5" /> 회차 통계
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{round.title}</h1>
        <p className="text-muted-foreground text-sm">
          {LAW_SUBJECTS[round.subject]?.name ?? round.subject}
          {round.roundNumber ? ` · ${round.roundNumber}회` : ""}
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <SummaryCard label="응시·채점 완료" value={`${students.length}명`} />
        <SummaryCard
          label="평균 / 만점"
          value={`${cohortAvg.toFixed(1)} / ${totalMax}`}
        />
        <SummaryCard
          label="표준편차"
          value={`±${cohortStdev.toFixed(1)}`}
          hint={cohortStdev / Math.max(totalMax, 1) >= 0.15 ? "편차 큼" : "안정"}
        />
        <SummaryCard
          label="범위"
          value={`${cohortMin} ~ ${cohortMax}`}
        />
      </div>

      {/* 문항별 분포 */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-sm font-semibold tracking-tight">문항별 분포</h2>
          <p className="text-muted-foreground text-xs">
            각 문항의 평균·중앙값·표준편차·사분위(Q1~Q3). 분포 막대는 점수의 25~75
            백분위 범위입니다.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {questions.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              아직 채점된 답안이 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead className="min-w-[160px]">문제</TableHead>
                  <TableHead className="w-[80px]">만점</TableHead>
                  <TableHead className="w-[80px]">N</TableHead>
                  <TableHead className="w-[100px]">평균</TableHead>
                  <TableHead className="w-[100px]">중앙값</TableHead>
                  <TableHead className="w-[100px]">표준편차</TableHead>
                  <TableHead className="min-w-[200px]">분포</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((q) => (
                  <TableRow key={q.questionId}>
                    <TableCell className="font-medium">
                      {q.orderIndex + 1}
                    </TableCell>
                    <TableCell className="text-sm">
                      {q.title ?? <span className="text-muted-foreground italic">제목 없음</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{q.maxScore}</TableCell>
                    <TableCell className="tabular-nums">{q.n}</TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      {q.avg}
                    </TableCell>
                    <TableCell className="tabular-nums">{q.median}</TableCell>
                    <TableCell
                      className={cn(
                        "font-semibold tabular-nums",
                        q.maxScore > 0 && q.stdev / q.maxScore >= 0.2
                          ? "text-amber-700 dark:text-amber-400"
                          : "",
                      )}
                    >
                      ±{q.stdev}
                    </TableCell>
                    <TableCell>
                      <DistributionBar
                        min={q.min}
                        max={q.max}
                        q1={q.q1}
                        q3={q.q3}
                        median={q.median}
                        maxScore={q.maxScore}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 학생별 총점 + z-score + 순위 */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold tracking-tight">학생별 결과</h2>
          <p className="text-muted-foreground text-xs">
            총점, 백분위, z-score(편차 보정), 순위. 회차마다 난이도가 달라도 z-score 로
            객관적 수준 비교가 가능합니다.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {students.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              아직 채점된 답안이 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">순위</TableHead>
                  <TableHead className="min-w-[200px]">학생</TableHead>
                  <TableHead className="w-[110px]">총점 / {totalMax}</TableHead>
                  <TableHead className="w-[100px]">백분위</TableHead>
                  <TableHead className="w-[120px]">z-score</TableHead>
                  <TableHead>편차</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.userId}>
                    <TableCell>
                      <RankBadge rank={s.rank} />
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
                    <TableCell className="font-semibold tabular-nums">
                      {s.totalScore}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      상위 {(100 - s.percentile).toFixed(0)}%
                    </TableCell>
                    <TableCell>
                      <ZScoreBadge z={s.zScore} />
                    </TableCell>
                    <TableCell>
                      <ZScoreBar z={s.zScore} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
          {label}
        </p>
        <p className="text-foreground mt-1 text-xl font-bold tabular-nums">
          {value}
        </p>
        {hint ? (
          <p className="text-muted-foreground mt-1 text-[10px]">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <Badge className="bg-amber-500 text-white text-[11px] hover:bg-amber-500">
        <CrownIcon className="size-3" /> {rank}
      </Badge>
    );
  }
  if (rank <= 3) {
    return (
      <Badge variant="default" className="text-[11px] tabular-nums">
        {rank}위
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[11px] tabular-nums">
      {rank}위
    </Badge>
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

// z-score 시각화 — 평균(0)을 가운데 두고 -2σ~+2σ 범위에 막대.
function ZScoreBar({ z }: { z: number }) {
  const clamped = Math.max(-2, Math.min(2, z));
  const widthPct = (Math.abs(clamped) / 2) * 50; // 한쪽 50%
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

// 문항별 분포 막대 — Q1~Q3 박스 + 중앙값 표시.
function DistributionBar({
  min,
  max,
  q1,
  q3,
  median,
  maxScore,
}: {
  min: number;
  max: number;
  q1: number;
  q3: number;
  median: number;
  maxScore: number;
}) {
  if (maxScore <= 0) return null;
  const pct = (v: number) => (Math.max(0, Math.min(maxScore, v)) / maxScore) * 100;
  return (
    <div className="relative h-3 w-full rounded-full bg-muted">
      {/* min~max 범위 */}
      <div
        className="bg-muted-foreground/30 absolute top-0 h-full rounded-full"
        style={{ left: `${pct(min)}%`, width: `${pct(max) - pct(min)}%` }}
      />
      {/* Q1~Q3 박스 */}
      <div
        className="bg-primary/40 absolute top-0 h-full rounded"
        style={{ left: `${pct(q1)}%`, width: `${pct(q3) - pct(q1)}%` }}
      />
      {/* median 점 */}
      <div
        className="bg-primary absolute top-1/2 size-2 -translate-y-1/2 rounded-full"
        style={{ left: `calc(${pct(median)}% - 4px)` }}
        title={`중앙값 ${median}`}
      />
    </div>
  );
}
