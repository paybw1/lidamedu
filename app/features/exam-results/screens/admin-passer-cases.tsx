// feat-8-006 합격자 케이스 카드 (Phase B 첫 단계).
// /admin/analytics/passers — admin 전용.
// 한 명 한 명의 합격자: 결과·자가 학습 요약 + (분석 동의자에 한해) 학습 로그 집계.

import {
  CheckCircle2Icon,
  ClipboardCheckIcon,
  EyeOffIcon,
  ShieldCheckIcon,
  TrophyIcon,
} from "lucide-react";
import { Form, Link, data, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Button } from "~/core/components/ui/button";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  computePasserAggregateStats,
  getPasserPoolStats,
  listPasserCases,
  type Histogram,
  type PasserAggregateStats,
  type PasserCase,
} from "~/features/exam-results/analytics.server";
import {
  EXAM_ROUND_LABEL,
  EXAM_VERIFICATION_STATUS_LABEL,
  SCIENCE_SUBJECT_LABEL,
  type ExamRound,
} from "~/features/exam-results/labels";

import type { Route } from "./+types/admin-passer-cases";

export const meta: Route.MetaFunction = () => [
  { title: "합격자 분석 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (role !== "admin")
    throw data("admin 권한이 필요합니다", { status: 403 });

  const url = new URL(request.url);
  const yearStr = url.searchParams.get("year");
  const filter = {
    year: yearStr ? Number(yearStr) : null,
    round: (url.searchParams.get("round") as ExamRound | null) || null,
    onlyVerified: url.searchParams.get("verified") === "1",
    onlyConsented: url.searchParams.get("consented") === "1",
  };
  const [cases, pool] = await Promise.all([
    listPasserCases(filter),
    getPasserPoolStats(),
  ]);
  const stats = computePasserAggregateStats(cases);
  return { cases, pool, stats, filter };
}

function formatHours(ms: number): string {
  if (ms <= 0) return "0";
  const h = ms / 3_600_000;
  return h >= 10 ? Math.round(h).toString() : h.toFixed(1);
}

export default function AdminPasserCases({ loaderData }: Route.ComponentProps) {
  const { cases, pool, stats, filter } = loaderData;
  const totalCount = cases.length;
  const withAggCount = cases.filter((c) => c.aggregates !== null).length;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <TrophyIcon className="size-3.5" /> 운영자 · 합격자 분석
        </p>
        <h1 className="text-2xl font-bold tracking-tight">합격자 케이스</h1>
        <p className="text-muted-foreground text-sm">
          한 명 한 명의 합격자가 어떻게 공부했는지 살펴봅니다. 분석 동의를 받은
          학생만 학습 로그 집계를 표시합니다. 표본이 충분히 모이면 통계 대시보드로
          확장합니다.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <PoolStat label="합격 총수" value={pool.passerCount} tone="emerald" />
        <PoolStat label="인증 합격" value={pool.verifiedPasserCount} tone="sky" />
        <PoolStat
          label="분석 동의 합격"
          value={pool.consentedPasserCount}
          tone="violet"
        />
        <PoolStat label="현재 표시" value={totalCount} tone="amber" />
      </div>

      {pool.byYearRound.length > 0 ? (
        <Card className="mb-4">
          <CardHeader className="px-4 pb-2">
            <p className="text-sm font-semibold">연도·차수별 분포</p>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-2">
              {pool.byYearRound.map((g) => (
                <div
                  key={`${g.examYear}-${g.examRound}`}
                  className="rounded-md border bg-muted/30 px-2 py-1 text-[11px] tabular-nums"
                >
                  <span className="font-semibold">
                    {g.examYear} {EXAM_ROUND_LABEL[g.examRound]}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    {g.count}명 · 인증 {g.verified}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {stats.sampleSize > 0 ? (
        <StatsSection stats={stats} />
      ) : (
        <Card className="mb-4 border-amber-200 bg-amber-50/40">
          <CardContent className="px-4 py-4 text-xs">
            <p className="text-amber-900">
              분석 동의 합격자가 아직 없어 통계 시각화를 표시할 수 없습니다.
              합격자가 <Link to="/me/exam-results" className="underline">분석 동의</Link>를
              체크해야 학습 로그 분포가 집계됩니다.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="px-4 py-3">
          <Form method="get" className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div>
              <Label className="text-[11px]">연도</Label>
              <Input
                type="number"
                name="year"
                defaultValue={filter.year ?? ""}
                placeholder="2026"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px]">차수</Label>
              <select
                name="round"
                defaultValue={filter.round ?? ""}
                className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
              >
                <option value="">전체</option>
                <option value="first">1차</option>
                <option value="second">2차</option>
              </select>
            </div>
            <div className="flex items-end">
              <Label className="text-[11px] inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  name="verified"
                  value="1"
                  defaultChecked={filter.onlyVerified}
                />
                인증만
              </Label>
            </div>
            <div className="flex items-end">
              <Label className="text-[11px] inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  name="consented"
                  value="1"
                  defaultChecked={filter.onlyConsented}
                />
                분석 동의자만
              </Label>
            </div>
            <div className="flex items-end justify-end gap-1">
              <Button size="sm" type="submit">
                필터
              </Button>
              <Link
                to="/admin/analytics/passers"
                className="text-muted-foreground text-xs underline"
              >
                초기화
              </Link>
            </div>
          </Form>
          <p className="text-muted-foreground mt-2 text-[11px]">
            학습 로그 집계는 응시 전년도 1월 1일 ~ 응시 연도 12월 31일 구간을 봅니다.
            {totalCount > 0 ? (
              <span className="ml-1">
                현재 {withAggCount}/{totalCount} 명에 대해 집계 표시.
              </span>
            ) : null}
          </p>
        </CardContent>
      </Card>

      {cases.length === 0 ? (
        <Card>
          <CardContent className="px-4 py-8 text-center">
            <p className="text-muted-foreground text-sm">
              조건에 맞는 합격자가 없습니다. 결과 인증/입력이 더 모이면 여기에
              표시됩니다.
            </p>
            <Link
              to="/admin/exam-results"
              className="text-primary mt-2 inline-block text-xs underline"
            >
              합격 결과 운영 화면 →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cases.map((c) => (
            <PasserCard key={c.resultId} item={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function PoolStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "sky" | "violet" | "amber";
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
    sky: "bg-sky-50 text-sky-800 border-sky-200",
    violet: "bg-violet-50 text-violet-800 border-violet-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
  }[tone];
  return (
    <div className={cn("rounded-md border px-3 py-2", toneClass)}>
      <div className="text-[10px] font-semibold tracking-wide uppercase opacity-80">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums">
        {value.toLocaleString("ko-KR")}
      </div>
    </div>
  );
}

function PasserCard({ item }: { item: PasserCase }) {
  const verified = item.verificationStatus === "verified";
  const consented = item.analyticsConsentAt !== null;
  const agg = item.aggregates;
  return (
    <Card data-testid={`passer-card-${item.resultId}`}>
      <CardHeader className="px-4 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">
              <Link
                to={`/admin/students/${item.userId}`}
                className="hover:underline"
              >
                {item.userName}
              </Link>
              <span className="text-muted-foreground ml-2 text-xs tabular-nums">
                {item.examYear} {EXAM_ROUND_LABEL[item.examRound]} · 합격
              </span>
            </p>
            {item.userEmail ? (
              <p className="text-muted-foreground text-[10px]">
                {item.userEmail}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {verified ? (
              <Badge
                variant="default"
                className="bg-emerald-100 text-emerald-800 text-[10px] hover:bg-emerald-100"
              >
                <ShieldCheckIcon className="mr-1 size-3" />
                인증
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                {EXAM_VERIFICATION_STATUS_LABEL[item.verificationStatus]}
              </Badge>
            )}
            {consented ? (
              <Badge
                variant="default"
                className="bg-violet-100 text-violet-800 text-[10px] hover:bg-violet-100"
              >
                <CheckCircle2Icon className="mr-1 size-3" />
                동의
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                <EyeOffIcon className="mr-1 size-3" />
                미동의
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-3">
        <div className="flex flex-wrap gap-3 text-xs">
          {item.selfReportedTotalScore !== null ? (
            <div>
              <span className="text-muted-foreground">자가 점수: </span>
              <span className="font-semibold tabular-nums">
                {item.selfReportedTotalScore}
              </span>
            </div>
          ) : null}
          {item.selectedScienceSubject ? (
            <div>
              <span className="text-muted-foreground">자연과학: </span>
              <span className="font-semibold">
                {SCIENCE_SUBJECT_LABEL[item.selectedScienceSubject] ??
                  item.selectedScienceSubject}
              </span>
            </div>
          ) : null}
        </div>

        {item.studySummaryMd ? (
          <div className="rounded border-l-2 border-emerald-300 bg-emerald-50/40 p-2">
            <p className="text-[10px] font-semibold tracking-wide uppercase text-emerald-800">
              <ClipboardCheckIcon className="mr-1 inline size-3" />
              본인 학습 요약
            </p>
            <p className="text-xs leading-relaxed whitespace-pre-line">
              {item.studySummaryMd}
            </p>
          </div>
        ) : null}

        <Separator />

        {!consented ? (
          <p className="text-muted-foreground text-[11px]">
            <EyeOffIcon className="mr-1 inline size-3" />
            분석 활용 미동의 — 학습 로그 집계는 표시하지 않습니다.
          </p>
        ) : !agg ? (
          <p className="text-muted-foreground text-[11px]">
            학습 로그를 집계하지 못했습니다.
          </p>
        ) : (
          <PasserAggView agg={agg} />
        )}
      </CardContent>
    </Card>
  );
}

function PasserAggView({
  agg,
}: {
  agg: NonNullable<PasserCase["aggregates"]>;
}) {
  const acc = agg.accuracyPct;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="문제 풀이" value={`${agg.totalProblemAttempts.toLocaleString("ko-KR")}회`} sub={`${agg.distinctProblems}문제`} />
        <Stat
          label="정답률"
          value={acc !== null ? `${acc}%` : "—"}
          sub={agg.totalProblemAttempts > 0 ? `${agg.totalProblemAttempts}회 기준` : ""}
        />
        <Stat
          label="학습 시간"
          value={`${formatHours(agg.totalStudyTimeMs)}h`}
          sub={`${agg.activeDays}일 활동`}
        />
        <Stat
          label="최장 연속"
          value={`${agg.longestStreakDays}일`}
          sub="응시 기간 내"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Stat
          label="빈칸"
          value={`${agg.blanksCorrect}/${agg.blanksTotal}`}
          sub={agg.blanksTotal > 0 ? `${Math.round((agg.blanksCorrect / agg.blanksTotal) * 100)}%` : ""}
        />
        <Stat
          label="조문 암기 완수"
          value={`${agg.recitationComplete}건`}
          sub=""
        />
        <Stat
          label="활동 기간"
          value={
            agg.firstActivityAt && agg.lastActivityAt
              ? `${agg.firstActivityAt.slice(0, 10)} ~ ${agg.lastActivityAt.slice(0, 10)}`
              : "—"
          }
          sub=""
        />
      </div>

      {agg.subjectTopAttempts.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground mb-1">
            과목별 풀이 (상위 5)
          </p>
          <div className="flex flex-wrap gap-1">
            {agg.subjectTopAttempts.map((s) => (
              <span
                key={s.lawCode ?? "(미지정)"}
                className="rounded-md border bg-background px-2 py-0.5 text-[10px] tabular-nums"
              >
                {s.lawCode ?? "(미지정)"}: {s.attempts}회
                {s.correctRatio !== null
                  ? ` · ${Math.round(s.correctRatio * 100)}%`
                  : ""}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border bg-background px-2 py-1.5">
      <div className="text-[9px] font-semibold tracking-wide uppercase text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
      {sub ? (
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function StatsSection({ stats }: { stats: PasserAggregateStats }) {
  return (
    <Card className="mb-5 border-violet-200">
      <CardHeader className="px-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">합격자 분포 통계 (Phase B)</p>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            분석 동의 표본 N={stats.sampleSize} · 전체 합격 {stats.totalPasserCount}
          </span>
        </div>
        <p className="text-muted-foreground text-[11px]">
          분석 동의 합격자만 표본에 포함. 표본이 적을 땐 통계량보다 추세를 참고
          하세요.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <HistCard
            title="자가 신고 점수 분포"
            hint="합격자가 입력한 자가 점수"
            hist={stats.scoreHist}
            unit="점"
          />
          <HistCard
            title="학습 시간 분포 (응시 전년+해당년)"
            hint="study_sessions 누적 시간"
            hist={stats.studyTimeHist}
            unit="h"
          />
          <HistCard
            title="문제 풀이 정답률 분포"
            hint="user_problem_attempts 기준"
            hist={stats.accuracyHist}
            unit="%"
          />
          <HistCard
            title="총 풀이 회수 분포"
            hint="user_problem_attempts 누적"
            hist={stats.problemAttemptsHist}
            unit="회"
          />
          <HistCard
            title="활동 일수 분포"
            hint="study_sessions 활동 일자"
            hist={stats.activeDaysHist}
            unit="일"
          />
          <HistCard
            title="최장 연속 학습 분포"
            hint="응시 기간 내 streak"
            hist={stats.longestStreakHist}
            unit="일"
          />
        </div>
        {stats.subjectAverages.length > 0 ? (
          <div>
            <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground mt-2 mb-1">
              과목별 평균 풀이 (1+회 푼 합격자 기준)
            </p>
            <SubjectAveragesBars items={stats.subjectAverages} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HistCard({
  title,
  hint,
  hist,
  unit,
}: {
  title: string;
  hint?: string;
  hist: Histogram;
  unit: string;
}) {
  const maxCount = Math.max(1, ...hist.buckets.map((b) => b.count));
  const fmt = (v: number | null) =>
    v === null ? "—" : v >= 100 ? Math.round(v).toString() : v.toFixed(1);
  return (
    <div className="rounded border bg-background p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-semibold">{title}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          N={hist.n}
        </div>
      </div>
      {hint ? (
        <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
      ) : null}
      <div className="mt-2 space-y-1">
        {hist.buckets.map((b) => {
          const pct = (b.count / maxCount) * 100;
          return (
            <div key={b.label} className="flex items-center gap-1.5">
              <div className="w-16 text-[10px] tabular-nums text-muted-foreground">
                {b.label}
              </div>
              <div className="bg-muted/40 relative h-3 flex-1 overflow-hidden rounded">
                <div
                  className="absolute inset-y-0 left-0 bg-violet-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-6 text-right text-[10px] font-semibold tabular-nums">
                {b.count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] tabular-nums">
        <div className="rounded bg-muted/30 px-1.5 py-0.5">
          <span className="text-muted-foreground">중간값 </span>
          <span className="font-semibold">
            {fmt(hist.median)}
            {unit}
          </span>
        </div>
        <div className="rounded bg-muted/30 px-1.5 py-0.5">
          <span className="text-muted-foreground">평균 </span>
          <span className="font-semibold">
            {fmt(hist.mean)}
            {unit}
          </span>
        </div>
        <div className="rounded bg-muted/30 px-1.5 py-0.5">
          <span className="text-muted-foreground">25~75% </span>
          <span className="font-semibold">
            {fmt(hist.p25)}~{fmt(hist.p75)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SubjectAveragesBars({
  items,
}: {
  items: PasserAggregateStats["subjectAverages"];
}) {
  const maxAttempts = Math.max(1, ...items.map((s) => s.avgAttempts));
  return (
    <div className="space-y-1">
      {items.map((s) => {
        const pct = (s.avgAttempts / maxAttempts) * 100;
        return (
          <div key={s.lawCode} className="flex items-center gap-2">
            <div className="w-20 text-[11px] font-semibold">{s.lawCode}</div>
            <div className="bg-muted/40 relative h-4 flex-1 overflow-hidden rounded">
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="w-32 text-right text-[10px] tabular-nums">
              평균 {s.avgAttempts}회 ·{" "}
              {s.avgAccuracyPct !== null ? `${s.avgAccuracyPct}%` : "—"} ·{" "}
              <span className="text-muted-foreground">{s.learners}명</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
