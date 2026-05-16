// feat-8-015 합격자 vs 비합격자 비교 분석.
// /admin/analytics/failure-patterns — admin 전용.
// 두 그룹 평균/중간값 + 격차 큰 metric top 3 인사이트 카드.

import {
  AlertTriangleIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { data, Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  computeGroupComparison,
  listFailerCases,
  listPasserCases,
  type GroupBaseline,
  type GroupComparison,
  type MetricDelta,
} from "~/features/exam-results/analytics.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-failure-patterns";

export const meta: Route.MetaFunction = () => [
  { title: "합격 vs 비합격 패턴 | Lidam Patent Attorney Academy" },
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

  const [passers, failers] = await Promise.all([
    listPasserCases({ onlyConsented: true }),
    listFailerCases({ onlyConsented: true }),
  ]);
  const comparison = computeGroupComparison(passers, failers);
  return { comparison };
}

function fmtNum(v: number | null, unit: string, decimals = 0): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (decimals === 0) {
    return `${Math.round(v).toLocaleString("ko-KR")}${unit}`;
  }
  return `${v.toFixed(decimals)}${unit}`;
}

function fmtDelta(d: MetricDelta): string {
  if (d.absDelta === null) return "—";
  const decimals = d.metric === "studyHours" ? 1 : 0;
  const sign = d.absDelta >= 0 ? "+" : "";
  return `${sign}${decimals === 0 ? Math.round(d.absDelta).toLocaleString("ko-KR") : d.absDelta.toFixed(decimals)}${d.unit}`;
}

function fmtDeltaPct(d: MetricDelta): string {
  if (d.relDeltaPct === null) return "—";
  const sign = d.relDeltaPct >= 0 ? "+" : "";
  return `${sign}${Math.round(d.relDeltaPct)}%`;
}

export default function AdminFailurePatterns({
  loaderData,
}: Route.ComponentProps) {
  const { comparison } = loaderData;
  const passerN = comparison.passers.sampleSize;
  const failerN = comparison.failers.sampleSize;
  const topDeltas = comparison.deltas.slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-5 space-y-1">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <TrendingDownIcon className="size-3.5" /> 운영자 · 합격 vs 비합격 패턴
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          합격자 vs 비합격자 비교
        </h1>
        <p className="text-muted-foreground text-sm">
          분석 활용 동의한 합격자 / 비합격자의 학습 로그 평균·중간값 비교.
          어떤 지표에서 두 그룹이 크게 갈리는지 시각화합니다.
        </p>
      </header>

      {/* 표본 크기 */}
      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SampleStat
          label="합격자 (분석 동의)"
          n={passerN}
          tone="emerald"
        />
        <SampleStat label="비합격자 (분석 동의)" n={failerN} tone="rose" />
      </div>

      {passerN === 0 || failerN === 0 ? (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="px-4 py-4 text-sm text-amber-900">
            {passerN === 0 && failerN === 0
              ? "분석 동의 데이터가 양쪽 모두 없습니다. 결과 입력이 모이면 자동으로 비교가 활성화됩니다."
              : passerN === 0
                ? "합격자 표본이 없습니다."
                : "비합격자 표본이 없습니다."}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 핵심 격차 top 3 */}
          <Card className="mb-5 border-violet-200">
            <CardHeader className="px-4 pb-2">
              <p className="text-sm font-semibold">
                🔍 두 그룹이 가장 갈리는 지표
              </p>
              <p className="text-muted-foreground text-[11px]">
                평균 격차가 큰 순서. 학생 컨설팅에서 우선 강조해야 할 지표.
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {topDeltas.map((d) => (
                  <TopDeltaCard key={d.metric} delta={d} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 전체 비교 표 */}
          <Card>
            <CardHeader className="px-4 pb-2">
              <p className="text-sm font-semibold">전체 지표 비교</p>
            </CardHeader>
            <CardContent className="px-0 pb-3">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-4 py-2 text-left">지표</th>
                    <th className="px-2 py-2 text-right">합격자 평균</th>
                    <th className="px-2 py-2 text-right">합격자 중간값</th>
                    <th className="px-2 py-2 text-right">비합격자 평균</th>
                    <th className="px-2 py-2 text-right">비합격자 중간값</th>
                    <th className="px-2 py-2 text-right">평균 차이</th>
                    <th className="px-4 py-2 text-right">시각화</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.deltas.map((d) => (
                    <ComparisonRow
                      key={d.metric}
                      delta={d}
                      passers={comparison.passers}
                      failers={comparison.failers}
                    />
                  ))}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>

          <p className="text-muted-foreground mt-3 text-[11px]">
            ⚠️ 표본이 작을 때는 통계량이 노이즈에 민감합니다. 결과 입력이
            모일수록 정확도가 올라갑니다.
          </p>
        </>
      )}
    </div>
  );
}

