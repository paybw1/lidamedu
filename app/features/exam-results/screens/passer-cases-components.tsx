// 로컬 서브컴포넌트 — admin-passer-cases.tsx 에서 분리.
// StatsSection · HistCard · SubjectAveragesBars · PasserAggView · MiniStat.

import { Link } from "react-router";

import { cn } from "~/core/lib/utils";
import { Bar } from "~/features/admin/components/admin-ui";
import type {
  Histogram,
  PasserAggregateStats,
  PasserCase,
} from "~/features/exam-results/analytics.server";

/* ── MiniStat ────────────────────────────────────────────────────────────── */

export function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border-border bg-background rounded-lg border px-2.5 py-2">
      <p className="text-muted-foreground font-mono text-[9px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold tabular-nums">{value}</p>
      {sub ? (
        <p className="text-muted-foreground text-[10px] tabular-nums">{sub}</p>
      ) : null}
    </div>
  );
}

/* ── PasserAggView ──────────────────────────────────────────────────────── */

function formatHours(ms: number): string {
  if (ms <= 0) return "0";
  const h = ms / 3_600_000;
  return h >= 10 ? Math.round(h).toString() : h.toFixed(1);
}

export function PasserAggView({
  agg,
}: {
  agg: NonNullable<PasserCase["aggregates"]>;
}) {
  const acc = agg.accuracyPct;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MiniStat
          label="문제 풀이"
          value={`${agg.totalProblemAttempts.toLocaleString("ko-KR")}회`}
          sub={`${agg.distinctProblems}문항`}
        />
        <MiniStat
          label="정답률"
          value={acc !== null ? `${acc}%` : "—"}
          sub={agg.totalProblemAttempts > 0 ? `${agg.totalProblemAttempts}회` : ""}
        />
        <MiniStat
          label="학습 시간"
          value={`${formatHours(agg.totalStudyTimeMs)}h`}
          sub={`${agg.activeDays}일 활동`}
        />
        <MiniStat
          label="최장 연속"
          value={`${agg.longestStreakDays}일`}
          sub="응시 기간 내"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat
          label="빈칸"
          value={`${agg.blanksCorrect}/${agg.blanksTotal}`}
          sub={
            agg.blanksTotal > 0
              ? `${Math.round((agg.blanksCorrect / agg.blanksTotal) * 100)}%`
              : ""
          }
        />
        <MiniStat label="조문 암기 완수" value={`${agg.recitationComplete}건`} sub="" />
        <MiniStat
          label="활동 기간"
          value={
            agg.firstActivityAt && agg.lastActivityAt
              ? `${agg.firstActivityAt.slice(0, 10)} ~`
              : "—"
          }
          sub={agg.lastActivityAt?.slice(0, 10)}
        />
      </div>

      {agg.subjectTopAttempts.length > 0 ? (
        <div>
          <p className="text-muted-foreground mb-1 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase">
            과목별 풀이 (상위 5)
          </p>
          <div className="flex flex-wrap gap-1">
            {agg.subjectTopAttempts.map((s) => (
              <span
                key={s.lawCode ?? "(미지정)"}
                className="border-border bg-background rounded-md border px-2 py-0.5 text-[10px] tabular-nums"
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

/* ── HistCard ───────────────────────────────────────────────────────────── */

export function HistCard({
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
    <div className="border-border bg-background rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold">{title}</p>
        <span className="text-muted-foreground text-[10px] tabular-nums">
          N={hist.n}
        </span>
      </div>
      {hint ? (
        <p className="text-muted-foreground mt-0.5 text-[10px]">{hint}</p>
      ) : null}
      <div className="mt-2 space-y-1">
        {hist.buckets.map((b) => {
          const pct = (b.count / maxCount) * 100;
          return (
            <div key={b.label} className="flex items-center gap-1.5">
              <span className="text-muted-foreground w-16 text-[10px] tabular-nums">
                {b.label}
              </span>
              <div className="bg-muted/40 relative h-3 flex-1 overflow-hidden rounded">
                <div
                  className="absolute inset-y-0 left-0 bg-violet-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-6 text-right text-[10px] font-semibold tabular-nums">
                {b.count}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] tabular-nums">
        <div className="bg-muted/30 rounded px-1.5 py-0.5">
          <span className="text-muted-foreground">중간값 </span>
          <span className="font-semibold">
            {fmt(hist.median)}
            {unit}
          </span>
        </div>
        <div className="bg-muted/30 rounded px-1.5 py-0.5">
          <span className="text-muted-foreground">평균 </span>
          <span className="font-semibold">
            {fmt(hist.mean)}
            {unit}
          </span>
        </div>
        <div className="bg-muted/30 rounded px-1.5 py-0.5">
          <span className="text-muted-foreground">25~75% </span>
          <span className="font-semibold">
            {fmt(hist.p25)}~{fmt(hist.p75)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── SubjectAveragesBars ───────────────────────────────────────────────── */

function SubjectAveragesBars({
  items,
}: {
  items: PasserAggregateStats["subjectAverages"];
}) {
  const maxAttempts = Math.max(1, ...items.map((s) => s.avgAttempts));
  return (
    <div className="space-y-1.5">
      {items.map((s) => {
        const pct = (s.avgAttempts / maxAttempts) * 100;
        return (
          <div key={s.lawCode} className="flex items-center gap-2">
            <span className="w-20 text-[11px] font-semibold">{s.lawCode}</span>
            <Bar value={pct} tone="emerald" className="flex-1" />
            <span className="text-muted-foreground w-36 text-right text-[10px] tabular-nums">
              평균 {s.avgAttempts}회 ·{" "}
              {s.avgAccuracyPct !== null ? `${s.avgAccuracyPct}%` : "—"} ·{" "}
              {s.learners}명
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── StatsSection ────────────────────────────────────────────────────────── */

export function StatsSection({ stats }: { stats: PasserAggregateStats }) {
  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-violet-200 bg-card shadow-sm dark:border-violet-800">
      <div className="border-border/60 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">합격자 분포 통계 (Phase B)</p>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            분석 동의 표본 N={stats.sampleSize} · 전체 합격{" "}
            {stats.totalPasserCount}
          </span>
        </div>
        <p className="text-muted-foreground text-[11px]">
          분석 동의 합격자만 표본에 포함. 표본이 적을 땐 통계량보다 추세를
          참고하세요.
        </p>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <HistCard
            title="자가 신고 점수 분포"
            hint="합격자가 입력한 자가 점수"
            hist={stats.scoreHist}
            unit="점"
          />
          <HistCard
            title="학습 시간 분포"
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
            <p className="text-muted-foreground mb-1.5 mt-2 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
              과목별 평균 풀이 (1+회 푼 합격자 기준)
            </p>
            <SubjectAveragesBars items={stats.subjectAverages} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── EmptyPasserBanner ───────────────────────────────────────────────────── */

export function EmptyConsentBanner() {
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/40 px-4 py-4 dark:border-amber-800 dark:bg-amber-950/20">
      <p className="text-sm text-amber-900 dark:text-amber-300">
        분석 동의 합격자가 아직 없어 통계 시각화를 표시할 수 없습니다.
        합격자가{" "}
        <Link to="/me/exam-results" className="underline">
          분석 동의
        </Link>
        를 체크해야 학습 로그 분포가 집계됩니다.
      </p>
    </div>
  );
}
