// [오늘] — 순수 행동 화면. "지금 무엇을 할까" 에만 답한다.
// 본문 = 진행률 한 줄 + ① 복습 + ② 추천 학습 + ③ (종합반) 과제 — 4가지 외 항목 금지.
// 통계·도구·추세는 본 화면에 두지 않는다 (→ /dashboard 또는 /study/stats).
//
// 디자인: 디자인 시스템 v1 (Notion·Linear 톤). 학생 공용 프리미티브만 사용.

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
import {
  Chip,
  type ChipTone,
  EmptyState,
  Eyebrow,
  StudentShell,
  Surface,
} from "~/core/components/student";
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
  { title: "오늘 할 일 | Lidam" },
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

const PRIORITY_TONE: Record<DailyMenuPriority, ChipTone> = {
  high: "danger",
  medium: "warn",
  low: "info",
};

const PRIORITY_LABEL: Record<DailyMenuPriority, string> = {
  high: "우선",
  medium: "권장",
  low: "추가",
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
    <Surface tone="subtle" pad={4} className="mb-6">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">
          오늘 할 일 <span className="tabular-nums">{total}</span>개 중{" "}
          <span className="text-primary tabular-nums">{completed}</span>개 완료
        </p>
        <p className="text-ink-faint font-mono text-[11px] tabular-nums">
          {pct}%
        </p>
      </div>
      <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Surface>
  );
}

/* ── ① 복습 카드 — 최우선 ─────────────────────────────────────────── */

function ReviewCard({ summary }: { summary: TodaySummary }) {
  const { review } = summary;
  if (review.totalToday === 0) return null;

  const hasV1 = review.problemDue > 0;
  const hasV2 = review.flashcardDue + review.flashcardNew > 0;
  const primaryUrl = hasV1 ? "/study/srs" : "/srs";

  return (
    <Surface tone="default" pad={6} className="ring-1 ring-primary/10">
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary inline-flex size-10 shrink-0 items-center justify-center rounded-lg">
          <RepeatIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Chip tone="danger">최우선</Chip>
            {review.hasBacklog ? (
              <Chip tone="warn">
                밀린 항목 우선 · 하루 상한 {review.maxPerDay}
              </Chip>
            ) : null}
          </div>
          <h2 className="text-foreground text-lg font-semibold tracking-tight md:text-xl">
            오늘 복습{" "}
            <span className="tabular-nums">{review.totalToday}</span>개
          </h2>
          {hasV1 && hasV2 ? (
            <p className="text-ink-soft mt-1 text-xs leading-relaxed">
              문제 복습 {review.problemDue}개 · 암기 카드{" "}
              {review.flashcardDue + review.flashcardNew}개
              <span className="bg-muted text-ink-faint ml-1.5 rounded px-1 py-0.5 text-[10px]">
                베타
              </span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 pl-13">
        <Button asChild className="gap-1.5">
          <Link to={primaryUrl} viewTransition>
            지금 시작
            <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
        {hasV1 && hasV2 ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/srs">암기 카드 시작</Link>
          </Button>
        ) : null}
      </div>
    </Surface>
  );
}

/* ── ② 오늘의 추천 학습 카드 ──────────────────────────────────────── */

function RecommendationsCard({ summary }: { summary: TodaySummary }) {
  const items = summary.recommendations;
  if (items.length === 0) return null;
  const totalMin = items.reduce((s, i) => s + i.estimatedMinutes, 0);

  return (
    <Surface tone="default" pad={6}>
      <div className="flex items-start gap-3">
        <span className="bg-secondary text-secondary-foreground inline-flex size-10 shrink-0 items-center justify-center rounded-lg">
          <SparklesIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-foreground text-lg font-semibold tracking-tight">
            오늘의 학습 <span className="tabular-nums">{items.length}</span>개
          </h2>
          <p className="text-ink-soft mt-1 inline-flex items-center gap-1 text-xs">
            <ClockIcon className="size-3" /> 예상 {totalMin}분
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2 pl-13">
        {items.map((item, i) => (
          <DailyMenuRow key={`${item.kind}-${i}`} item={item} />
        ))}
      </div>
    </Surface>
  );
}

function DailyMenuRow({ item }: { item: DailyMenuItem }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <Link
      to={item.ctaUrl}
      viewTransition
      className="group border-border hover:border-primary hover:bg-surface-3 flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors"
    >
      <span className="bg-muted text-ink-soft group-hover:text-primary inline-flex size-7 shrink-0 items-center justify-center rounded-md">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Chip tone={PRIORITY_TONE[item.priority]}>
            {PRIORITY_LABEL[item.priority]}
          </Chip>
          <span className="text-ink-faint text-[10px] tabular-nums">
            {item.estimatedMinutes}분
          </span>
        </div>
        <p className="text-foreground mt-1 text-sm font-semibold leading-tight">
          {item.title}
        </p>
        <p className="text-ink-soft mt-0.5 line-clamp-2 text-xs leading-relaxed">
          {item.body}
        </p>
      </div>
      <ArrowRightIcon className="text-ink-faint group-hover:text-primary mt-1 size-3.5 shrink-0" />
    </Link>
  );
}

