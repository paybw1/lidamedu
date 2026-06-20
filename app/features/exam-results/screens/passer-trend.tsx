// feat-8-012 학습 곡선 12주 비교 차트.
// /study/passer-trend — 학생 누구나 접근(인증 사용자).
// 합격자 평균 곡선 + 본인 현재 곡선 overlay, 3종 지표(학습시간/풀이수/정답률).

import { GraduationCapIcon, LineChartIcon, TrendingUpIcon } from "lucide-react";
import { Link, data, redirect } from "react-router";

import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getPasserTrendData,
  type PasserTrendData,
  type WeeklyTrendPoint,
} from "~/features/exam-results/analytics.server";
import { isPasserBenchmarkEnabled } from "~/features/exam-results/passer-benchmark-gate.server";
import { hasPoolConsent } from "~/features/exam-results/queries.server";
import { EXAM_ROUND_LABEL } from "~/features/exam-results/labels";

import type { Route } from "./+types/passer-trend";

export const meta: Route.MetaFunction = () => [
  { title: "합격자 학습 곡선 비교 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  // 학생 화면 — 합성 합격자 노출 금지 + 게이트 OFF 시 호출 skip.
  // viewer-B 게이트(feat-8-026b) — 전역 게이트 ON + 요청자 풀(B) 동의 동시 충족 시만 비교 노출.
  const gate = await isPasserBenchmarkEnabled();
  const canCompare = gate.enabled && (await hasPoolConsent(client, user.id));
  const trend = canCompare
    ? await getPasserTrendData(user.id, { excludeSynthetic: true })
    : null;
  return { trend };
}

export default function PasserTrend({ loaderData }: Route.ComponentProps) {
  const { trend } = loaderData;

  if (!trend) {
    return (
      <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
        <header className="mb-4 space-y-1">
          <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
            <LineChartIcon className="size-3.5" /> 합격자 곡선 비교
          </p>
          <h1 className="text-2xl font-bold tracking-tight">학습 곡선</h1>
        </header>
        <Card>
          <CardContent className="px-4 py-8 text-center">
            <p className="text-muted-foreground text-sm">
              아직 분석 동의 합격자 표본이 없어 곡선을 표시할 수 없습니다. 합격자가
              모이면 자동으로 활성화됩니다.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-4 space-y-1">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <LineChartIcon className="size-3.5" /> 합격자 곡선 비교
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          합격자 학습 곡선 vs 본인
        </h1>
        <p className="text-muted-foreground text-sm">
          {trend.matchYear}년 {EXAM_ROUND_LABEL[trend.matchRound]} 합격자{" "}
          <strong>{trend.sampleSize}명</strong>이 응시 D-12주~D-0주 동안 매 주
          어떻게 학습했는지를 평균낸 곡선입니다. 본인의 현재 학습이 같은 D-day
          축 어느 지점에 있는지 함께 표시합니다.
        </p>
        {trend.fallbackReason ? (
          <p className="rounded border border-amber-200 bg-amber-50/60 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            ⚠️ {trend.fallbackReason}
          </p>
        ) : null}
        {!trend.hasPlan ? (
          <p className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] text-foreground">
            ℹ️ 차기 응시 계획(연도/차수)을 설정하시면 본인 곡선이 활성화됩니다.
            <Link to="/me/exam-results" className="ml-1 underline">
              설정하러 가기
            </Link>
          </p>
        ) : trend.userCurrentWeek !== null ? (
          <p className="text-muted-foreground text-[11px]">
            본인 현재 위치: <strong>D{trend.userCurrentWeek > 0 ? "+" : ""}
            {trend.userCurrentWeek}주</strong>
          </p>
        ) : null}
      </header>

      <div className="space-y-4">
        <TrendChartCard
          title="주별 학습 시간 (h)"
          subtitle="study_sessions 기준"
          series={trend.studyHours}
          unit="h"
          decimals={1}
          color="var(--primary)"
          currentWeek={trend.userCurrentWeek}
        />
        <TrendChartCard
          title="주별 문제 풀이 (회)"
          subtitle="user_problem_attempts 기준"
          series={trend.problemAttempts}
          unit="회"
          decimals={0}
          color="var(--primary)"
          currentWeek={trend.userCurrentWeek}
        />
        <TrendChartCard
          title="주별 정답률 (%)"
          subtitle="해당 주의 풀이만"
          series={trend.accuracyPct}
          unit="%"
          decimals={0}
          color="var(--primary)"
          currentWeek={trend.userCurrentWeek}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs">
        <Link
          to="/study/passer-summaries"
          className="text-link inline-flex items-center gap-1 underline"
        >
          <GraduationCapIcon className="size-3" /> 합격자 학습 후기 보기
        </Link>
        <Link to="/dashboard" className="text-muted-foreground underline">
          대시보드 →
        </Link>
      </div>
    </div>
  );
}

interface TrendChartCardProps {
  title: string;
  subtitle?: string;
  series: WeeklyTrendPoint[];
  unit: string;
  decimals: number;
  color: string;
  currentWeek: number | null;
}

function TrendChartCard({
  title,
  subtitle,
  series,
  unit,
  decimals,
  color,
  currentWeek,
}: TrendChartCardProps) {
  // 차트 size
  const width = 880;
  const height = 220;
  const padding = { top: 16, right: 20, bottom: 32, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const passerValues = series
    .map((p) => p.passerMean)
    .filter((v): v is number => v !== null);
  const userValues = series
    .map((p) => p.user)
    .filter((v): v is number => v !== null);
  const allValues = [...passerValues, ...userValues];
  if (allValues.length === 0) {
    return (
      <Card>
        <CardHeader className="px-4 pb-2">
          <p className="text-sm font-semibold">{title}</p>
          {subtitle ? (
            <p className="text-muted-foreground text-[11px]">{subtitle}</p>
          ) : null}
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-muted-foreground text-xs">
            데이터가 없습니다.
          </p>
        </CardContent>
      </Card>
    );
  }
  const max = Math.max(...allValues, 1);
  const yMax = max * 1.15;

  const xFor = (weeksToExam: number): number => {
    // weeksToExam: -11 ~ 0
    const minW = series[0].weeksToExam;
    const maxW = series[series.length - 1].weeksToExam;
    const range = maxW - minW || 1;
    return padding.left + ((weeksToExam - minW) / range) * chartW;
  };
  const yFor = (v: number): number => {
    return padding.top + chartH - (v / yMax) * chartH;
  };
  const passerPath = series
    .filter((p) => p.passerMean !== null)
    .map((p, i) => {
      const x = xFor(p.weeksToExam);
      const y = yFor(p.passerMean!);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const userPath = series
    .filter((p) => p.user !== null)
    .map((p, i) => {
      const x = xFor(p.weeksToExam);
      const y = yFor(p.user!);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => (yMax * i) / yTicks);

  return (
    <Card>
      <CardHeader className="px-4 pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-muted-foreground text-[11px]">
            합격자 평균 N={series[0].passerN}
          </p>
        </div>
        {subtitle ? (
          <p className="text-muted-foreground text-[11px]">{subtitle}</p>
        ) : null}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={title}
        >
          {/* Y grid */}
          {yTickValues.map((v, i) => {
            const y = yFor(v);
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray={i === 0 ? "0" : "2 3"}
                />
                <text
                  x={padding.left - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="10"
                  fill="var(--muted-foreground)"
                >
                  {decimals === 0
                    ? Math.round(v).toLocaleString("ko-KR")
                    : v.toFixed(decimals)}
                  {unit}
                </text>
              </g>
            );
          })}

          {/* X labels — 매 주 라벨 */}
          {series.map((p) => {
            const x = xFor(p.weeksToExam);
            return (
              <g key={p.weeksToExam}>
                <line
                  x1={x}
                  x2={x}
                  y1={padding.top + chartH}
                  y2={padding.top + chartH + 4}
                  stroke="var(--border)"
                />
                <text
                  x={x}
                  y={padding.top + chartH + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--muted-foreground)"
                >
                  D{p.weeksToExam === 0 ? "-0" : p.weeksToExam}주
                </text>
              </g>
            );
          })}

          {/* Current week marker — 본인 현재 위치 */}
          {currentWeek !== null && currentWeek >= series[0].weeksToExam && currentWeek <= series[series.length - 1].weeksToExam ? (
            <g>
              <line
                x1={xFor(currentWeek)}
                x2={xFor(currentWeek)}
                y1={padding.top}
                y2={padding.top + chartH}
                stroke="var(--destructive)"
                strokeDasharray="4 3"
                strokeWidth={1}
              />
              <text
                x={xFor(currentWeek)}
                y={padding.top - 4}
                textAnchor="middle"
                fontSize="10"
                fill="var(--destructive)"
                fontWeight={700}
              >
                지금
              </text>
            </g>
          ) : null}

          {/* Passer line */}
          {passerPath ? (
            <path
              d={passerPath}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {/* Passer dots */}
          {series
            .filter((p) => p.passerMean !== null)
            .map((p) => (
              <circle
                key={`passer-${p.weeksToExam}`}
                cx={xFor(p.weeksToExam)}
                cy={yFor(p.passerMean!)}
                r={3}
                fill={color}
              />
            ))}

          {/* User line */}
          {userPath ? (
            <path
              d={userPath}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {series
            .filter((p) => p.user !== null)
            .map((p) => (
              <circle
                key={`user-${p.weeksToExam}`}
                cx={xFor(p.weeksToExam)}
                cy={yFor(p.user!)}
                r={2.5}
                fill="var(--foreground)"
              />
            ))}
        </svg>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px]">
          <Legend swatchColor={color} label={`합격자 평균`} dashed={false} />
          <Legend swatchColor="var(--foreground)" label="본인" dashed />
          {currentWeek !== null ? (
            <Legend swatchColor="var(--destructive)" label="현재 주차" dashed />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({
  swatchColor,
  label,
  dashed,
}: {
  swatchColor: string;
  label: string;
  dashed: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className={cn(
          "inline-block h-[2px] w-4",
          dashed ? "border-t-2 border-dashed" : "",
        )}
        style={{
          background: dashed ? "transparent" : swatchColor,
          borderColor: dashed ? swatchColor : undefined,
        }}
      />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