function SampleStat({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone: "emerald" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : "bg-rose-50 text-rose-800 border-rose-200";
  return (
    <div className={cn("rounded-md border px-4 py-3", toneClass)}>
      <div className="text-[10px] font-semibold tracking-wide uppercase opacity-80">
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">
        {n.toLocaleString("ko-KR")}
        <span className="ml-1 text-xs font-normal opacity-70">명</span>
      </div>
    </div>
  );
}

function TopDeltaCard({ delta }: { delta: MetricDelta }) {
  const passerAhead = delta.absDelta !== null && delta.absDelta > 0;
  return (
    <div className="rounded-md border bg-violet-50/30 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-semibold">{delta.label}</div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            passerAhead
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200",
          )}
        >
          {fmtDeltaPct(delta)}
        </Badge>
      </div>
      <div className="text-muted-foreground mt-2 grid grid-cols-2 gap-1 text-[11px] tabular-nums">
        <div>
          <span>합격: </span>
          <span className="font-bold text-emerald-700">
            {fmtNum(delta.passerMean, delta.unit, delta.metric === "studyHours" ? 1 : 0)}
          </span>
        </div>
        <div>
          <span>비합격: </span>
          <span className="font-bold text-rose-700">
            {fmtNum(delta.failerMean, delta.unit, delta.metric === "studyHours" ? 1 : 0)}
          </span>
        </div>
      </div>
      <div className="text-muted-foreground mt-1 text-[10px]">
        절대 차이 <strong>{fmtDelta(delta)}</strong>
      </div>
    </div>
  );
}

function ComparisonRow({
  delta,
  passers,
  failers,
}: {
  delta: MetricDelta;
  passers: GroupBaseline;
  failers: GroupBaseline;
}) {
  const decimals = delta.metric === "studyHours" ? 1 : 0;

  function getMedian(b: GroupBaseline): number | null {
    switch (delta.metric) {
      case "studyHours":
        return b.studyHoursMedian;
      case "problemAttempts":
        return b.problemAttemptsMedian;
      case "accuracyPct":
        return b.accuracyPctMedian;
      case "activeDays":
        return b.activeDaysMedian;
      case "longestStreak":
        return b.longestStreakMedian;
    }
  }

  const passerMedian = getMedian(passers);
  const failerMedian = getMedian(failers);

  const passerMean = delta.passerMean;
  const failerMean = delta.failerMean;
  // 두 그룹 평균 max — 막대 비율
  const max = Math.max(passerMean ?? 0, failerMean ?? 0);
  const passerPct = passerMean !== null && max > 0 ? (passerMean / max) * 100 : 0;
  const failerPct = failerMean !== null && max > 0 ? (failerMean / max) * 100 : 0;

  return (
    <tr className="border-b">
      <td className="px-4 py-2 font-semibold">{delta.label}</td>
      <td className="px-2 py-2 text-right tabular-nums text-emerald-700">
        {fmtNum(passerMean, delta.unit, decimals)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-emerald-700/70">
        {fmtNum(passerMedian, delta.unit, decimals)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-rose-700">
        {fmtNum(failerMean, delta.unit, decimals)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-rose-700/70">
        {fmtNum(failerMedian, delta.unit, decimals)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums font-bold">
        {fmtDelta(delta)}{" "}
        <span className="text-muted-foreground text-[10px]">({fmtDeltaPct(delta)})</span>
      </td>
      <td className="px-4 py-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="w-8 text-[9px] text-emerald-700">합격</span>
            <div className="bg-muted/30 relative h-3 flex-1 overflow-hidden rounded">
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500"
                style={{ width: `${passerPct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-8 text-[9px] text-rose-700">비합격</span>
            <div className="bg-muted/30 relative h-3 flex-1 overflow-hidden rounded">
              <div
                className="absolute inset-y-0 left-0 bg-rose-500"
                style={{ width: `${failerPct}%` }}
              />
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}