/* ── ③ 종합반 과제 카드 — cohort 멤버만 ───────────────────────────── */

function AssignmentsCard({ summary }: { summary: TodaySummary }) {
  const a = summary.assignments;
  if (!a.isCohortMember) return null;
  if (a.pendingCount === 0) {
    return (
      <Surface tone="dashed" pad={4} className="text-center">
        <CheckCircle2Icon className="mx-auto size-5 text-emerald-500" />
        <p className="text-foreground mt-1 text-sm font-semibold">
          종합반 과제 모두 완료
        </p>
        <p className="text-ink-soft text-xs">
          새 과제가 배포되면 알림으로 안내됩니다.
        </p>
      </Surface>
    );
  }
  return (
    <Surface tone="default" pad={6}>
      <div className="flex items-start gap-3">
        <span className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 inline-flex size-10 shrink-0 items-center justify-center rounded-lg">
          <ClipboardListIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Chip tone="warn">종합반</Chip>
            {a.dueSoonCount > 0 ? (
              <Chip tone="danger">마감 임박 {a.dueSoonCount}개</Chip>
            ) : null}
          </div>
          <h2 className="text-foreground text-lg font-semibold tracking-tight">
            과제 <span className="tabular-nums">{a.pendingCount}</span>개
          </h2>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 pl-13">
        {a.topPending.map((p) => {
          const pct =
            p.totalItems > 0
              ? Math.round((p.completedItems / p.totalItems) * 100)
              : 0;
          const daysLeft = Math.floor(
            (new Date(p.dueAt).getTime() - Date.now()) / 86_400_000,
          );
          return (
            <Link
              key={p.assignmentId}
              to={`/assignments/${p.assignmentId}`}
              className="group border-border hover:border-primary hover:bg-surface-3 flex items-center gap-3 rounded-md border px-3 py-2 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-semibold leading-tight">
                  {p.title}
                </p>
                <p className="text-ink-faint mt-0.5 text-[11px]">
                  {pct}% 완수 · D
                  {daysLeft >= 0 ? `-${daysLeft}` : `+${-daysLeft}`}
                </p>
              </div>
              <ArrowRightIcon className="text-ink-faint group-hover:text-primary size-3.5" />
            </Link>
          );
        })}
        {a.pendingCount > a.topPending.length ? (
          <Link
            to="/assignments"
            className="text-ink-faint hover:text-foreground mt-2 block text-center text-xs underline"
          >
            전체 과제함 보기 ({a.pendingCount}개)
          </Link>
        ) : null}
      </div>
    </Surface>
  );
}

/* ── 신규 학생 빈상태 가이드 ──────────────────────────────────────── */

function EmptyStateCard() {
  return (
    <EmptyState
      icon={<SparklesIcon className="size-8" />}
      title="아직 복습할 항목이 없어요"
      description="첫 학습을 시작하면 다음 날부터 복습 카드가 자동으로 생깁니다. 관심 있는 과목을 골라 첫 학습을 시작해 볼까요?"
      actions={
        <>
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
        </>
      }
    />
  );
}

/* ── 메인 ─────────────────────────────────────────────────────────── */

export default function StudyToday({ loaderData }: Route.ComponentProps) {
  const { summary } = loaderData;

  return (
    <StudentShell width="narrow">
      <header className="mb-6">
        <Eyebrow>
          <CalendarIcon className="mr-1 inline size-3" />
          {formatKstDate(summary.date)}
        </Eyebrow>
        <h1 className="text-foreground mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          오늘 할 일
        </h1>
      </header>

      {!summary.isEmptyForNewUser ? <ProgressBar summary={summary} /> : null}

      {summary.isEmptyForNewUser ? (
        <EmptyStateCard />
      ) : (
        <div className="space-y-4">
          <ReviewCard summary={summary} />
          <RecommendationsCard summary={summary} />
          <AssignmentsCard summary={summary} />
        </div>
      )}

      {/* 강등 항목 — 위치 안내 */}
      <div className="border-border text-ink-faint mt-10 space-y-1 border-t pt-4 text-center text-[11px]">
        <p>
          학습 추세·통계는{" "}
          <Link to="/study/stats" className="text-foreground underline">
            학습 통계
          </Link>
          에서 · 추천 슬롯 설정은{" "}
          <Link to="/study/stats" className="text-foreground underline">
            통계
          </Link>{" "}
          하단으로 이동했어요.
        </p>
      </div>
    </StudentShell>
  );
}
