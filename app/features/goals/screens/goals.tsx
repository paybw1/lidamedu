// 학습 목표 — 시험일/주간 목표/시험 유형/목표 점수/메모.
// 단일 row upsert (user_id PK).

import {
  ArrowRightIcon,
  AwardIcon,
  BookmarkIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ListChecksIcon,
  TargetIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Form, Link, data, useNavigation } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getStudyGoals,
  upsertStudyGoals,
  type ExamType,
} from "~/features/goals/queries.server";
import {
  getAllSubjectsProgress,
  getDailyStudyStats,
  getOverallProgress,
} from "~/features/study/queries.server";
import { Fragment } from "react";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  isFirstExamSubject,
  isSecondExamSubject,
} from "~/features/subjects/lib/subjects";
import {
  getPasserBenchmarks,
  type PasserBenchmark,
} from "~/features/exam-results/analytics.server";
import { isPasserBenchmarkEnabled } from "~/features/exam-results/passer-benchmark-gate.server";

import type { Route } from "./+types/goals";

export const meta: Route.MetaFunction = () => [
  { title: "학습목표 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [goals, overall, subjects, dailyStats, passerBenchmark] =
    await Promise.all([
      getStudyGoals(client, user.id),
      getOverallProgress(client, user.id),
      getAllSubjectsProgress(
        client,
        user.id,
        LAW_SUBJECT_SLUGS.map((s) => ({
          slug: s,
          name: LAW_SUBJECTS[s].name,
        })),
      ),
      getDailyStudyStats(client, user.id, { daysBack: 84 }),
      // 학생 화면 — 합성 합격자 노출 금지 + 게이트 OFF 시 호출 skip.
      isPasserBenchmarkEnabled().then((gate) =>
        gate.enabled
          ? getPasserBenchmarks(user.id, { excludeSynthetic: true })
          : null,
      ),
    ]);
  return { goals, overall, subjects, dailyStats, passerBenchmark };
}

const schema = z.object({
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "시험일은 YYYY-MM-DD 형식")
    .optional()
    .or(z.literal("")),
  weeklyGoalHours: z.coerce
    .number()
    .int()
    .min(0, "0 이상")
    .max(168, "주 168시간 이내"),
  examType: z.enum(["first", "second"]),
  targetScore: z
    .union([
      z.coerce.number().int().min(0).max(1000),
      z.literal(""),
    ])
    .optional(),
  notes: z.string().max(500, "500자 이내").optional().or(z.literal("")),
});

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const form = await request.formData();
  const parsed = schema.safeParse({
    examDate: form.get("examDate") ?? "",
    weeklyGoalHours: form.get("weeklyGoalHours") ?? "0",
    examType: form.get("examType") ?? "first",
    targetScore: form.get("targetScore") ?? "",
    notes: form.get("notes") ?? "",
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return data({ error: first?.message ?? "입력 오류" }, { status: 400 });
  }

  await upsertStudyGoals(client, user.id, {
    examDate: parsed.data.examDate ? parsed.data.examDate : null,
    weeklyGoalHours: parsed.data.weeklyGoalHours,
    examType: parsed.data.examType as ExamType,
    targetScore:
      typeof parsed.data.targetScore === "number"
        ? parsed.data.targetScore
        : null,
    notes: parsed.data.notes ? parsed.data.notes : null,
  });

  return { ok: true as const };
}

