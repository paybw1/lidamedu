// feat-7-019 — 반/기수 통계 모니터링.
// 평균 KPI + 정답률 분포 + 5과목 평균 + 상/하위 5명.

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BarChart3Icon,
  BookOpenIcon,
  CalendarCheckIcon,
  ListChecksIcon,
  TargetIcon,
  TrendingUpIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
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
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getCohortAccuracyTrend,
  getCohortAggregateStats,
  type AccuracyBucket,
  type CohortWeeklyTrendItem,
} from "~/features/admin/queries/student-progress.server";

import type { Route } from "./+types/admin-cohort-stats";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.cohort) return [{ title: "반 통계 | Lidam Edu" }];
  return [{ title: `${d.cohort.name} 통계 | Lidam Edu` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.cohortId) throw data("Missing cohortId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const cohort = await getCohortById(client, params.cohortId);
  if (!cohort) throw data("Cohort not found", { status: 404 });
  if (role !== "admin" && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 조회 가능", { status: 403 });
  }

  const [stats, trend] = await Promise.all([
    getCohortAggregateStats(params.cohortId),
    getCohortAccuracyTrend(params.cohortId, 4),
  ]);
  return { cohort, stats, trend };
}

function accuracyTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-lime-600 dark:text-lime-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

const BUCKET_TONE: Record<AccuracyBucket, string> = {
  "80+": "bg-emerald-500/80",
  "60-79": "bg-lime-500/80",
  "40-59": "bg-amber-500/80",
  "20-39": "bg-orange-500/80",
  "0-19": "bg-rose-500/80",
  none: "bg-muted-foreground/40",
};

const BUCKET_LABEL: Record<AccuracyBucket, string> = {
  "80+": "80% 이상",
  "60-79": "60–79%",
  "40-59": "40–59%",
  "20-39": "20–39%",
  "0-19": "0–19%",
  none: "데이터 부족",
};

export default function AdminCohortStats({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, stats, trend } = loaderData;
  const maxBucketCount = Math.max(
    1,
    ...stats.accuracyDistribution.map((d) => d.count),
  );

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/admin/cohorts/${cohort.cohortId}`}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 반 상세
      </Link>

      <header className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <BarChart3Icon className="size-3" /> 통계 모니터링
          </Badge>
          <Badge variant="outline" className="ml-auto gap-1">
            <UsersIcon className="size-3" /> {stats.memberCount}명
          </Badge>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
              <BarChart3Icon className="text-primary size-6" />
              {cohort.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              반 평균·분포·과목별 통계
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to={`/admin/cohorts/${cohort.cohortId}/progress`}>
              <TrendingUpIcon className="size-3.5" /> 학생별 진도 →
            </Link>
          </Button>
        </div>
      </header>

      {stats.memberCount === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            반에 멤버가 없습니다. 학생을 먼저 추가하세요.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to={`/admin/cohorts/${cohort.cohortId}`}>
              <UsersIcon className="size-3.5" /> 멤버 관리
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 평균 KPI */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={TargetIcon}
              label="평균 정답률"
              value={
                stats.avgAccuracyPct === null
                  ? "—"
                  : `${stats.avgAccuracyPct}%`
              }
              tone={accuracyTone(stats.avgAccuracyPct)}
              hint={`시도 ≥ 5 학생 기준`}
            />
            <KpiCard
              icon={ListChecksIcon}
              label="평균 시도 문제"
              value={`${stats.avgProblemsAttempted}`}
              hint="distinct"
            />
            <KpiCard
              icon={BookOpenIcon}
              label="평균 조문 열람"
              value={`${stats.avgArticlesViewed}`}
            />
            <KpiCard
              icon={CalendarCheckIcon}
              label="최근 7일 활동"
              value={`${stats.active7dCount}/${stats.memberCount}명`}
              tone={
                stats.active7dCount / Math.max(1, stats.memberCount) >= 0.5
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }
            />
          </div>

          {/* 최근 4주 추이 */}
          <WeeklyTrendCard weeks={trend.weeks} />

          {/* 정답률 분포 */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  정답률 분포
                </p>
                <Badge variant="outline" className="text-[10px]">
                  시도 ≥ 5 학생만 분류, 나머지는 "데이터 부족"
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.accuracyDistribution.map((d) => {
                const pct =
                  stats.memberCount > 0
                    ? Math.round((d.count / stats.memberCount) * 100)
                    : 0;
                const widthPct = Math.round(
                  (d.count / maxBucketCount) * 100,
                );
                return (
                  <div
                    key={d.bucket}
                    className="flex items-center gap-3"
                  >
                    <div className="w-24 text-xs font-medium">
                      {BUCKET_LABEL[d.bucket]}
                    </div>
                    <div className="bg-muted relative h-5 flex-1 overflow-hidden rounded">
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 transition-all",
                          BUCKET_TONE[d.bucket],
                        )}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="w-20 text-right text-xs tabular-nums">
                      {d.count}명{" "}
                      <span className="text-muted-foreground">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* 5과목 평균 */}
          <Card>
            <CardHeader className="pb-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                과목별 평균 (5과목)
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>과목</TableHead>
                    <TableHead className="text-right">평균 시도</TableHead>
                    <TableHead className="text-right">평균 정답률</TableHead>
                    <TableHead className="text-right">평균 조문 열람</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.bySubject.map((s) => (
                    <TableRow key={s.lawCode}>
                      <TableCell className="text-sm font-medium">
                        {s.name}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {s.avgProblemsAttempted}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-sm tabular-nums",
                          accuracyTone(s.avgAccuracyPct),
                        )}
                      >
                        {s.avgAccuracyPct === null
                          ? "—"
                          : `${s.avgAccuracyPct}%`}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {s.avgArticlesViewed}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 상/하위 학생 */}
          <div className="grid gap-3 md:grid-cols-2">
            <RankCard
              icon={TrophyIcon}
              label="상위 5명 — 정답률"
              tone="text-emerald-600 dark:text-emerald-400"
              items={stats.topByAccuracy}
              emptyText="시도 ≥ 5인 학생이 부족합니다."
            />
            <RankCard
              icon={TrendingUpIcon}
              label="하위 5명 — 정답률"
              tone="text-rose-600 dark:text-rose-400"
              items={stats.bottomByAccuracy}
              emptyText="시도 ≥ 5인 학생이 부족합니다."
            />
          </div>
        </div>
      )}
    </div>
  );
}

function accuracyBgTone(pct: number | null): string {
  if (pct === null) return "bg-muted-foreground/40";
  if (pct >= 80) return "bg-emerald-500/80";
  if (pct >= 60) return "bg-lime-500/80";
  if (pct >= 40) return "bg-amber-500/80";
  if (pct >= 20) return "bg-orange-500/80";
  return "bg-rose-500/80";
}

function WeeklyTrendCard({ weeks }: { weeks: CohortWeeklyTrendItem[] }) {
  if (weeks.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            최근 {weeks.length}주 추이
          </p>
          <Badge variant="outline" className="text-[10px]">
            주별 정답률 · 시도 · 활동 학생수
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3">
          {weeks.map((w) => (
            <WeeklyBar key={w.weekStart} item={w} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyBar({ item }: { item: CohortWeeklyTrendItem }) {
  const height = item.accuracyPct ?? 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="bg-muted/40 relative flex h-28 items-end overflow-hidden rounded">
        <div
          className={cn("w-full transition-all", accuracyBgTone(item.accuracyPct))}
          style={{ height: `${Math.max(2, height)}%` }}
          title={`${item.accuracyPct ?? 0}%`}
        />
      </div>
      <p className="text-center text-xs font-medium">{item.label}</p>
      <p
        className={cn(
          "text-center text-sm font-bold tabular-nums",
          accuracyTone(item.accuracyPct),
        )}
      >
        {item.accuracyPct === null ? "—" : `${item.accuracyPct}%`}
      </p>
      <p className="text-muted-foreground text-center text-[10px] tabular-nums">
        {item.totalAttempts}문 · {item.activeMemberCount}명
      </p>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: typeof TargetIcon;
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="flex items-center gap-2">
          <Icon className="text-primary size-4" />
          <p className="text-muted-foreground text-xs">{label}</p>
        </div>
        <p
          className={cn(
            "text-2xl font-bold tabular-nums",
            tone ?? "text-foreground",
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="text-muted-foreground text-xs">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RankCard({
  icon: Icon,
  label,
  tone,
  items,
  emptyText,
}: {
  icon: typeof TrophyIcon;
  label: string;
  tone: string;
  items: Array<{
    profileId: string;
    name: string;
    accuracyPct: number;
    problemsAttempted: number;
  }>;
  emptyText: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <Icon className={cn("size-3.5", tone)} />
          {label}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            {emptyText}
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((item, i) => (
              <li
                key={item.profileId}
                className="flex items-center gap-3 px-4 py-2"
              >
                <span className="text-muted-foreground w-5 text-xs tabular-nums">
                  {i + 1}
                </span>
                <Link
                  to={`/admin/students/${item.profileId}`}
                  viewTransition
                  className="hover:text-primary min-w-0 flex-1 truncate text-sm font-medium"
                >
                  {item.name}
                </Link>
                <span
                  className={cn(
                    "w-14 text-right text-sm font-semibold tabular-nums",
                    tone,
                  )}
                >
                  {item.accuracyPct}%
                </span>
                <span className="text-muted-foreground w-16 text-right text-xs tabular-nums">
                  {item.problemsAttempted}문
                </span>
                <ArrowRightIcon className="text-muted-foreground size-3" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
