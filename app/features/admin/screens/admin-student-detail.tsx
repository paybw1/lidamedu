// 한 학생 상세 — 과목별 진도/통계, 최근 활동, 빈칸 (feat-7-010).
// staff 권한: admin 전부, instructor 는 본인 cohort 멤버만.

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BrainIcon,
  CheckCheckIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  FlameIcon,
  GavelIcon,
  ListChecksIcon,
  MailIcon,
  MessageSquareIcon,
  MinusIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Link, data, useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
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
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";
import {
  isFirstExamSubject,
  isSecondExamSubject,
  LAW_SUBJECT_SLUGS,
} from "~/features/subjects/lib/subjects";
import adminClient from "~/core/lib/supa-admin-client.server";
import {
  getUserPassPredictionTrend,
  type PassPredictionSnapshotItem,
} from "~/features/study/queries.server";
import {
  getNodeMastery,
  type NodeMasteryRow,
} from "~/features/study/mastery.server";
import {
  getGamificationSummary,
  type GamificationSummary,
} from "~/features/study/gamification.server";
import { summarizeMastery } from "~/features/study/lib/mastery";
import { OxDiagnosisView } from "~/features/study/components/ox-diagnosis-view";
import { computeOxDiagnosis } from "~/features/study/lib/ox-diagnosis.server";
import {
  getStudentCohortComparisons,
  getStudentDetail,
  type StudentCohortComparison,
} from "~/features/admin/queries/student-progress.server";
import {
  type StudentSrsSummary,
  getStudentSrsSummary,
} from "~/features/admin/queries/student-srs.server";
import {
  listNotesForStudent,
  type StudentNote,
} from "~/features/student-notes/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import {
  listPaymentsForUser,
  listUserSubscriptionHistory,
} from "~/features/subscriptions/admin-queries.server";
import { AdminSubscriptionPanel } from "~/features/subscriptions/components/admin-subscription-panel";
import { listSubscriptionPlans } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/admin-student-detail";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.student) return [{ title: "학생 상세 | 리담변리사학원" }];
  return [{ title: `${d.student.name} 학생 진도 | 리담변리사학원` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.profileId) throw data("Missing profileId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  // manager 미만(instructor)이면 본인 소속 cohort 의 멤버인지 확인.
  if (!roleAtLeast(role, "manager")) {
    const { data: rows } = await adminClient
      .from("cohort_members")
      .select("cohort_id, cohorts!inner(owner_id)")
      .eq("profile_id", params.profileId);
    const ownsAnyCohort = (rows ?? []).some(
      (r) => r.cohorts?.owner_id === user.id,
    );
    if (!ownsAnyCohort) {
      throw data("이 학생을 조회할 권한이 없습니다.", { status: 403 });
    }
  }

  const [
    student,
    cohortComparisons,
    notes,
    passTrend,
    subscriptions,
    payments,
    plans,
    srsSummary,
    oxDiagnosis,
    oxPasser,
    nodeMastery,
  ] = await Promise.all([
    getStudentDetail(params.profileId),
    getStudentCohortComparisons(params.profileId),
    listNotesForStudent(params.profileId),
    getUserPassPredictionTrend(adminClient, params.profileId, { days: 30 }),
    // feat-7-014 — manager+ 만 구독 패널에 데이터 노출.
    roleAtLeast(role, "manager")
      ? listUserSubscriptionHistory(params.profileId)
      : Promise.resolve([]),
    roleAtLeast(role, "manager")
      ? listPaymentsForUser(params.profileId)
      : Promise.resolve([]),
    roleAtLeast(role, "manager")
      ? listSubscriptionPlans(client)
      : Promise.resolve([]),
    getStudentSrsSummary(params.profileId),
    // feat-2-022 — 이 학생의 OX 약점 진단(adminClient = RLS 우회, 타 사용자 데이터).
    computeOxDiagnosis(adminClient, params.profileId),
    // 합격자 비교 게이트 — OFF(1년차) 시 placeholder 만. 학생 화면과 동일 처리.
    (async () => {
      const { isPasserBenchmarkEnabled } = await import(
        "~/features/exam-results/passer-benchmark-gate.server"
      );
      const g = await isPasserBenchmarkEnabled();
      return {
        enabled: g.enabled,
        sampleSize: g.realSampleSize,
        minSample: g.minSample,
      };
    })(),
    // feat-2-027 — 단원 마스터리(파생: 노드별 정답률 + SRS 파지). 학생 화면과 동일 계산.
    getNodeMastery(adminClient, params.profileId, [...LAW_SUBJECT_SLUGS]),
  ]);
  if (!student) throw data("Student not found", { status: 404 });

  // feat-2-027 게임화 요약(레벨=마스터 단원 수 파생 + 스트릭 + 공부량). ★persist=false:
  // 관리자 조회가 학생의 last_active/level_seen 을 쓰지 않도록(읽기 미러는 무부작용).
  const masteredCount = summarizeMastery(
    nodeMastery.map((r) => r.stage),
  ).mastered;
  const todayYmd = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const gamification = await getGamificationSummary(
    adminClient,
    params.profileId,
    todayYmd,
    masteredCount,
    { persist: false },
  );

  return {
    student,
    cohortComparisons,
    notes,
    passTrend,
    subscriptions,
    payments,
    plans,
    srsSummary,
    oxDiagnosis,
    oxPasser,
    nodeMastery,
    gamification,
    currentUserId: user.id,
    isAdmin: roleAtLeast(role, "manager"),
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

export default function AdminStudentDetail({
  loaderData,
}: Route.ComponentProps) {
  const {
    student,
    cohortComparisons,
    notes,
    passTrend,
    subscriptions,
    payments,
    plans,
    srsSummary,
    oxDiagnosis,
    oxPasser,
    nodeMastery,
    gamification,
    currentUserId,
    isAdmin,
    role,
  } = loaderData;
  const roleLabel =
    student.role === "admin"
      ? "원장"
      : student.role === "instructor"
        ? "강사"
        : "수험생";

  return (
    <AdminShell
      cluster="students"
      role={role}
      title={`수강생 · ${student.name || "(이름 없음)"}`}
      desc={`${roleLabel} · 가입 ${student.joinedAt.slice(0, 10)}`}
      headerRight={
        <Link
          to="/admin/cohorts"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeftIcon className="size-3" /> 반 목록
        </Link>
      }
    >
      {/* ── 요약 카드 — 아바타 + 신원 + 핵심 지표 ── */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="bg-primary text-primary-foreground inline-flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-extrabold">
              {(student.name || "?").trim().charAt(0) || "?"}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-extrabold tracking-tight">
                  {student.name || "(이름 없음)"}
                </h2>
                <Chip tone="outline">
                  <UserIcon className="size-3" />
                  {roleLabel}
                </Chip>
              </div>
              {student.email ? (
                <p className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-sm">
                  <MailIcon className="size-3.5" />
                  {student.email}
                </p>
              ) : null}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-x-6 gap-y-3">
            <SummaryStat
              label="문제 풀이"
              value={`${student.totals.problemsCorrect} / ${student.totals.problemsAttempted}`}
            />
            <SummaryStat
              label="전체 정답률"
              value={
                student.totals.accuracyPct !== null
                  ? `${student.totals.accuracyPct}%`
                  : "—"
              }
              tone={accuracyTone(student.totals.accuracyPct)}
            />
            <SummaryStat
              label="조문 열람"
              value={`${student.totals.articlesViewed}`}
            />
            <SummaryStat
              label="빈칸 정답률"
              value={
                student.blanks.accuracyPct !== null
                  ? `${student.blanks.accuracyPct}%`
                  : "—"
              }
              tone={accuracyTone(student.blanks.accuracyPct)}
            />
          </div>
        </CardContent>
      </Card>

      {cohortComparisons.length > 0 ? (
        <div className="mb-6 space-y-3">
          {cohortComparisons.map((c) => (
            <CohortComparisonCard key={c.cohortId} comparison={c} />
          ))}
        </div>
      ) : null}

      {/* feat-2-027 — 정착도(단원 마스터리) + 성장(레벨·스트릭·공부량). 학생 화면과 동일 계산, 관리자 시점 미러. */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <MasteryCard rows={nodeMastery} />
        <GrowthCard g={gamification} />
      </div>

      {passTrend.length > 0 ? (
        <div className="mb-6">
          <PassTrendCard items={passTrend} />
        </div>
      ) : null}

      {/* feat-2-017 학생별 SRS 큐 요약 */}
      <div className="mb-6">
        <StudentSrsCard summary={srsSummary} />
      </div>

      {/* feat-2-022 학생별 정오문제 약점 진단 (단원 × 지식종류) — 학생 화면과 동일 게이트·톤 */}
      <div className="mb-6 space-y-3">
        <h2 className="text-sm font-bold tracking-tight">
          정오문제 약점 진단 (단원 × 지식종류)
        </h2>
        <OxDiagnosisView
          diagnosis={oxDiagnosis}
          passer={oxPasser}
          audience="staff"
        />
      </div>

      <div className="mb-6">
        <NotesSection
          studentId={student.profileId}
          notes={notes}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      </div>

      {/* feat-7-014 — manager+ 만 노출. loader 가 비 manager 면 빈 배열 반환. */}
      {isAdmin && plans.length > 0 ? (
        <div className="mb-6">
          <AdminSubscriptionPanel
            userId={student.profileId}
            subscriptions={subscriptions}
            payments={payments}
            plans={plans}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <p className="text-sm font-semibold">법률 과목별 진도</p>
              <p className="text-muted-foreground text-xs">
                과목별 조문 열람 + 문제 풀이/정답률
              </p>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              {student.bySubject.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    법률 과목 학습 기록이 없습니다.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>과목</TableHead>
                      <TableHead className="text-right">조문 열람</TableHead>
                      <TableHead className="text-right">문제</TableHead>
                      <TableHead className="text-right">정답률</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      {
                        label: "1차 · 객관식",
                        rows: student.bySubject.filter((s) =>
                          isFirstExamSubject(s.lawCode),
                        ),
                      },
                      {
                        label: "2차 · 주관식",
                        rows: student.bySubject.filter((s) =>
                          isSecondExamSubject(s.lawCode),
                        ),
                      },
                    ].map((g) => (
                      <Fragment key={g.label}>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell
                            colSpan={4}
                            className="text-link py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] uppercase"
                          >
                            {g.label}
                          </TableCell>
                        </TableRow>
                        {g.rows.map((s) => (
                          <TableRow key={s.lawCode}>
                            <TableCell className="text-sm font-medium">
                              {s.lawName}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {s.articlesViewed}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {s.problemsAttempted > 0
                                ? `${s.problemsCorrect}/${s.problemsAttempted}`
                                : "—"}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-xs font-semibold tabular-nums",
                                accuracyTone(s.accuracyPct),
                              )}
                            >
                              {s.accuracyPct !== null
                                ? `${s.accuracyPct}%`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {student.byScience.length > 0 ? (
            <Card>
              <CardHeader>
                <p className="text-sm font-semibold">자연과학 진도</p>
                <p className="text-muted-foreground text-xs">
                  과목별 풀이/정답률
                </p>
              </CardHeader>
              <Separator />
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>과목</TableHead>
                      <TableHead className="text-right">풀이/총</TableHead>
                      <TableHead className="text-right">정답률</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.byScience.map((s) => (
                      <TableRow key={s.slug}>
                        <TableCell className="text-sm font-medium">
                          {s.name}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {s.attempted} / {s.total}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs font-semibold tabular-nums",
                            accuracyTone(s.accuracyPct),
                          )}
                        >
                          {s.accuracyPct !== null ? `${s.accuracyPct}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <p className="inline-flex items-center gap-1 text-sm font-semibold">
              <ClockIcon className="text-link size-4" /> 최근 활동
            </p>
            <p className="text-muted-foreground text-xs">최근 12건</p>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {student.recent.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-muted-foreground text-sm">
                  학습 활동 기록이 없습니다.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {student.recent.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 px-4 py-2.5">
                    <ActivityIcon type={r.targetType} />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-medium">
                        {labelForType(r.targetType)}
                        {r.subject ? (
                          <span className="text-muted-foreground">
                            {" · "}
                            {r.subject}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        {r.occurredAt.slice(0, 16).replace("T", " ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-extrabold tracking-tight tabular-nums",
          tone ?? "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function labelForType(type: string): string {
  if (type === "article") return "조문 학습";
  if (type === "case") return "판례 학습";
  if (type === "problem") return "문제 풀이";
  return type || "활동";
}

function ActivityIcon({ type }: { type: string }) {
  const cls = "text-muted-foreground size-3.5 shrink-0 mt-0.5";
  if (type === "article") return <FileTextIcon className={cls} />;
  if (type === "case") return <GavelIcon className={cls} />;
  if (type === "problem") return <ListChecksIcon className={cls} />;
  return <ClockIcon className={cls} />;
}

function CohortComparisonCard({
  comparison,
}: {
  comparison: StudentCohortComparison;
}) {
  const c = comparison;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <UsersIcon className="text-link size-4" />
            반 평균 대비 — {c.cohortName}
          </p>
          <div className="flex items-center gap-2">
            {c.quartile !== null ? (
              <Badge
                variant={c.quartile >= 3 ? "default" : "secondary"}
                className="text-[10px]"
              >
                {c.quartile === 4
                  ? "상위 25%"
                  : c.quartile === 3
                    ? "상위 50%"
                    : c.quartile === 2
                      ? "하위 50%"
                      : "하위 25%"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                시도 부족
              </Badge>
            )}
            <Link
              to={`/admin/cohorts/${c.cohortId}/stats`}
              className="text-link inline-flex items-center gap-1 text-xs hover:underline"
            >
              반 통계 <ArrowRightIcon className="size-3" />
            </Link>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          멤버 {c.memberCount}명 평균 기준
        </p>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
        <CompareChip
          label="정답률"
          self={c.selfAccuracyPct === null ? "—" : `${c.selfAccuracyPct}%`}
          avg={c.avgAccuracyPct === null ? "—" : `${c.avgAccuracyPct}%`}
          diff={c.diffAccuracyPct}
          unit="%p"
          higherIsBetter
        />
        <CompareChip
          label="문제 풀이"
          self={`${c.selfProblemsAttempted}`}
          avg={`${c.avgProblemsAttempted}`}
          diff={c.diffProblemsAttempted}
          unit="문"
          higherIsBetter
        />
        <CompareChip
          label="조문 열람"
          self={`${c.selfArticlesViewed}`}
          avg={`${c.avgArticlesViewed}`}
          diff={c.diffArticlesViewed}
          unit="조"
          higherIsBetter
        />
      </CardContent>
    </Card>
  );
}

function CompareChip({
  label,
  self,
  avg,
  diff,
  unit,
  higherIsBetter,
}: {
  label: string;
  self: string;
  avg: string;
  diff: number | null;
  unit: string;
  higherIsBetter: boolean;
}) {
  const diffTone =
    diff === null
      ? "text-muted-foreground"
      : (diff > 0) === higherIsBetter
        ? "text-emerald-600 dark:text-emerald-400"
        : diff === 0
          ? "text-muted-foreground"
          : "text-rose-600 dark:text-rose-400";
  const DiffIcon =
    diff === null
      ? MinusIcon
      : diff > 0
        ? TrendingUpIcon
        : diff < 0
          ? TrendingDownIcon
          : MinusIcon;
  const sign = diff === null || diff === 0 ? "" : diff > 0 ? "+" : "";
  return (
    <div className="bg-muted/40 rounded-md border p-3">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-bold tabular-nums">{self}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          평균 {avg}
        </span>
      </div>
      <div
        className={cn(
          "mt-1 inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
          diffTone,
        )}
      >
        <DiffIcon className="size-3" />
        {diff === null ? "비교 불가" : `${sign}${diff}${unit}`}
      </div>
    </div>
  );
}

// ─── 합격 예측 점수 추이 (feat-7-027) ───

function PassTrendCard({ items }: { items: PassPredictionSnapshotItem[] }) {
  const latest = items[items.length - 1];
  const oldest = items[0];
  const delta = latest.score - oldest.score;
  const bgTone = (score: number) =>
    score >= 80
      ? "bg-emerald-500/80"
      : score >= 60
        ? "bg-lime-500/80"
        : score >= 40
          ? "bg-amber-500/80"
          : score >= 20
            ? "bg-orange-500/80"
            : "bg-rose-500/80";
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            합격 예측 점수 추이 ({items.length}일)
          </p>
          <Badge variant="outline" className="text-[10px]">
            현재 {latest.score} · 시작 {oldest.score} ·{" "}
            <span
              className={cn(
                delta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : delta < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "",
              )}
            >
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1">
          {items.map((it) => (
            <div
              key={it.snapshotDate}
              className="flex flex-1 flex-col"
              title={`${it.snapshotDate} · ${it.score}점 (${it.rating})`}
            >
              <div className="bg-muted/40 relative flex h-20 items-end overflow-hidden rounded">
                <div
                  className={cn("w-full transition-all", bgTone(it.score))}
                  style={{ height: `${Math.max(2, it.score)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── feat-2-027 단원 마스터리 (학생 화면과 동일 계산, 관리자 시점 미러) ───

function MasteryCard({ rows }: { rows: NodeMasteryRow[] }) {
  const summary = summarizeMastery(rows.map((r) => r.stage));
  const engaged = summary.learning + summary.familiar + summary.mastered;
  const mastered = rows.filter((r) => r.stage === "mastered");
  const widthPct = (n: number) => (engaged > 0 ? (n / engaged) * 100 : 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <BrainIcon className="text-link size-4" /> 단원 마스터리
        </p>
        <p className="text-muted-foreground text-xs">
          학습한 단원의 숙련도 · 마스터 = 정답률 85%+ &amp; 복습 2회 통과(파지)
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-4">
        {engaged === 0 ? (
          <p className="text-muted-foreground text-sm">
            아직 학습한 단원이 없습니다.
          </p>
        ) : (
          <>
            <div className="bg-muted flex h-2.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-muted-foreground/30"
                style={{ width: `${widthPct(summary.learning)}%` }}
              />
              <div
                className="bg-sky-500"
                style={{ width: `${widthPct(summary.familiar)}%` }}
              />
              <div
                className="bg-emerald-600"
                style={{ width: `${widthPct(summary.mastered)}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">
                학습 중 {summary.learning}
              </span>
              <span className="font-medium text-sky-600 dark:text-sky-400">
                익숙 {summary.familiar}
              </span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                마스터 {summary.mastered}
              </span>
              <span className="text-muted-foreground">
                · 학습 단원 {engaged}개
              </span>
            </div>
            {mastered.length > 0 ? (
              <p className="text-sm">
                정복한 단원{" "}
                <b className="text-emerald-600 dark:text-emerald-400">
                  {mastered.length}
                </b>
                개
                <span className="text-muted-foreground">
                  {" · "}
                  {mastered
                    .slice(0, 6)
                    .map((m) => m.displayLabel)
                    .join(" · ")}
                  {mastered.length > 6 ? " …" : ""}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                익숙한 단원을 복습으로 2회 이상 통과하면 마스터(정복)로 올라갑니다.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── feat-2-027 성장 (레벨·스트릭·공부량) — 학생 화면과 동일 계산 ───

function GrowthCard({ g }: { g: GamificationSummary }) {
  const { level, thisWeekActiveDays, currentStreak, longestStreak } = g;
  const thisWeekH = g.thisWeekStudyMs / 3_600_000;
  const delta = g.studyDeltaPct;
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <TrendingUpIcon className="text-link size-4" /> 성장 · 공부량
        </p>
        <p className="text-muted-foreground text-xs">
          마스터 단원 수로 단계 · 이번 주 학습일과 공부량
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-lg font-bold tracking-tight">{level.name}</span>
          <span className="text-muted-foreground text-xs">
            단계 {level.levelNumber}/5 · 마스터 {level.masteredCount}단원
          </span>
        </div>
        {level.nextName ? (
          <p className="text-muted-foreground text-xs">
            <b className="text-foreground">{level.toNext}단원</b> 더 마스터하면{" "}
            <b className="text-foreground">{level.nextName}</b> 단계
          </p>
        ) : (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            최고 단계 통달
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-sm">
          <span>
            이번 주 <b>{thisWeekActiveDays}</b>일 학습
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <FlameIcon className="size-3.5 text-orange-500" /> 연속{" "}
            {currentStreak}일 · 최장 {longestStreak}일
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span>
            이번 주 <b className="text-base">{thisWeekH.toFixed(1)}</b>h 학습
          </span>
          {delta === null ? (
            <span className="text-muted-foreground text-xs">
              지난주 대비 — (첫 주)
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
                delta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : delta < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground",
              )}
            >
              {delta > 0 ? (
                <TrendingUpIcon className="size-3" />
              ) : delta < 0 ? (
                <TrendingDownIcon className="size-3" />
              ) : (
                <MinusIcon className="size-3" />
              )}
              지난주 대비 {delta > 0 ? "+" : ""}
              {delta}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── feat-2-017 학생별 SRS 큐 요약 ───

function StudentSrsCard({ summary }: { summary: StudentSrsSummary }) {
  const totalDue =
    summary.problemDue + summary.blankDueBlanks + summary.oxDue + summary.articleDue;
  const totalLapses =
    summary.problemLapses + summary.blankLapses + summary.oxLapses;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold tracking-tight">복습 큐</h2>
          <div className="text-xs font-mono">
            <span className="text-muted-foreground">총 due </span>
            <span
              className={
                totalDue > 0
                  ? "text-rose-700 dark:text-rose-300 font-bold"
                  : "text-muted-foreground"
              }
            >
              {totalDue.toLocaleString("ko-KR")}건
            </span>
            {summary.oldestOverdueDays > 0 ? (
              <span className="text-rose-600 dark:text-rose-400 ml-2">
                · 가장 오래된 {summary.oldestOverdueDays}일 지남
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          객관식·빈칸·정오문제·조문 4 종 복습 통합. 학생이 다음 학습 진입 시 자동 큐잉.
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <SrsTile
            label="객관식"
            due={summary.problemDue}
            total={summary.problemTotal}
            lapses={summary.problemLapses}
          />
          <SrsTile
            label="빈칸 (세트)"
            due={summary.blankDueSets}
            total={summary.blankTotalBlanks}
            lapses={summary.blankLapses}
            note={`빈칸 ${summary.blankDueBlanks}개`}
          />
          <SrsTile
            label="정오문제"
            due={summary.oxDue}
            total={summary.oxTotal}
            lapses={summary.oxLapses}
          />
          <SrsTile
            label="조문 복습"
            due={summary.articleDue}
            total={summary.articleVisited}
            lapses={null}
            note="방문 기반"
          />
        </div>
        <p className="text-muted-foreground mt-3 text-[11px]">
          누적 실패 합산: {totalLapses.toLocaleString("ko-KR")}회 (객관식+빈칸+정오문제).
        </p>
      </CardContent>
    </Card>
  );
}

function SrsTile({
  label,
  due,
  total,
  lapses,
  note,
}: {
  label: string;
  due: number;
  total: number;
  lapses: number | null;
  note?: string;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-3.5 shadow-sm">
      <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        {label}
      </p>
      <p
        className={
          (due > 0
            ? "text-rose-700 dark:text-rose-300"
            : "text-foreground") +
          " mt-1.5 text-xl font-extrabold tabular-nums"
        }
      >
        {due.toLocaleString("ko-KR")}
        <span className="text-muted-foreground ml-1 text-xs font-medium">
          / {total.toLocaleString("ko-KR")}
        </span>
      </p>
      <p className="text-muted-foreground mt-1 text-[10px]">
        {note
          ? note
          : lapses !== null
            ? `실패 ${lapses.toLocaleString("ko-KR")}회`
            : ""}
      </p>
    </div>
  );
}

// ─── 1:1 상담 코멘트 (feat-7-025) ───

function NotesSection({
  studentId,
  notes,
  currentUserId,
  isAdmin,
}: {
  studentId: string;
  notes: StudentNote[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <Card id="notes" className="scroll-mt-20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <MessageSquareIcon className="text-link size-4" />
            상담 코멘트 ({notes.length})
          </p>
          <Button
            size="sm"
            variant={creating ? "ghost" : "outline"}
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? (
              <>
                <XIcon className="size-3.5" /> 취소
              </>
            ) : (
              <>
                <PlusIcon className="size-3.5" /> 신규
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 p-4">
        {creating ? (
          <NewNoteForm
            studentId={studentId}
            onClose={() => setCreating(false)}
          />
        ) : null}
        {notes.length === 0 ? (
          <p className="text-muted-foreground py-2 text-center text-xs">
            아직 코멘트가 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <NoteRow
                key={n.noteId}
                note={n}
                canEdit={isAdmin || n.authorId === currentUserId}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NewNoteForm({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, onClose, navigate, location.pathname, location.search]);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/student-note"
      className="bg-muted/30 space-y-2 rounded-md border p-3"
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="studentId" value={studentId} />
      <textarea
        name="bodyMd"
        required
        rows={3}
        maxLength={4000}
        placeholder="이 학생에게 남길 코멘트… (마크다운 가능)"
        className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input
            type="radio"
            name="visibility"
            value="staff_only"
            defaultChecked
          />
          <EyeOffIcon className="size-3" /> 강사만
        </label>
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input
            type="radio"
            name="visibility"
            value="share_with_student"
          />
          <EyeIcon className="size-3" /> 학생도 보기
        </label>
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input type="checkbox" name="isPinned" value="1" />
          <PinIcon className="size-3" /> 핀
        </label>
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
            저장
          </Button>
        </div>
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
    </fetcher.Form>
  );
}

function NoteRow({
  note,
  canEdit,
}: {
  note: StudentNote;
  canEdit: boolean;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);
  return (
    <li className="bg-card space-y-1.5 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {note.isPinned ? (
          <Badge variant="default" className="text-[10px]">
            <PinIcon className="size-3" /> 핀
          </Badge>
        ) : null}
        <Badge
          variant={
            note.visibility === "share_with_student" ? "default" : "outline"
          }
          className="text-[10px]"
        >
          {note.visibility === "share_with_student" ? (
            <>
              <EyeIcon className="size-3" /> 학생 공개
            </>
          ) : (
            <>
              <EyeOffIcon className="size-3" /> 강사만
            </>
          )}
        </Badge>
        {note.visibility === "share_with_student" ? (
          note.readAt ? (
            <Badge
              variant="outline"
              className="border-emerald-300 text-[10px] text-emerald-600 dark:border-emerald-800 dark:text-emerald-400"
            >
              <CheckCheckIcon className="size-3" /> 읽음 ·{" "}
              {note.readAt.slice(5, 16).replace("T", " ")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground text-[10px]">
              안읽음
            </Badge>
          )
        ) : null}
        <span className="text-muted-foreground ml-auto text-[10px] tabular-nums">
          {note.authorName ?? "(작성자)"} · {note.createdAt.slice(0, 16).replace("T", " ")}
        </span>
        {canEdit ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6"
            onClick={() => setEditing((v) => !v)}
            title="수정"
          >
            <PencilIcon className="size-3" />
          </Button>
        ) : null}
        {canEdit ? (
          <fetcher.Form method="post" action="/api/admin/student-note">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="noteId" value={note.noteId} />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="size-6 text-rose-600 hover:text-rose-700"
              onClick={(e) => {
                if (!confirm("이 코멘트를 삭제합니까?")) {
                  e.preventDefault();
                }
              }}
              disabled={fetcher.state !== "idle"}
            >
              <Trash2Icon className="size-3" />
            </Button>
          </fetcher.Form>
        ) : null}
      </div>
      {editing ? (
        <EditNoteForm note={note} onClose={() => setEditing(false)} />
      ) : (
        <MarkdownView text={note.bodyMd} trusted={false} className="text-sm" />
      )}
    </li>
  );
}

function EditNoteForm({
  note,
  onClose,
}: {
  note: StudentNote;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, onClose, navigate, location.pathname, location.search]);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/student-note"
      className="bg-muted/30 space-y-2 rounded-md border p-3"
    >
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="noteId" value={note.noteId} />
      <textarea
        name="bodyMd"
        required
        rows={3}
        maxLength={4000}
        defaultValue={note.bodyMd}
        placeholder="코멘트… (마크다운 가능)"
        className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input
            type="radio"
            name="visibility"
            value="staff_only"
            defaultChecked={note.visibility === "staff_only"}
          />
          <EyeOffIcon className="size-3" /> 강사만
        </label>
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input
            type="radio"
            name="visibility"
            value="share_with_student"
            defaultChecked={note.visibility === "share_with_student"}
          />
          <EyeIcon className="size-3" /> 학생도 보기
        </label>
        <label className="border-input flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
          <input
            type="checkbox"
            name="isPinned"
            value="1"
            defaultChecked={note.isPinned}
          />
          <PinIcon className="size-3" /> 핀
        </label>
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
            저장
          </Button>
        </div>
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
    </fetcher.Form>
  );
}
