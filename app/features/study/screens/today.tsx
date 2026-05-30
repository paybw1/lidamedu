// feat-2-009 오늘의 학습 메뉴 — /study/today.
// 5 슬롯 자동 추천 (약점 문제 · 약점 조문 · 미열람 판례 · 빈칸 · 진도 보충).
// 같은 user+KST 날짜는 1회 고정 픽 — 학습 중간에 추천이 바뀌지 않음.

import type { Route } from "./+types/today";

import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarIcon,
  ClockIcon,
  GraduationCapIcon,
  PencilLineIcon,
  RepeatIcon,
  ScaleIcon,
  SettingsIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, data, redirect, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { cn } from "~/core/lib/utils";
import {
  getOrComposeDailyMenu,
  kstToday,
  markDailyMenuViewed,
} from "~/features/study/daily-menu.server";
import {
  type DailyMenuItem,
  type DailyMenuKind,
  type DailyMenuPriority,
  ALL_DAILY_MENU_KINDS,
  KIND_LABEL,
  parseRecommendationPrefs,
  totalEstimatedMinutes,
} from "~/features/study/lib/daily-menu";
import {
  type RecommendationCompletionSummary,
  analyzeRecommendationCompletion,
} from "~/features/study/recommendation-analytics.server";

export const meta: Route.MetaFunction = () => [
  { title: "오늘의 학습 메뉴 | Lidam" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login?next=/study/today");

  const today = kstToday();
  const [items, completion, profile] = await Promise.all([
    getOrComposeDailyMenu(client, user.id, today),
    analyzeRecommendationCompletion(client, user.id, 14),
    client
      .from("profiles")
      .select("recommendation_prefs")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);
  const prefs = parseRecommendationPrefs(profile.data?.recommendation_prefs);

  // 응답 후 viewed_at 마킹 — analytics 용.
  runAfterResponse(markDailyMenuViewed(client, user.id, today));

  return { items, today, completion, prefs };
}

const KIND_ICON: Record<DailyMenuKind, typeof TargetIcon> = {
  weak_problem: TargetIcon,
  weak_article: BookOpenIcon,
  unread_case: ScaleIcon,
  blank_due: PencilLineIcon,
  gap_problems: SparklesIcon,
  cohort_track: GraduationCapIcon,
  article_review: RepeatIcon,
};

const PRIORITY_TONE: Record<
  DailyMenuPriority,
  { bg: string; text: string; label: string }
> = {
  high: {
    bg: "bg-rose-50 dark:bg-rose-950/30",
    text: "text-rose-700 dark:text-rose-300",
    label: "우선",
  },
  medium: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    label: "권장",
  },
  low: {
    bg: "bg-sky-50 dark:bg-sky-950/30",
    text: "text-sky-700 dark:text-sky-300",
    label: "추가",
  },
};

function formatKstDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const date = new Date(Date.UTC(y, m - 1, d));
  const w = weekdays[date.getUTCDay()];
  return `${y}년 ${m}월 ${d}일 (${w})`;
}

export default function StudyToday({ loaderData }: Route.ComponentProps) {
  const { items, today, completion, prefs } = loaderData;
  const totalMin = totalEstimatedMinutes(items);
  const [showSettings, setShowSettings] = useState(false);
  const disabledCount = ALL_DAILY_MENU_KINDS.filter((k) => !prefs[k]).length;

  return (
    <div className="mx-auto w-full max-w-screen-md px-4 py-8 md:px-6 md:py-12">
      {/* 헤더 */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-primary inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              <CalendarIcon className="size-3" />
              {formatKstDate(today)}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
              오늘의 학습 메뉴
            </h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSettings((v) => !v)}
            aria-pressed={showSettings}
          >
            <SettingsIcon className="size-3.5" />
            추천 설정
            {disabledCount > 0 ? (
              <span className="bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5 ml-1">
                {disabledCount}
              </span>
            ) : null}
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          본인 약점·미열람·진도 데이터를 합성한 오늘의 추천 {items.length}개.
          예상 학습 시간 {totalMin}분. 같은 날 새로고침해도 추천은 고정.
        </p>
      </div>

      {/* feat-2-021 추천 슬롯 ON/OFF */}
      {showSettings ? <RecommendationPrefsPanel prefs={prefs} /> : null}

      {/* 빈 상태 */}
      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground space-y-3 py-10 text-center">
            <SparklesIcon className="mx-auto size-8 opacity-30" />
            <p className="text-sm font-medium">
              오늘 추천할 항목이 없습니다.
            </p>
            <p className="text-xs">
              아직 학습 데이터가 부족하거나, 모든 추천 슬롯의 후보가 비어
              있습니다. 과목 학습 화면에서 직접 시작해 보세요.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/subjects/patent">특허법 시작</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/study/stats">학습 통계</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <DailyMenuCard key={`${item.kind}-${i}`} item={item} />
          ))}
        </div>
      )}

      {/* 지난 14일 실행률 */}
      {completion.daysAnalyzed > 0 ? (
        <CompletionSummaryCard summary={completion} />
      ) : null}

      {/* 하단 진입점 */}
      <div className="text-muted-foreground mt-8 flex flex-wrap items-center justify-center gap-2 text-xs">
        <Link to="/study/stats" className="hover:text-foreground underline">
          학습 통계
        </Link>
        <span aria-hidden>·</span>
        <Link to="/goals" className="hover:text-foreground underline">
          학습 목표
        </Link>
        <span aria-hidden>·</span>
        <Link to="/assignments" className="hover:text-foreground underline">
          과제함
        </Link>
      </div>
    </div>
  );
}

