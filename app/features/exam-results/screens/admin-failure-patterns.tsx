// feat-8-015 합격자 vs 비합격자 비교 분석.
// /admin/analytics/failure-patterns — admin 전용.
// P4 STATS/ANALYTICS 패턴 — AdminShell cluster="analytics" 래핑.

import {
  AlertTriangleIcon,
  BarChart2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { data, redirect } from "react-router";

import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Bar, Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import {
  computeGroupComparison,
  listFailerCases,
  listPasserCases,
  type GroupBaseline,
  type GroupComparison,
  type MetricDelta,
} from "~/features/exam-results/analytics.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";

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
  if (!roleAtLeast(role, "manager"))
    throw data("관리자 이상 권한이 필요합니다", { status: 403 });

  const [passers, failers] = await Promise.all([
    listPasserCases({ onlyConsented: true }),
    listFailerCases({ onlyConsented: true }),
  ]);
  const comparison = computeGroupComparison(passers, failers);
  return { comparison, role };
}

/* ── 포맷 헬퍼 ────────────────────────────────────────────────────────────── */

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

/* ── 메인 컴포넌트 ────────────────────────────────────────────────────────── */

export default function AdminFailurePatterns({
  loaderData,
}: Route.ComponentProps) {
  const { comparison, role } = loaderData;
  const passerN = comparison.passers.sampleSize;
  const failerN = comparison.failers.sampleSize;
  const topDeltas = comparison.deltas.slice(0, 3);

  return (
    <AdminShell
      cluster="analytics"
      role={role}
      title="합격 vs 비합격 패턴"
      desc="분석 활용 동의한 합격자·비합격자의 학습 로그 평균·중간값 비교. 어떤 지표에서 두 그룹이 크게 갈리는지 시각화합니다."
      headerRight={
        <Chip tone={passerN > 0 && failerN > 0 ? "emerald" : "amber"}>
          <BarChart2Icon className="size-3" />
          합격 N={passerN} · 비합격 N={failerN}
        </Chip>
      }
    >
      {/* 표본 크기 타일 */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SampleTile label="합격자 (분석 동의)" n={passerN} tone="emerald" />
        <SampleTile label="비합격자 (분석 동의)" n={failerN} tone="coral" />
      </div>

      {passerN === 0 || failerN === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 px-4 py-5 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-300">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              {passerN === 0 && failerN === 0
                ? "분석 동의 데이터가 양쪽 모두 없습니다. 결과 입력이 모이면 자동으로 비교가 활성화됩니다."
                : passerN === 0
                  ? "합격자 표본이 없습니다."
                  : "비합격자 표본이 없습니다."}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* 핵심 격차 TOP 3 */}
          <section className="mb-5">
            <p className="text-muted-foreground mb-2 font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">
              두 그룹이 가장 갈리는 지표 (격차 상위 3)
            </p>
            <p className="text-muted-foreground mb-3 text-xs">
              평균 격차가 큰 순서. 학생 컨설팅에서 우선 강조해야 할 지표.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {topDeltas.map((d) => (
                <TopDeltaCard key={d.metric} delta={d} />
              ))}
            </div>
          </section>

          {/* 전체 비교 표 */}
          <section>
            <p className="text-muted-foreground mb-2 font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">
              전체 지표 비교
            </p>
            <IndexTable
              minWidth={680}
              headers={[
                { label: "지표" },
                { label: "합격자 평균", align: "right" },
                { label: "합격자 중간값", align: "right" },
                { label: "비합격자 평균", align: "right" },
                { label: "비합격자 중간값", align: "right" },
                { label: "평균 차이", align: "right" },
                { label: "시각화", width: "140px" },
              ]}
            >
              {comparison.deltas.map((d) => (
                <ComparisonRow
                  key={d.metric}
                  delta={d}
                  passers={comparison.passers}
                  failers={comparison.failers}
                />
              ))}
            </IndexTable>
          </section>

          <p className="text-muted-foreground mt-3 text-[11px]">
            표본이 작을 때는 통계량이 노이즈에 민감합니다. 결과 입력이
            모일수록 정확도가 올라갑니다.
          </p>
        </>
      )}
    </AdminShell>
  );
}

/* ── SampleTile ─────────────────────────────────────────────────────────── */

