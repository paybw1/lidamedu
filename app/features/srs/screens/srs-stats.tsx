// SRS v2 ④ — /srs/stats 통계 화면.
// retention · byDay(30일) · forecast(7일) · CSV 다운로드.

import type { Route } from "./+types/srs-stats";

import {
  ArrowRightIcon,
  CalendarClockIcon,
  DownloadIcon,
  LayersIcon,
  RepeatIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStats } from "~/features/srs/srs.server";
import { StudyMgmtTabs } from "~/features/study/components/study-mgmt-tabs";

export const meta: Route.MetaFunction = () => [
  { title: "카드 암기 통계 | 리담" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login?next=/srs/stats");
  const stats = await getStats(client, user.id);
  return stats;
}

export default function SrsStats({ loaderData }: Route.ComponentProps) {
  const { totalItems, totalReviewed, totalSuccess, retentionPct, byDay, forecast7d } =
    loaderData;
  const recent7Reviewed = byDay.slice(-7).reduce((s, d) => s + d.reviewed, 0);

  return (
    <>
      <StudyMgmtTabs />
    <div className="mx-auto w-full max-w-screen-lg px-4 py-8 md:py-12">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <p className="text-primary inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            <TrendingUpIcon className="size-3" /> 카드 암기 · 통계
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
            카드 암기 진척도
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href="/api/srs/export" download>
              <DownloadIcon className="size-3.5" /> CSV
            </a>
          </Button>
          <Button asChild size="sm">
            <Link to="/srs">
              카드 암기 시작 <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {/* KPI */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kpi
          icon={<LayersIcon className="size-3" />}
          label="총 카드"
          value={totalItems}
          tone="neutral"
        />
        <Kpi
          icon={<RepeatIcon className="size-3" />}
          label="누적 복습"
          value={totalReviewed}
          tone="sky"
          hint={`최근 7일 ${recent7Reviewed}회`}
        />
        <Kpi
          icon={<TrendingUpIcon className="size-3" />}
          label="기억 유지율"
          value={`${retentionPct}%`}
          tone={retentionPct >= 80 ? "emerald" : retentionPct >= 60 ? "amber" : "rose"}
          hint={`정답 ${totalSuccess}회 / 전체 ${totalReviewed}회`}
        />
        <Kpi
          icon={<CalendarClockIcon className="size-3" />}
          label="오늘 복습"
          value={forecast7d[0]?.dueCount ?? 0}
          tone={forecast7d[0]?.dueCount ? "rose" : "neutral"}
        />
      </div>

      {/* 일별 30일 — reviewed (회색) + success (에메랄드) */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <h2 className="text-foreground text-sm font-bold">
            최근 30일 복습량
          </h2>
          <p className="text-muted-foreground text-xs">
            회색 = 전체 복습, 초록 = 잘 떠올린 카드(보통·쉬웠음).
          </p>
        </CardHeader>
        <CardContent className="pb-4">
          <DayBars items={byDay} />
        </CardContent>
      </Card>

      {/* 향후 7일 due 예측 */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-foreground text-sm font-bold">
            향후 7일 복습 예정
          </h2>
          <p className="text-muted-foreground text-xs">
            날짜별로 복습이 잡혀 있는 카드 수. 하루에 몰리지 않는지 확인하세요.
          </p>
        </CardHeader>
        <CardContent className="pb-4">
          <ForecastBars items={forecast7d} />
        </CardContent>
      </Card>
    </div>
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "neutral" | "sky" | "emerald" | "amber" | "rose";
  hint?: string;
}) {
  const cls =
    tone === "rose"
      ? "border-rose-300/60 bg-rose-50/60 text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300"
      : tone === "amber"
        ? "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300"
        : tone === "emerald"
          ? "border-emerald-300/60 bg-emerald-50/60 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-300"
          : tone === "sky"
            ? "border-sky-300/60 bg-sky-50/60 text-sky-700 dark:border-sky-700/40 dark:bg-sky-950/30 dark:text-sky-300"
            : "border-border bg-card text-muted-foreground";
  return (
    <div className={cn("rounded-xl border p-3.5 shadow-sm", cls)}>
      <p className="inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        {icon} {label}
      </p>
      <p className="text-foreground mt-1.5 text-[20px] leading-none font-extrabold tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground mt-1 text-[10px]">{hint}</p>
      ) : null}
    </div>
  );
}

function DayBars({
  items,
}: {
  items: Array<{ date: string; reviewed: number; success: number }>;
}) {
  const max = items.reduce((m, d) => Math.max(m, d.reviewed), 0) || 1;
  return (
    <div>
      <div className="flex items-end gap-[2px]">
        {items.map((d) => {
          const totalPct = (d.reviewed / max) * 100;
          const succPct = (d.success / max) * 100;
          return (
            <div
              key={d.date}
              title={`${d.date} · 복습 ${d.reviewed}회 · 잘 떠올림 ${d.success}회`}
              className="bg-muted relative h-20 flex-1 rounded-sm"
            >
              <div
                className="bg-muted-foreground/40 absolute right-0 bottom-0 left-0 rounded-sm"
                style={{ height: `${Math.max(totalPct, 1)}%` }}
              />
              <div
                className="absolute right-0 bottom-0 left-0 rounded-sm bg-emerald-500"
                style={{ height: `${Math.max(succPct, 0)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="text-muted-foreground mt-1 flex items-center justify-between text-[10px] tabular-nums">
        <span>{items[0]?.date}</span>
        <span>{items[items.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function ForecastBars({
  items,
}: {
  items: Array<{ date: string; dueCount: number }>;
}) {
  const max = items.reduce((m, d) => Math.max(m, d.dueCount), 0) || 1;
  return (
    <ul className="space-y-1.5">
      {items.map((d) => (
        <li key={d.date} className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground w-20 shrink-0 font-mono tabular-nums">
            {d.date}
          </span>
          <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full",
                d.dueCount === 0
                  ? "bg-muted-foreground/20"
                  : d.dueCount >= max * 0.7
                    ? "bg-rose-500"
                    : "bg-amber-500",
              )}
              style={{ width: `${(d.dueCount / max) * 100}%` }}
            />
          </div>
          <span className="text-foreground w-10 text-right font-mono text-[11px] font-bold tabular-nums">
            {d.dueCount}
          </span>
        </li>
      ))}
    </ul>
  );
}