function RecommendationPrefsPanel({
  prefs,
}: {
  prefs: Record<DailyMenuKind, boolean>;
}) {
  return (
    <Card className="mb-6 border-primary/40">
      <CardHeader className="pb-2">
        <p className="text-foreground text-sm font-bold">추천 슬롯 ON/OFF</p>
        <p className="text-muted-foreground text-xs">
          비활성한 슬롯은 다음 KST 자정 이후 새 스냅샷부터 적용. 오늘 추천 카드는
          그대로 유지됩니다.
        </p>
      </CardHeader>
      <CardContent className="grid gap-2 pb-4 sm:grid-cols-2">
        {ALL_DAILY_MENU_KINDS.map((kind) => (
          <PrefRow key={kind} kind={kind} enabled={prefs[kind]} />
        ))}
      </CardContent>
    </Card>
  );
}

function PrefRow({
  kind,
  enabled,
}: {
  kind: DailyMenuKind;
  enabled: boolean;
}) {
  const fetcher = useFetcher();
  const optimistic =
    fetcher.formData && fetcher.formData.get("kind") === kind
      ? fetcher.formData.get("enabled") === "true"
      : enabled;
  return (
    <fetcher.Form
      method="post"
      action="/api/study/recommendation-prefs"
      className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="enabled" value={optimistic ? "false" : "true"} />
      <span
        className={cn(
          "text-sm font-medium",
          optimistic ? "text-foreground" : "text-muted-foreground line-through",
        )}
      >
        {KIND_LABEL[kind]}
      </span>
      <button
        type="submit"
        aria-pressed={optimistic}
        className={cn(
          "inline-flex h-5 w-9 items-center rounded-full transition-colors",
          optimistic ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-4 transform rounded-full bg-white shadow transition-transform",
            optimistic ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </fetcher.Form>
  );
}

function CompletionSummaryCard({
  summary,
}: {
  summary: RecommendationCompletionSummary;
}) {
  const ratePct = Math.round(summary.overallRate * 100);
  const tone =
    ratePct >= 70
      ? "text-emerald-700 dark:text-emerald-300"
      : ratePct >= 40
        ? "text-amber-700 dark:text-amber-300"
        : "text-rose-700 dark:text-rose-300";
  return (
    <Card className="mt-8">
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between">
          <p className="text-foreground text-sm font-bold">
            지난 {summary.daysAnalyzed}일 실행률
          </p>
          <p className={cn("text-2xl font-extrabold tabular-nums", tone)}>
            {ratePct}%
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          추천 {summary.totalItems}건 중 {summary.totalCompleted}건 완수.
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        {/* 슬롯별 막대 */}
        <div className="space-y-2">
          {summary.byKind.map((k) => {
            const pct = Math.round(k.rate * 100);
            return (
              <div key={k.kind} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-[88px] shrink-0">
                  {KIND_LABEL[k.kind]}
                </span>
                <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      pct >= 70
                        ? "bg-emerald-500"
                        : pct >= 40
                          ? "bg-amber-500"
                          : "bg-rose-500",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-foreground w-[60px] text-right font-mono text-[11px] font-bold tabular-nums">
                  {k.completedItems}/{k.totalItems}
                </span>
              </div>
            );
          })}
        </div>
        {/* 일별 미니 막대 */}
        {summary.byDay.length > 0 ? (
          <div className="mt-4">
            <p className="text-muted-foreground mb-1.5 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
              일별 추이
            </p>
            <div className="flex items-end gap-0.5">
              {summary.byDay.map((d) => {
                const pct =
                  d.totalItems > 0 ? (d.completedItems / d.totalItems) * 100 : 0;
                return (
                  <div
                    key={d.date}
                    title={`${d.date} · ${d.completedItems}/${d.totalItems}`}
                    className="bg-muted relative h-8 flex-1 rounded-sm"
                  >
                    <div
                      className={cn(
                        "absolute right-0 bottom-0 left-0 rounded-sm",
                        pct >= 70
                          ? "bg-emerald-500"
                          : pct >= 40
                            ? "bg-amber-500"
                            : pct > 0
                              ? "bg-rose-500"
                              : "bg-muted-foreground/20",
                      )}
                      style={{ height: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-muted-foreground mt-1 text-[10px]">
              왼쪽 = {summary.byDay[0]?.date} / 오른쪽 ={" "}
              {summary.byDay[summary.byDay.length - 1]?.date}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DailyMenuCard({ item }: { item: DailyMenuItem }) {
  const Icon = KIND_ICON[item.kind];
  const tone = PRIORITY_TONE[item.priority];
  return (
    <Card className="transition-colors hover:border-primary">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary inline-flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 font-mono text-[10px] font-bold tracking-[0.04em] uppercase",
                  tone.bg,
                  tone.text,
                )}
              >
                {tone.label}
              </span>
              <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px] font-medium tabular-nums">
                <ClockIcon className="size-3" />
                {item.estimatedMinutes}분
              </span>
            </div>
            <h2 className="text-sm font-bold leading-tight tracking-tight md:text-base">
              {item.title}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {item.body}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4 pl-[60px]">
        <Button asChild size="sm" className="gap-1.5">
          <Link to={item.ctaUrl} viewTransition>
            {item.ctaLabel}
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
