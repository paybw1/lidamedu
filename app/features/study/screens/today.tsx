// [오늘] — 순수 행동 화면. "지금 무엇을 할까" 에만 답한다.
// 본문 = 진행률 한 줄 + ① 복습 + ② 추천 학습 + ③ (종합반) 과제 — 4가지 외 항목 금지.
// 통계·도구·추세는 본 화면에 두지 않는다 (→ /dashboard 또는 /study/stats).
//
// 종합반/자기주도 모드 분기는 todaySummary.assignments.isCohortMember 로 결정.
// 모드별 카드 유무 안내는 chip 으로 자연스럽게.

import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  ClockIcon,
  GraduationCapIcon,
  PencilLineIcon,
  RepeatIcon,
  ScaleIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";
import { Link, redirect } from "react-router";

import type { Route } from "./+types/today";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import {
  kstToday,
  markDailyMenuViewed,
} from "~/features/study/daily-menu.server";
import type {
  DailyMenuItem,
  DailyMenuKind,
  DailyMenuPriority,
} from "~/features/study/lib/daily-menu";
import {
  getTodaySummary,
  type TodaySummary,
} from "~/features/study/today-summary.server";

export const meta: Route.MetaFunction = () => [
  { title: "오늘의 학습 | Lidam" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login?next=/study/today");

  const today = kstToday();
  const summary = await getTodaySummary(client, user.id, today);

  // 응답 후 viewed_at 마킹 — analytics 용.
  runAfterResponse(markDailyMenuViewed(client, user.id, today));

  return { summary };
}

/* ── 공통 ─────────────────────────────────────────────────────────── */

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

/* ── 진행률 한 줄 + 진행 바 ────────────────────────────────────────── */

function totalTasks(summary: TodaySummary): number {
  return (
    summary.review.totalToday +
    summary.recommendations.length +
    summary.assignments.pendingCount
  );
}

function ProgressBar({ summary }: { summary: TodaySummary }) {
  const total = totalTasks(summary);
  // 완수 카운트는 v1.x — 이번 단계에선 단순히 "0/N" 표기. 정밀 측정은 후속.
  const completed = 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="mb-6 rounded-lg border border-border/70 bg-card/40 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">
          오늘 할 일 <span className="tabular-nums">{total}</span>개 중{" "}
          <span className="text-primary tabular-nums">{completed}</span>개 완료
        </p>
        <p className="text-muted-foreground font-mono text-[11px] tabular-nums">
          {pct}%
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── ① 복습 카드 — 최우선 ─────────────────────────────────────────── */

function ReviewCard({ summary }: { summary: TodaySummary }) {
  const { review } = summary;
  if (review.totalToday === 0) return null;

  // 학생 라벨 — v1/v2 모두 있으면 "오늘 복습" 합산. 둘 다 있으면 본문에 세부.
  const hasV1 = review.problemDue > 0;
  const hasV2 = review.flashcardDue + review.flashcardNew > 0;
  const primaryUrl = hasV1 ? "/study/srs" : "/srs/review"; // v1 우선 진입 — 본인 학습 흐름과 정합

  return (
    <Card className="border-primary/40 ring-1 ring-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="bg-primary/15 text-primary inline-flex size-10 shrink-0 items-center justify-center rounded-lg">
            <RepeatIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex h-5 items-center rounded-full bg-rose-50 dark:bg-rose-950/30 px-2 font-mono text-[10px] font-bold tracking-[0.04em] uppercase text-rose-700 dark:text-rose-300">
                최우선
              </span>
              {review.hasBacklog ? (
                <span className="inline-flex h-5 items-center rounded-full bg-amber-50 dark:bg-amber-950/30 px-2 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  밀린 항목 우선 · 하루 상한 {review.maxPerDay}개
                </span>
              ) : null}
            </div>
            <h2 className="text-lg font-bold tracking-tight md:text-xl">
              오늘 복습 <span className="tabular-nums">{review.totalToday}</span>개
            </h2>
            {hasV1 && hasV2 ? (
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                문제 복습 {review.problemDue}개 · 카드 암기{" "}
                {review.flashcardDue + review.flashcardNew}개
                <span className="text-[10px] ml-1.5 rounded bg-muted px-1 py-0.5">베타</span>
              </p>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 pb-4 pl-[60px]">
        <Button asChild size="default" className="gap-1.5">
          <Link to={primaryUrl} viewTransition>
            지금 시작
            <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
        {hasV1 && hasV2 ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/srs/review">카드 암기 시작</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ── ② 오늘의 추천 학습 카드 ──────────────────────────────────────── */

function RecommendationsCard({ summary }: { summary: TodaySummary }) {
  const items = summary.recommendations;
  if (items.length === 0) return null;
  const totalMin = items.reduce((s, i) => s + i.estimatedMinutes, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 inline-flex size-10 shrink-0 items-center justify-center rounded-lg">
            <SparklesIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold tracking-tight">
              오늘의 학습 <span className="tabular-nums">{items.length}</span>개
            </h2>
            <p className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-xs">
              <ClockIcon className="size-3" /> 예상 {totalMin}분
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pb-4 pl-[60px]">
        {items.map((item, i) => (
          <DailyMenuRow key={`${item.kind}-${i}`} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}

function DailyMenuRow({ item }: { item: DailyMenuItem }) {
  const Icon = KIND_ICON[item.kind];
  const tone = PRIORITY_TONE[item.priority];
  return (
    <Link
      to={item.ctaUrl}
      viewTransition
      className="group flex items-start gap-3 rounded-md border border-border/70 px-3 py-2.5 transition-colors hover:border-primary hover:bg-accent/30"
    >
      <span className="text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 group-hover:text-primary">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex h-4 items-center rounded-full px-1.5 font-mono text-[9px] font-bold tracking-[0.04em] uppercase",
              tone.bg,
              tone.text,
            )}
          >
            {tone.label}
          </span>
          <span className="text-muted-foreground text-[10px] tabular-nums">
            {item.estimatedMinutes}분
          </span>
        </div>
        <p className="text-sm font-semibold leading-tight mt-1">{item.title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed line-clamp-2">
          {item.body}
        </p>
      </div>
      <ArrowRightIcon className="text-muted-foreground size-3.5 mt-1 shrink-0 group-hover:text-primary" />
    </Link>
  );
}

/* ── ③ 종합반 과제 카드 — cohort 멤버만 ───────────────────────────── */

function AssignmentsCard({ summary }: { summary: TodaySummary }) {
  const a = summary.assignments;
  if (!a.isCohortMember) return null; // 비종합반 — 카드 자체 렌더 안 함
  if (a.pendingCount === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 text-center">
          <CheckCircle2Icon className="mx-auto size-5 text-emerald-500" />
          <p className="text-foreground mt-1 text-sm font-semibold">
            종합반 과제 모두 완료
          </p>
          <p className="text-muted-foreground text-xs">
            새 과제가 배포되면 알림으로 안내됩니다.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 inline-flex size-10 shrink-0 items-center justify-center rounded-lg">
            <ClipboardListIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex h-5 items-center rounded-full bg-amber-50 dark:bg-amber-950/30 px-2 font-mono text-[10px] font-bold tracking-[0.04em] uppercase text-amber-700 dark:text-amber-300">
                종합반
              </span>
              {a.dueSoonCount > 0 ? (
                <span className="inline-flex h-5 items-center rounded-full bg-rose-50 dark:bg-rose-950/30 px-2 text-[10px] font-medium text-rose-700 dark:text-rose-300">
                  마감 임박 {a.dueSoonCount}개
                </span>
              ) : null}
            </div>
            <h2 className="text-lg font-bold tracking-tight">
              과제 <span className="tabular-nums">{a.pendingCount}</span>개
            </h2>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 pb-4 pl-[60px]">
        {a.topPending.map((p) => {
          const pct =
            p.totalItems > 0 ? Math.round((p.completedItems / p.totalItems) * 100) : 0;
          const daysLeft = Math.floor(
            (new Date(p.dueAt).getTime() - Date.now()) / 86_400_000,
          );
          return (
            <Link
              key={p.assignmentId}
              to={`/assignments/${p.assignmentId}`}
              className="group flex items-center gap-3 rounded-md border border-border/70 px-3 py-2 transition-colors hover:border-primary hover:bg-accent/30"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{p.title}</p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {pct}% 완수 · D{daysLeft >= 0 ? `-${daysLeft}` : `+${-daysLeft}`}
                </p>
              </div>
              <ArrowRightIcon className="text-muted-foreground size-3.5 group-hover:text-primary" />
            </Link>
          );
        })}
        {a.pendingCount > a.topPending.length ? (
          <Link
            to="/assignments"
            className="text-muted-foreground hover:text-foreground block text-center text-xs underline mt-2"
          >
            전체 과제함 보기 ({a.pendingCount}개)
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ── 신규 학생 빈상태 가이드 ──────────────────────────────────────── */

function EmptyStateCard() {
  return (
    <Card className="border-dashed">
      <CardContent className="space-y-3 py-10 text-center">
        <SparklesIcon className="mx-auto size-8 text-muted-foreground/40" />
        <p className="text-foreground text-sm font-semibold">
          아직 복습할 항목이 없어요
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          첫 학습을 시작하면 다음 날부터 복습 카드가 자동으로 생깁니다.
          <br />
          관심 있는 과목을 골라 첫 학습을 시작해 볼까요?
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Button asChild size="sm">
            <Link to="/subjects/patent">특허법 시작</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/subjects/trademark">상표법</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/subjects/civil">민법</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/goals">학습 목표 설정</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── 메인 ─────────────────────────────────────────────────────────── */

export default function StudyToday({ loaderData }: Route.ComponentProps) {
  const { summary } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-md px-4 py-8 md:px-6 md:py-12">
      {/* 헤더 */}
      <div className="mb-6">
        <p className="text-primary inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          <CalendarIcon className="size-3" />
          {formatKstDate(summary.date)}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
          오늘의 학습
        </h1>
      </div>

      {/* 진행률 */}
      {!summary.isEmptyForNewUser ? <ProgressBar summary={summary} /> : null}

      {/* 본문 — 단일 흐름 */}
      {summary.isEmptyForNewUser ? (
        <EmptyStateCard />
      ) : (
        <div className="space-y-4">
          <ReviewCard summary={summary} />
          <RecommendationsCard summary={summary} />
          <AssignmentsCard summary={summary} />
        </div>
      )}

      {/* 강등 항목 — 위치 안내 (없어진 게 아니라 위치가 바뀐 것) */}
      <div className="text-muted-foreground mt-10 space-y-1 border-t border-border/40 pt-4 text-center text-[11px]">
        <p>
          학습 추세·통계는{" "}
          <Link to="/study/stats" className="text-foreground underline">
            학습 통계
          </Link>
          에서 · 추천 슬롯 ON/OFF 는{" "}
          <Link to="/study/stats" className="text-foreground underline">
            통계
          </Link>
          하단 추천 설정으로 이동했어요.
        </p>
      </div>
    </div>
  );
}
