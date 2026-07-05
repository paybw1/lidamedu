// feat-7-019 — 반/기수 통계 모니터링. 패턴 P4.
// 평균 KPI + 정답률 분포 + 과목별 평균 + 상/하위 5명.

import {
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
import { Fragment, useEffect, useState } from "react";
import { Link, data, useFetcher, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";
import {
  isFirstExamSubject,
  isSecondExamSubject,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";
import {
  getCohortAccuracyTrend,
  getCohortAggregateStats,
  type AccuracyBucket,
  type CohortWeeklyTrendItem,
} from "~/features/admin/queries/student-progress.server";
import {
  type CohortSrsAggregate,
  getCohortSrsAggregate,
} from "~/features/admin/queries/cohort-srs.server";
import { getCohortWeakNodes } from "~/features/admin/queries/cohort-weakness.server";
import type { CohortOfflineTestStat } from "~/features/offline-tests/labels";
import { listCohortOfflineTestStats } from "~/features/offline-tests/results.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Bar, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";

import type { Route } from "./+types/admin-cohort-stats";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.cohort) return [{ title: "반 통계 | 리담변리사학원" }];
  return [{ title: `${d.cohort.name} 통계 | 리담변리사학원` }];
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
  if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 조회 가능", { status: 403 });
  }
  const cohortId = params.cohortId;

  const [stats, trend, srs, offlineTests] = await Promise.all([
    getCohortAggregateStats(cohortId),
    getCohortAccuracyTrend(cohortId, 4),
    getCohortSrsAggregate(cohortId),
    listCohortOfflineTestStats(client, cohortId),
  ]);

  // feat-7-040 P3 — 반 공통 약점 단원(getCohortWeakNodes 재사용, 과목별). ★시도 있는 과목만
  // 호출 — 이 함수는 호출마다 전 멤버 attempts 를 재스캔하므로 빈 과목 스캔을 피한다.
  // 노드를 과목 가로질러 merge → 약점 점수 상위 N.
  const activeSubjects = LAW_SUBJECT_SLUGS.filter((slug) =>
    stats.bySubject.some(
      (s) => s.lawCode === slug && s.avgProblemsAttempted > 0,
    ),
  );
  const weakBySubject = await Promise.all(
    activeSubjects.map(async (slug) => ({
      slug,
      result: await getCohortWeakNodes(adminClient, cohortId, slug, {
        limit: 6,
      }),
    })),
  );
  const weakThreshold = weakBySubject[0]?.result.threshold ?? 0;
  const cohortWeakNodes = weakBySubject
    .flatMap(({ slug, result }) =>
      result.nodes.map((n) => ({
        nodeId: n.nodeId,
        lawName: LAW_SUBJECTS[slug].name,
        displayLabel: n.displayLabel,
        accuracyPct: n.accuracyPct,
        distinctStudents: n.distinctStudents,
        attempts: n.attempts,
        weaknessScore: n.weaknessScore,
      })),
    )
    .sort((a, b) => b.weaknessScore - a.weaknessScore)
    .slice(0, 8);

  return {
    cohort,
    stats,
    trend,
    srs,
    cohortWeakNodes,
    weakThreshold,
    offlineTests,
    role,
  };
}

function accuracyTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-lime-600 dark:text-lime-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function accuracyBgTone(pct: number | null): string {
  if (pct === null) return "bg-muted-foreground/40";
  if (pct >= 80) return "bg-emerald-500/80";
  if (pct >= 60) return "bg-lime-500/80";
  if (pct >= 40) return "bg-amber-500/80";
  if (pct >= 20) return "bg-orange-500/80";
  return "bg-rose-500/80";
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
  const {
    cohort,
    stats,
    trend,
    srs,
    cohortWeakNodes,
    weakThreshold,
    offlineTests,
    role,
  } = loaderData;
  const maxBucketCount = Math.max(
    1,
    ...stats.accuracyDistribution.map((d) => d.count),
  );

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      title={`${cohort.name} — 반 통계`}
      desc={`반 평균·분포·과목별 통계. 멤버 ${stats.memberCount}명.`}
      headerRight={
        <Button asChild size="sm" variant="outline">
          <Link to={`/admin/cohorts/${cohort.cohortId}/progress`}>
            <TrendingUpIcon className="size-3.5" /> 학생별 진도
          </Link>
        </Button>
      }
    >
      {stats.memberCount === 0 ? (
        <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border py-16 text-center shadow-sm">
          <UsersIcon className="text-muted-foreground/40 size-10" />
          <p className="text-muted-foreground text-sm">
            반에 멤버가 없습니다. 학생을 먼저 추가하세요.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-2">
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
              value={stats.avgAccuracyPct === null ? "—" : `${stats.avgAccuracyPct}%`}
              tone={accuracyTone(stats.avgAccuracyPct)}
              hint="시도 ≥ 5 학생 기준"
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
                  정답률 분포
                </p>
                <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[10px]">
                  시도 ≥ 5 학생만 분류, 나머지는 "데이터 부족"
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.accuracyDistribution.map((d) => {
                const pct =
                  stats.memberCount > 0
                    ? Math.round((d.count / stats.memberCount) * 100)
                    : 0;
                const widthPct = Math.round((d.count / maxBucketCount) * 100);
                return (
                  <div key={d.bucket} className="flex items-center gap-3">
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

          {/* 과목별 평균 — 1차(객관식)/2차(주관식) 분리 */}
          <div>
            <p className="text-muted-foreground mb-2 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
              과목별 평균
            </p>
            <IndexTable
              minWidth={560}
              headers={[
                { label: "과목" },
                { label: "평균 시도", align: "right", width: "7rem" },
                { label: "평균 정답률", align: "right", width: "10rem" },
                { label: "평균 조문 열람", align: "right", width: "8rem" },
              ]}
            >
              {[
                {
                  label: "1차 · 객관식",
                  rows: stats.bySubject.filter((s) => isFirstExamSubject(s.lawCode)),
                },
                {
                  label: "2차 · 주관식",
                  rows: stats.bySubject.filter((s) => isSecondExamSubject(s.lawCode)),
                },
              ].map((g) => (
                <Fragment key={g.label}>
                  {/* 그룹 헤더 행 */}
                  <tr>
                    <td
                      colSpan={4}
                      className="bg-muted/60 text-link border-border/60 border-b px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] uppercase"
                    >
                      {g.label}
                    </td>
                  </tr>
                  {g.rows.map((s) => (
                    <TR key={s.lawCode}>
                      <TD>{s.name}</TD>
                      <TD align="right" mono soft>
                        {s.avgProblemsAttempted}
                      </TD>
                      <TD align="right">
                        {s.avgAccuracyPct !== null ? (
                          <div className="flex items-center justify-end gap-2">
                            <Bar value={s.avgAccuracyPct} tone="auto" className="w-16" />
                            <span className={cn("font-mono text-[12px] font-bold tabular-nums", accuracyTone(s.avgAccuracyPct))}>
                              {s.avgAccuracyPct}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD align="right" mono soft>
                        {s.avgArticlesViewed}
                      </TD>
                    </TR>
                  ))}
                </Fragment>
              ))}
            </IndexTable>
          </div>

          {/* feat-7-040 P3 — 반 공통 약점 단원 (보충 수업 주제 즉시 파악) */}
          <CohortWeakNodesCard
            nodes={cohortWeakNodes}
            threshold={weakThreshold}
            cohortId={cohort.cohortId}
          />

          {/* feat-7-042 — 오프라인 테스트 결과 (온라인 진도 대비 현장 시험 성적) */}
          <OfflineTestStatsCard tests={offlineTests} cohortId={cohort.cohortId} />

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
              icon={BarChart3Icon}
              label="하위 5명 — 정답률"
              tone="text-rose-600 dark:text-rose-400"
              items={stats.bottomByAccuracy}
              emptyText="시도 ≥ 5인 학생이 부족합니다."
            />
          </div>

          {/* feat-2-018 반 인사이트 */}
          <CohortSrsSection
            srs={srs}
            cohortName={cohort.name}
          />
        </div>
      )}
    </AdminShell>
  );
}

// feat-7-042 — 반 오프라인 테스트 결과 요약. 평균 % 는 온라인 정답률과 같은 톤 스케일.
function OfflineTestStatsCard({
  tests,
  cohortId,
}: {
  tests: CohortOfflineTestStat[];
  cohortId: string;
}) {
  if (tests.length === 0) return null;
  return (
    <div className="border-border bg-card rounded-xl border shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-bold tracking-tight">
          오프라인 테스트{" "}
          <span className="text-muted-foreground font-normal">
            ({tests.length})
          </span>
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          현장 시험 결과 — 문항별 정오는 학생 학습 기록에 합류되어 위의 약점
          단원·정답률에도 반영됩니다.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="px-4 py-2 font-semibold">테스트</th>
              <th className="px-2 py-2 font-semibold">과목</th>
              <th className="px-2 py-2 text-right font-semibold">응시</th>
              <th className="px-2 py-2 text-right font-semibold">평균</th>
              <th className="px-2 py-2 text-right font-semibold">최고/최저</th>
              <th className="px-4 py-2 text-right font-semibold">결과</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {tests.map((t) => (
              <tr key={t.testId}>
                <td className="max-w-56 truncate px-4 py-2 font-medium">
                  {t.title}
                </td>
                <td className="px-2 py-2">
                  {LAW_SUBJECTS[t.lawCode as LawSubjectSlug]?.name ?? t.lawCode}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {t.takenCount}
                  {t.absentCount > 0 ? (
                    <span className="text-muted-foreground">
                      {" "}
                      (미응시 {t.absentCount})
                    </span>
                  ) : null}
                </td>
                <td
                  className={cn(
                    "px-2 py-2 text-right font-bold tabular-nums",
                    accuracyTone(t.avgPct),
                  )}
                >
                  {t.avgScore !== null ? (
                    <>
                      {t.avgScore}
                      {t.maxScore !== null ? (
                        <span className="text-muted-foreground font-normal">
                          /{t.maxScore}
                        </span>
                      ) : null}
                      {t.avgPct !== null ? ` (${t.avgPct}%)` : ""}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="text-muted-foreground px-2 py-2 text-right tabular-nums">
                  {t.topScore !== null ? `${t.topScore} / ${t.bottomScore}` : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    to={`/admin/cohorts/${cohortId}/assignments/${t.assignmentId}/tests/${t.testId}/results`}
                    className="text-link hover:underline"
                  >
                    입력·상세
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeeklyTrendCard({ weeks }: { weeks: CohortWeeklyTrendItem[] }) {
  if (weeks.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
            최근 {weeks.length}주 추이
          </p>
          <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[10px]">
            주별 정답률 · 시도 · 활동 학생수
          </span>
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
      <p className={cn("text-center text-sm font-bold tabular-nums", accuracyTone(item.accuracyPct))}>
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
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] uppercase">
        <Icon className="size-3" />
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-extrabold tracking-tight tabular-nums", tone ?? "text-foreground")}>
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground mt-0.5 text-[11px]">{hint}</p>
      ) : null}
    </div>
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
        <p className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
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
                  className="hover:text-link min-w-0 flex-1 truncate text-sm font-medium"
                >
                  {item.name}
                </Link>
                <span className={cn("w-14 text-right text-sm font-semibold tabular-nums", tone)}>
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

// ─── feat-7-040 P3 반 공통 약점 단원 ───

function CohortWeakNodesCard({
  nodes,
  threshold,
  cohortId,
}: {
  nodes: Array<{
    nodeId: string;
    lawName: string;
    displayLabel: string;
    accuracyPct: number;
    distinctStudents: number;
    attempts: number;
  }>;
  threshold: number;
  cohortId: string;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{
    ok?: true;
    assignmentId?: string;
    error?: string;
  }>();
  const navigate = useNavigate();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data?.ok &&
      fetcher.data.assignmentId
    ) {
      navigate(
        `/admin/cohorts/${cohortId}/assignments/${fetcher.data.assignmentId}`,
      );
    }
  }, [fetcher.state, fetcher.data, navigate, cohortId]);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
            <TargetIcon className="size-3.5 text-rose-500" /> 반 공통 약점 단원
          </p>
          <div className="flex items-center gap-2">
            <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[10px]">
              서로 다른 {threshold}명 이상 시도 + 정답률 낮은 순
            </span>
            {nodes.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpen((v) => !v)}
              >
                <ListChecksIcon className="size-3.5" /> 약점 과제 만들기
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {open ? (
          <fetcher.Form
            method="post"
            action="/api/admin/assignment"
            className="border-border bg-muted/30 flex flex-wrap items-end gap-2 border-b p-3"
          >
            <input type="hidden" name="intent" value="create_from_weak" />
            <input type="hidden" name="cohortId" value={cohortId} />
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">과목</span>
              <select
                name="lawCode"
                required
                className="border-input bg-background h-9 rounded-md border px-2 text-[13px]"
              >
                {LAW_SUBJECT_SLUGS.map((s) => (
                  <option key={s} value={s}>
                    {LAW_SUBJECTS[s].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">제목</span>
              <input
                name="title"
                defaultValue="약점 보충 과제"
                maxLength={200}
                className="border-input bg-background h-9 w-44 rounded-md border px-2 text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">마감</span>
              <input
                name="dueAt"
                type="datetime-local"
                required
                className="border-input bg-background h-9 rounded-md border px-2 text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">문항</span>
              <input
                name="n"
                type="number"
                min={1}
                max={50}
                defaultValue={10}
                className="border-input bg-background h-9 w-16 rounded-md border px-2 text-[13px]"
              />
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              만들기
            </Button>
            {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
              <p className="w-full text-xs text-rose-600">
                {fetcher.data.error}
              </p>
            ) : null}
            <p className="text-muted-foreground w-full text-[11px]">
              반 공통 약점 단원의 승인 문제로 과제를 생성하고 편집 화면으로 이동합니다.
            </p>
          </fetcher.Form>
        ) : null}
        {nodes.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            아직 공통 약점으로 잡힌 단원이 없습니다 (시도 학생·문항 수 부족).
          </p>
        ) : (
          <ul className="divide-y">
            {nodes.map((n) => (
              <li
                key={`${n.lawName}-${n.nodeId}`}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="text-muted-foreground w-16 shrink-0 truncate text-[11px] font-medium">
                  {n.lawName}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {n.displayLabel}
                </span>
                <span className="text-muted-foreground w-20 text-right text-[11px] tabular-nums">
                  {n.distinctStudents}명 · {n.attempts}회
                </span>
                <span
                  className={cn(
                    "w-12 text-right text-sm font-bold tabular-nums",
                    accuracyTone(n.accuracyPct),
                  )}
                >
                  {n.accuracyPct}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── feat-2-018 반 인사이트 ───

function CohortSrsSection({
  srs,
  cohortName,
}: {
  srs: CohortSrsAggregate;
  cohortName: string;
}) {
  const stalledPct = Math.round(srs.stalledStudentRatio * 100);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold tracking-tight">반 인사이트</h2>
          <p className="text-muted-foreground text-xs">
            반 멤버 {srs.memberCount}명 · 총 due {srs.totalDueAcrossAll.toLocaleString("ko-KR")}건
            <span className="ml-2">
              ·{" "}
              <span
                className={
                  stalledPct >= 70
                    ? "text-rose-600 dark:text-rose-400 font-bold"
                    : stalledPct >= 30
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                }
              >
                {stalledPct}%
              </span>{" "}
              가 1+ 건 정체
            </span>
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          {cohortName} 반의 4 종 복습 (객관식·빈칸·정오문제·조문) 평균 + 가장 정체된 학생.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pb-4">
        {/* 평균 KPI */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <SrsAvgTile label="객관식 평균 due" value={srs.avgProblemDue} />
          <SrsAvgTile label="빈칸 평균 due (세트)" value={srs.avgBlankDueSets} />
          <SrsAvgTile label="정오문제 평균 due" value={srs.avgOxDue} />
          <SrsAvgTile label="조문 평균 due" value={srs.avgArticleDue} />
        </div>

        {/* 정체 top5 */}
        {srs.topStalled.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-xs">
            지금 due 가 있는 학생이 없습니다. 좋은 상태!
          </div>
        ) : (
          <div>
            <p className="text-muted-foreground mb-2 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
              정체 top 5 (전체 due 합산)
            </p>
            <div className="border-border overflow-hidden rounded-lg border">
              <table className="w-full">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-muted-foreground px-3 py-2 text-left font-mono text-[10px] font-semibold tracking-[0.04em] uppercase">
                      학생
                    </th>
                    <th className="text-muted-foreground px-2 py-2 text-right font-mono text-[10px] font-semibold tracking-[0.04em] uppercase">
                      총 due
                    </th>
                    <th className="text-muted-foreground hidden px-2 py-2 text-right font-mono text-[10px] font-semibold tracking-[0.04em] uppercase sm:table-cell">
                      객관식
                    </th>
                    <th className="text-muted-foreground hidden px-2 py-2 text-right font-mono text-[10px] font-semibold tracking-[0.04em] uppercase sm:table-cell">
                      빈칸
                    </th>
                    <th className="text-muted-foreground hidden px-2 py-2 text-right font-mono text-[10px] font-semibold tracking-[0.04em] uppercase sm:table-cell">
                      정오문제
                    </th>
                    <th className="text-muted-foreground hidden px-2 py-2 text-right font-mono text-[10px] font-semibold tracking-[0.04em] uppercase sm:table-cell">
                      조문
                    </th>
                    <th className="text-muted-foreground px-2 py-2 text-right font-mono text-[10px] font-semibold tracking-[0.04em] uppercase">
                      가장 오래
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {srs.topStalled.map((s) => (
                    <tr key={s.profileId} className="border-border/60 border-t">
                      <td className="px-3 py-2 text-sm font-semibold">
                        {s.name}
                      </td>
                      <td className="text-foreground px-2 py-2 text-right font-mono text-xs font-bold tabular-nums">
                        {s.totalDue}
                      </td>
                      <td className="text-muted-foreground hidden px-2 py-2 text-right font-mono text-xs tabular-nums sm:table-cell">
                        {s.problemDue}
                      </td>
                      <td className="text-muted-foreground hidden px-2 py-2 text-right font-mono text-xs tabular-nums sm:table-cell">
                        {s.blankDueSets}
                      </td>
                      <td className="text-muted-foreground hidden px-2 py-2 text-right font-mono text-xs tabular-nums sm:table-cell">
                        {s.oxDue}
                      </td>
                      <td className="text-muted-foreground hidden px-2 py-2 text-right font-mono text-xs tabular-nums sm:table-cell">
                        {s.articleDue}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right font-mono text-xs tabular-nums",
                          s.oldestOverdueDays >= 14
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {s.oldestOverdueDays}d
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Link
                          to={`/admin/students/${s.profileId}`}
                          className="text-link inline-flex items-center gap-0.5 text-[11px] font-semibold hover:underline"
                          viewTransition
                        >
                          상세 <ArrowRightIcon className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="text-muted-foreground text-[11px]">
          누적 실패(객관식+빈칸+정오문제 합산): {srs.totalLapses.toLocaleString("ko-KR")}회.
        </p>
      </CardContent>
    </Card>
  );
}

function SrsAvgTile({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-3.5 shadow-sm">
      <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        {label}
      </p>
      <p className="text-foreground mt-1.5 text-xl font-extrabold tabular-nums">
        {value.toFixed(1)}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[10px]">학생당</p>
    </div>
  );
}