function SampleTile({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone: "emerald" | "coral";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 shadow-sm",
        tone === "emerald"
          ? "border-emerald-200 bg-emerald-500/10 dark:border-emerald-800 dark:bg-emerald-950/20"
          : "border-rose-200 bg-rose-500/10 dark:border-rose-800 dark:bg-rose-950/20",
      )}
    >
      <p
        className={cn(
          "font-mono text-[10px] font-semibold tracking-[0.08em] uppercase opacity-80",
          tone === "emerald"
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-rose-600 dark:text-rose-400",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-extrabold tabular-nums",
          tone === "emerald"
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-rose-600 dark:text-rose-400",
        )}
      >
        {n.toLocaleString("ko-KR")}
        <span className="ml-1 text-sm font-normal opacity-70">명</span>
      </p>
    </div>
  );
}

/* ── TopDeltaCard ───────────────────────────────────────────────────────── */

function TopDeltaCard({ delta }: { delta: MetricDelta }) {
  const passerAhead = delta.absDelta !== null && delta.absDelta > 0;
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{delta.label}</p>
        <Chip tone={passerAhead ? "emerald" : "coral"}>
          {passerAhead ? (
            <TrendingUpIcon className="size-3" />
          ) : (
            <TrendingDownIcon className="size-3" />
          )}
          {fmtDeltaPct(delta)}
        </Chip>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] tabular-nums">
        <div className="border-border rounded-md border px-2.5 py-1.5">
          <p className="text-muted-foreground text-[9px] font-semibold tracking-wide uppercase">
            합격자 평균
          </p>
          <p className="mt-0.5 font-bold text-emerald-700 dark:text-emerald-300">
            {fmtNum(
              delta.passerMean,
              delta.unit,
              delta.metric === "studyHours" ? 1 : 0,
            )}
          </p>
        </div>
        <div className="border-border rounded-md border px-2.5 py-1.5">
          <p className="text-muted-foreground text-[9px] font-semibold tracking-wide uppercase">
            비합격자 평균
          </p>
          <p className="mt-0.5 font-bold text-rose-600 dark:text-rose-400">
            {fmtNum(
              delta.failerMean,
              delta.unit,
              delta.metric === "studyHours" ? 1 : 0,
            )}
          </p>
        </div>
      </div>
      <p className="text-muted-foreground mt-2 text-[10px]">
        절대 차이{" "}
        <strong className="text-foreground">{fmtDelta(delta)}</strong>
      </p>
    </div>
  );
}

/* ── ComparisonRow ──────────────────────────────────────────────────────── */

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
  const max = Math.max(passerMean ?? 0, failerMean ?? 0);
  const passerPct = passerMean !== null && max > 0 ? (passerMean / max) * 100 : 0;
  const failerPct = failerMean !== null && max > 0 ? (failerMean / max) * 100 : 0;

  return (
    <TR>
      <TD>
        <span className="font-semibold">{delta.label}</span>
      </TD>
      <TD align="right" mono className="text-emerald-700 dark:text-emerald-300">
        {fmtNum(passerMean, delta.unit, decimals)}
      </TD>
      <TD
        align="right"
        mono
        className="text-emerald-700/70 dark:text-emerald-300/70"
      >
        {fmtNum(passerMedian, delta.unit, decimals)}
      </TD>
      <TD align="right" mono className="text-rose-600 dark:text-rose-400">
        {fmtNum(failerMean, delta.unit, decimals)}
      </TD>
      <TD
        align="right"
        mono
        className="text-rose-600/70 dark:text-rose-400/70"
      >
        {fmtNum(failerMedian, delta.unit, decimals)}
      </TD>
      <TD align="right" mono>
        <span className="font-bold">{fmtDelta(delta)}</span>
        <span className="text-muted-foreground ml-1 text-[11px]">
          ({fmtDeltaPct(delta)})
        </span>
      </TD>
      <TD>
        <div className="min-w-[100px] space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-emerald-700 dark:text-emerald-300 w-8">
              합격
            </span>
            <Bar value={passerPct} tone="emerald" className="flex-1" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-rose-600 dark:text-rose-400 w-8">
              비합격
            </span>
            <Bar value={failerPct} tone="coral" className="flex-1" />
          </div>
        </div>
      </TD>
    </TR>
  );
}