export default function Goals({ loaderData, actionData }: Route.ComponentProps) {
  const { goals, overall, subjects, dailyStats, passerBenchmark } = loaderData;
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const errorMsg =
    actionData && "error" in actionData ? actionData.error : null;
  const saved =
    actionData && "ok" in actionData && actionData.ok ? true : false;

  const dday =
    goals.examDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(goals.examDate).getTime() - Date.now()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : null;

  // 권장 일평균 진도 — D-day 가 있을 때만 의미.
  const daysLeft = dday !== null ? Math.max(1, dday) : null;
  const remainingArticles = Math.max(
    0,
    overall.articles.total - overall.articles.visited,
  );
  const remainingProblems = Math.max(
    0,
    overall.problems.total - overall.problems.attempted,
  );
  const dailyArticleTarget = daysLeft
    ? Math.ceil(remainingArticles / daysLeft)
    : null;
  const dailyProblemTarget = daysLeft
    ? Math.ceil(remainingProblems / daysLeft)
    : null;
  const dailyHourTarget = (goals.weeklyGoalHours / 7).toFixed(1);

  // 주별 학습 시간 (최근 12주, 가장 오래된 → 최근).
  const WEEKS = 12;
  const weeklyHours: number[] = [];
  for (let w = WEEKS - 1; w >= 0; w -= 1) {
    const end = dailyStats.days.length - w * 7;
    const start = Math.max(0, end - 7);
    const slice = dailyStats.days.slice(start, end);
    const hours = slice.reduce((s, d) => s + d.timeMs, 0) / (60 * 60 * 1000);
    weeklyHours.push(hours);
  }
  const maxWeek = Math.max(0.1, ...weeklyHours);
  const lastWeekHours = weeklyHours[weeklyHours.length - 1] ?? 0;
  const prevWeekHours = weeklyHours[weeklyHours.length - 2] ?? 0;
  const weekDeltaPct =
    prevWeekHours > 0
      ? Math.round(((lastWeekHours - prevWeekHours) / prevWeekHours) * 100)
      : null;

  // 마일스톤 — 조문/문제 진척률 25/50/75/100% 별 뱃지.
  const milestones: Array<{
    label: string;
    pct: number;
    achievedAt: 25 | 50 | 75 | 100 | null;
  }> = [
    {
      label: "조문 학습",
      pct: overall.articles.pct,
      achievedAt: latestMilestone(overall.articles.pct),
    },
    {
      label: "판례 학습",
      pct: overall.cases.pct,
      achievedAt: latestMilestone(overall.cases.pct),
    },
    {
      label: "문제 풀이",
      pct: overall.problems.pct,
      achievedAt: latestMilestone(overall.problems.pct),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <TargetIcon className="size-3.5" /> 학습 목표
        </p>
        <h1 className="text-2xl font-bold tracking-tight">학습 목표 설정</h1>
        <p className="text-muted-foreground text-sm">
          시험일·주간 목표 시간을 입력하면 대시보드 D-day 와 주간 그래프에
          반영됩니다.
        </p>
      </header>

      {dday !== null ? (
        <section className="mb-6 space-y-3" data-testid="goal-progress">
          <p className="text-sm font-semibold">목표 vs 현재 진척도</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <ProgressKpi
              icon={<CalendarIcon className="size-4" />}
              label="시험까지"
              value={`D-${dday}`}
              hint={`일평균 권장 ${dailyHourTarget}h 학습`}
            />
            <ProgressKpi
              icon={<BookmarkIcon className="size-4" />}
              label="조문 진도"
              value={`${overall.articles.pct}%`}
              hint={
                dailyArticleTarget !== null && remainingArticles > 0
                  ? `남은 ${remainingArticles.toLocaleString("ko-KR")}조 · 일 ${dailyArticleTarget}조 권장`
                  : "모든 조문 열람 완료 🎉"
              }
            />
            <ProgressKpi
              icon={<ListChecksIcon className="size-4" />}
              label="문제 풀이"
              value={`${overall.problems.pct}%`}
              hint={
                dailyProblemTarget !== null && remainingProblems > 0
                  ? `남은 ${remainingProblems.toLocaleString("ko-KR")}문 · 일 ${dailyProblemTarget}문 권장`
                  : "모든 문제 시도 완료 🎉"
              }
            />
          </div>
        </section>
      ) : (
        <p
          className="text-muted-foreground bg-muted/40 mb-6 rounded-md border border-dashed p-4 text-xs"
          data-testid="goal-progress-empty"
        >
          시험일을 입력하면 D-day 기반 일평균 권장 진도가 자동으로 계산됩니다.
        </p>
      )}

      {passerBenchmark ? (
        <PasserCalibrationCard
          benchmark={passerBenchmark}
          dailyHourTarget={Number(dailyHourTarget)}
          totalDaysLeft={dday}
        />
      ) : null}

      <section className="mb-6 space-y-3" data-testid="milestones">
        <p className="text-sm font-semibold inline-flex items-center gap-1.5">
          <AwardIcon className="size-4" /> 마일스톤
        </p>
        <div className="flex flex-wrap gap-2">
          {milestones.map((m) => (
            <Badge
              key={m.label}
              variant={m.achievedAt ? "default" : "outline"}
              className={cn(
                "gap-1 text-xs",
                m.achievedAt === 100 && "bg-emerald-600 hover:bg-emerald-700",
                m.achievedAt === 75 && "bg-amber-500 hover:bg-amber-600",
                m.achievedAt === 50 && "bg-sky-500 hover:bg-sky-600",
                m.achievedAt === 25 && "bg-stone-500 hover:bg-stone-600",
              )}
            >
              {m.achievedAt ? MILESTONE_EMOJI[m.achievedAt] : ""}
              {m.label} {m.pct}%
              {m.achievedAt
                ? ` · ${m.achievedAt}% 달성`
                : ` · 다음 25% 까지 ${Math.max(0, 25 - m.pct)}%p`}
            </Badge>
          ))}
        </div>
      </section>

      <section className="mb-6 space-y-3" data-testid="subject-breakdown">
        <p className="text-sm font-semibold inline-flex items-center gap-1.5">
          <BookmarkIcon className="size-4" /> 과목별 진도
        </p>
        <Card>
          <CardContent className="px-0 py-2">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">과목</th>
                  <th className="px-3 py-2 text-right tabular-nums">조문</th>
                  <th className="px-3 py-2 text-right tabular-nums">문제 시도</th>
                  <th className="px-3 py-2 text-right tabular-nums">정답률</th>
                  <th className="px-3 py-2 text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label: "1차 · 객관식",
                    rows: subjects.filter((s) => isFirstExamSubject(s.lawCode)),
                  },
                  {
                    label: "2차 · 주관식",
                    rows: subjects.filter((s) =>
                      isSecondExamSubject(s.lawCode),
                    ),
                  },
                ].map((g) => (
                  <Fragment key={g.label}>
                    <tr>
                      <td
                        colSpan={5}
                        className="text-primary bg-muted/40 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] uppercase"
                      >
                        {g.label}
                      </td>
                    </tr>
                    {g.rows.map((s) => (
                      <tr
                        key={s.lawCode}
                        className="hover:bg-muted/50 border-t"
                      >
                        <td className="px-3 py-2 font-medium">{s.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.visitedCount} / {s.totalArticleCount}
                          <span className="text-muted-foreground ml-1 text-xs">
                            ({s.pctViewed}%)
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.problemsAttempted}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.accuracyPct === null ? "—" : `${s.accuracyPct}%`}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7"
                          >
                            <Link to={`/subjects/${s.lawCode}`} viewTransition>
                              학습 <ArrowRightIcon className="size-3" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section className="mb-6 space-y-3" data-testid="weekly-trend">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold inline-flex items-center gap-1.5">
            <TrendingUpIcon className="size-4" /> 주별 학습 시간 추이 (최근 12주)
          </p>
          {weekDeltaPct !== null ? (
            <Badge
              variant="outline"
              className={cn(
                "text-xs tabular-nums",
                weekDeltaPct > 0 && "border-emerald-300 text-emerald-700",
                weekDeltaPct < 0 && "border-rose-300 text-rose-700",
              )}
            >
              직전 주 대비 {weekDeltaPct > 0 ? "+" : ""}{weekDeltaPct}%
            </Badge>
          ) : null}
        </div>
        <Card>
          <CardContent className="px-4 py-3">
            <div
              className="flex h-24 items-end gap-1.5"
              data-testid="weekly-trend-bars"
            >
              {weeklyHours.map((h, i) => {
                const heightPct = (h / maxWeek) * 100;
                const isLast = i === weeklyHours.length - 1;
                return (
                  <div
                    key={i}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={`${h.toFixed(1)}시간`}
                  >
                    <div
                      className={cn(
                        "w-full rounded-sm",
                        isLast ? "bg-primary" : "bg-primary/40",
                      )}
                      style={{
                        height: `${Math.max(heightPct, h > 0 ? 6 : 0)}%`,
                        minHeight: h > 0 ? 4 : 0,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              가장 오른쪽 = 이번 주 ({lastWeekHours.toFixed(1)}h){" "}
              {goals.weeklyGoalHours > 0
                ? `/ 목표 ${goals.weeklyGoalHours}h`
                : ""}
            </p>
          </CardContent>
        </Card>
      </section>

      <Form method="post" className="space-y-5">
        <Card>
          <CardHeader>
            <p className="text-sm font-semibold">시험 정보</p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="시험일">
              <Input
                type="date"
                name="examDate"
                defaultValue={goals.examDate ?? ""}
                data-testid="goal-exam-date"
              />
              {dday !== null ? (
                <p className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-xs">
                  <CalendarIcon className="size-3" /> 현재 D-{dday}
                </p>
              ) : null}
            </Field>
            <Field label="시험 유형">
              <select
                name="examType"
                defaultValue={goals.examType}
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              >
                <option value="first">1차 (객관식)</option>
                <option value="second">2차 (주관식)</option>
              </select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-sm font-semibold">목표</p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="주간 목표 시간 (시간)">
              <Input
                type="number"
                name="weeklyGoalHours"
                min={0}
                max={168}
                step={1}
                defaultValue={String(goals.weeklyGoalHours)}
                required
                data-testid="goal-weekly-hours"
              />
            </Field>
            <Field label="목표 점수 (선택)">
              <Input
                type="number"
                name="targetScore"
                min={0}
                max={1000}
                step={1}
                defaultValue={goals.targetScore?.toString() ?? ""}
              />
            </Field>
            <Field label="메모 (선택)" className="sm:col-span-2">
              <textarea
                name="notes"
                defaultValue={goals.notes ?? ""}
                rows={3}
                maxLength={500}
                className="border-input bg-background min-h-[72px] rounded-md border p-2 text-sm"
              />
            </Field>
          </CardContent>
        </Card>

        {errorMsg ? (
          <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
            {errorMsg}
          </p>
        ) : null}
        {saved ? (
          <p
            className="text-sm text-emerald-600 dark:text-emerald-400"
            role="status"
            data-testid="goal-saved"
          >
            <CheckCircle2Icon className="mr-1 inline size-4" /> 저장되었습니다.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            size="lg"
            disabled={submitting}
            data-testid="goal-save"
          >
            {submitting ? "저장 중…" : "저장"}
          </Button>
        </div>
      </Form>
    </div>
  );
}

function latestMilestone(pct: number): 25 | 50 | 75 | 100 | null {
  if (pct >= 100) return 100;
  if (pct >= 75) return 75;
  if (pct >= 50) return 50;
  if (pct >= 25) return 25;
  return null;
}

const MILESTONE_EMOJI: Record<25 | 50 | 75 | 100, string> = {
  25: "🥉",
  50: "🥈",
  75: "🥇",
  100: "🏆",
};

function ProgressKpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className={cn("py-4")}>
      <CardContent className="px-4">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium tracking-wide uppercase">
          {icon}
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// 합격자 실측 기반 권장 진도 보정 (feat-8-019)
function PasserCalibrationCard({
  benchmark,
  dailyHourTarget,
  totalDaysLeft,
}: {
  benchmark: PasserBenchmark;
  dailyHourTarget: number;
  totalDaysLeft: number | null;
}) {
  const passerHours = benchmark.studyHours.passerMean;
  const userHours = benchmark.studyHours.user;
  const passerAccuracy = benchmark.accuracyPct.passerMean;
  const userAccuracy = benchmark.accuracyPct.user;
  const passerAttempts = benchmark.problemAttempts.passerMean;
  const userAttempts = benchmark.problemAttempts.user;

  // 합격자 실측 기반 권장 일평균 — 본인 부족분 / 남은 일수.
  let calibratedDailyHours: number | null = null;
  let gapHours: number | null = null;
  if (
    passerHours !== null &&
    userHours !== null &&
    totalDaysLeft !== null &&
    totalDaysLeft > 0
  ) {
    gapHours = Math.max(0, passerHours - userHours);
    calibratedDailyHours = gapHours / totalDaysLeft;
  }
  const targetGapPct =
    calibratedDailyHours !== null
      ? Math.round(((calibratedDailyHours - dailyHourTarget) / Math.max(0.1, dailyHourTarget)) * 100)
      : null;

  return (
    <section
      className="mb-6 space-y-3"
      data-testid="passer-calibration"
    >
      <p className="text-sm font-semibold inline-flex items-center gap-1.5">
        <TrendingUpIcon className="size-4" />
        합격자 실측 기반 보정
        <Badge variant="outline" className="ml-2 text-[10px]">
          표본 {benchmark.sampleSize}
        </Badge>
      </p>
      <Card>
        <CardContent className="space-y-3 px-4 py-3">
          {benchmark.fallbackReason ? (
            <p className="rounded border border-amber-200 bg-amber-50/60 px-2 py-1 text-[11px] text-amber-900">
              ⚠️ {benchmark.fallbackReason}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <MetricRow
              label="누적 학습 시간"
              user={
                userHours !== null
                  ? `${Math.round(userHours)}h`
                  : "—"
              }
              passer={
                passerHours !== null
                  ? `${Math.round(passerHours)}h`
                  : "—"
              }
              delta={
                gapHours !== null && gapHours > 0
                  ? `+${Math.round(gapHours)}h 필요`
                  : "달성"
              }
              good={gapHours !== null && gapHours === 0}
            />
            <MetricRow
              label="총 문제 풀이"
              user={
                userAttempts !== null
                  ? `${Math.round(userAttempts).toLocaleString("ko-KR")}회`
                  : "—"
              }
              passer={
                passerAttempts !== null
                  ? `${Math.round(passerAttempts).toLocaleString("ko-KR")}회`
                  : "—"
              }
              delta={
                userAttempts !== null && passerAttempts !== null
                  ? userAttempts >= passerAttempts
                    ? "달성"
                    : `+${Math.round(passerAttempts - userAttempts).toLocaleString("ko-KR")}회 필요`
                  : "—"
              }
              good={
                userAttempts !== null &&
                passerAttempts !== null &&
                userAttempts >= passerAttempts
              }
            />
            <MetricRow
              label="정답률"
              user={
                userAccuracy !== null
                  ? `${Math.round(userAccuracy)}%`
                  : "—"
              }
              passer={
                passerAccuracy !== null
                  ? `${Math.round(passerAccuracy)}%`
                  : "—"
              }
              delta={
                userAccuracy !== null && passerAccuracy !== null
                  ? userAccuracy >= passerAccuracy
                    ? "달성"
                    : `+${Math.round(passerAccuracy - userAccuracy)}%p 필요`
                  : "—"
              }
              good={
                userAccuracy !== null &&
                passerAccuracy !== null &&
                userAccuracy >= passerAccuracy
              }
            />
          </div>
          {calibratedDailyHours !== null && totalDaysLeft !== null ? (
            <div
              className={cn(
                "rounded-md p-3 text-xs",
                calibratedDailyHours > dailyHourTarget
                  ? "bg-rose-50 text-rose-900 border border-rose-200"
                  : "bg-emerald-50 text-emerald-900 border border-emerald-200",
              )}
            >
              <strong className="text-[13px]">
                실측 권장 일평균 학습 시간:{" "}
                <span className="tabular-nums">
                  {calibratedDailyHours < 0.1
                    ? "이미 합격자 평균"
                    : `${calibratedDailyHours.toFixed(1)}h`}
                </span>
              </strong>
              <div className="mt-1 opacity-80">
                남은 {totalDaysLeft}일 동안 합격자 평균(
                {passerHours !== null ? `${Math.round(passerHours)}h` : "—"})
                까지 따라잡으려면 매일{" "}
                <strong className="tabular-nums">
                  {calibratedDailyHours.toFixed(1)}h
                </strong>{" "}
                학습 필요.{" "}
                {targetGapPct !== null && targetGapPct !== 0 ? (
                  <span>
                    현재 목표({dailyHourTarget}h){" "}
                    {targetGapPct > 0 ? "보다" : "보다"}{" "}
                    <strong>
                      {Math.abs(targetGapPct)}%{" "}
                      {targetGapPct > 0 ? "더 늘려" : "여유 있음"}
                    </strong>
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function MetricRow({
  label,
  user,
  passer,
  delta,
  good,
}: {
  label: string;
  user: string;
  passer: string;
  delta: string;
  good: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-1 flex items-baseline justify-between text-xs tabular-nums">
        <span>
          본인 <strong>{user}</strong>
        </span>
        <span className="text-muted-foreground">합격자 {passer}</span>
      </div>
      <div
        className={cn(
          "mt-1 text-[10px] font-semibold",
          good ? "text-emerald-700" : "text-rose-700",
        )}
      >
        {delta}
      </div>
    </div>
  );
}
