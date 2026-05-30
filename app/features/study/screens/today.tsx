// feat-2-009 오늘의 학습 메뉴 — /study/today.
// 5 슬롯 자동 추천 (약점 문제 · 약점 조문 · 미열람 판례 · 빈칸 · 진도 보충).
// 같은 user+KST 날짜는 1회 고정 픽 — 학습 중간에 추천이 바뀌지 않음.

import type { Route } from "./+types/today";

import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarIcon,
  ClockIcon,
  PencilLineIcon,
  ScaleIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";
import { Link, data, redirect } from "react-router";

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
  totalEstimatedMinutes,
} from "~/features/study/lib/daily-menu";

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
  const items = await getOrComposeDailyMenu(client, user.id, today);

  // 응답 후 viewed_at 마킹 — analytics 용.
  runAfterResponse(markDailyMenuViewed(client, user.id, today));

  return { items, today };
}

const KIND_ICON: Record<DailyMenuKind, typeof TargetIcon> = {
  weak_problem: TargetIcon,
  weak_article: BookOpenIcon,
  unread_case: ScaleIcon,
  blank_due: PencilLineIcon,
  gap_problems: SparklesIcon,
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
  const { items, today } = loaderData;
  const totalMin = totalEstimatedMinutes(items);

  return (
    <div className="mx-auto w-full max-w-screen-md px-4 py-8 md:px-6 md:py-12">
      {/* 헤더 */}
      <div className="mb-6">
        <p className="text-primary inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          <CalendarIcon className="size-3" />
          {formatKstDate(today)}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
          오늘의 학습 메뉴
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          본인 약점·미열람·진도 데이터를 합성한 오늘의 추천 {items.length}개.
          예상 학습 시간 {totalMin}분. 같은 날 새로고침해도 추천은 고정.
        </p>
      </div>

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
