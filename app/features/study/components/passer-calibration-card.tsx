// 합격자 실측 기반 권장 진도 보정 (feat-8-019) — goals 에서 이관(통폐합 3a).
import { TrendingUpIcon } from "lucide-react";

import { Surface } from "~/core/components/student";
import { Badge } from "~/core/components/ui/badge";
import { cn } from "~/core/lib/utils";
import type { PasserBenchmark } from "~/features/exam-results/analytics.server";

export function PasserCalibrationCard({
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
      ? Math.round(
          ((calibratedDailyHours - dailyHourTarget) /
            Math.max(0.1, dailyHourTarget)) *
            100,
        )
      : null;

  return (
    <section className="space-y-3" data-testid="passer-calibration">
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <TrendingUpIcon className="size-4" />
        합격자 실측 기반 보정
        <Badge variant="outline" className="ml-2 text-[10px]">
          표본 {benchmark.sampleSize}
        </Badge>
      </p>
      <Surface pad={0} className="space-y-3 px-4 py-3">
        {benchmark.fallbackReason ? (
          <p className="rounded border border-amber-200 bg-amber-50/60 px-2 py-1 text-[11px] text-amber-900">
            ⚠️ {benchmark.fallbackReason}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <MetricRow
            label="누적 학습 시간"
            user={userHours !== null ? `${Math.round(userHours)}h` : "—"}
            passer={passerHours !== null ? `${Math.round(passerHours)}h` : "—"}
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
            user={userAccuracy !== null ? `${Math.round(userAccuracy)}%` : "—"}
            passer={
              passerAccuracy !== null ? `${Math.round(passerAccuracy)}%` : "—"
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
                ? "border border-rose-200 bg-rose-50 text-rose-900"
                : "border border-emerald-200 bg-emerald-50 text-emerald-900",
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
              {passerHours !== null ? `${Math.round(passerHours)}h` : "—"}) 까지
              따라잡으려면 매일{" "}
              <strong className="tabular-nums">
                {calibratedDailyHours.toFixed(1)}h
              </strong>{" "}
              학습 필요.{" "}
              {targetGapPct !== null && targetGapPct !== 0 ? (
                <span>
                  현재 목표({dailyHourTarget}h){" "}
                  <strong>
                    {Math.abs(targetGapPct)}%{" "}
                    {targetGapPct > 0 ? "더 늘려" : "여유 있음"}
                  </strong>
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </Surface>
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
    <div className="bg-muted/20 rounded-md border p-2">
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
