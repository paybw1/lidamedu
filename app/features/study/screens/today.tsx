// [오늘] — 순수 행동 화면. "지금 무엇을 할까" 에만 답한다.
// 본문 = 진행률 한 줄 + ① 복습 + ② 추천 학습 + ③ (종합반) 과제 — 4가지 외 항목 금지.
// 통계·도구·추세는 본 화면에 두지 않는다 (→ /dashboard 또는 /study/stats).
//
// 디자인: 디자인 시스템 v1 (Notion·Linear 톤). 학생 공용 프리미티브만 사용.
import type { Route } from "./+types/today";

import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  ClockIcon,
  GraduationCapIcon,
  PencilLineIcon,
  RepeatIcon,
  ScaleIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, redirect, useFetcher } from "react-router";

import {
  AreaEyebrow,
  Chip,
  type ChipTone,
  EmptyState,
  StudentShell,
  Surface,
} from "~/core/components/student";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { GuideHelpButton } from "~/features/guide/components/guide-help-button";
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
  ALL_DAILY_MENU_KINDS,
  KIND_LABEL,
  parseRecommendationPrefs,
} from "~/features/study/lib/daily-menu";
import {
  type TodaySummary,
  getTodaySummary,
} from "~/features/study/today-summary.server";

export const meta: Route.MetaFunction = () => [{ title: "오늘 할 일 | 리담변리사학원" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login?next=/study/today");

  const today = kstToday();
  const [summary, profileRes] = await Promise.all([
    getTodaySummary(client, user.id, today),
    client
      .from("profiles")
      .select("recommendation_prefs")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);
  const recommendationPrefs = parseRecommendationPrefs(
    profileRes.data?.recommendation_prefs,
  );

  // 응답 후 viewed_at 마킹 — analytics 용.
  runAfterResponse(markDailyMenuViewed(client, user.id, today));

  return { summary, recommendationPrefs };
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

function ProgressBar({ summary }: { summary: TodaySummary }) {
  const { completed, total } = summary.progress;
  // 오늘 복습(문제 SRS) 진행률. 남은 due 없고 한 적도 없으면 바 자체를 숨긴다.
  if (total === 0) return null;
  const pct = Math.round((completed / total) * 100);
  return (
    <Surface tone="subtle" pad={4} className="mb-6">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">
          오늘 복습 <span className="tabular-nums">{total}</span>개 중{" "}
          <span className="text-link tabular-nums">{completed}</span>개 완료
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
    <Surface tone="default" pad={6} className="ring-primary/10 ring-1">
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-link inline-flex size-10 shrink-0 items-center justify-center rounded-lg">
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
            오늘 복습 <span className="tabular-nums">{review.totalToday}</span>
            개
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
      <span className="bg-muted text-ink-soft group-hover:text-link inline-flex size-7 shrink-0 items-center justify-center rounded-md">
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
        <p className="text-foreground mt-1 text-sm leading-tight font-semibold">
          {item.title}
        </p>
        <p className="text-ink-soft mt-0.5 line-clamp-2 text-xs leading-relaxed">
          {item.body}
        </p>
      </div>
      <ArrowRightIcon className="text-ink-faint group-hover:text-link mt-1 size-3.5 shrink-0" />
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
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
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
                <p className="text-foreground text-sm leading-tight font-semibold">
                  {p.title}
                </p>
                <p className="text-ink-faint mt-0.5 text-[11px]">
                  {pct}% 완수 · D
                  {daysLeft >= 0 ? `-${daysLeft}` : `+${-daysLeft}`}
                </p>
              </div>
              <ArrowRightIcon className="text-ink-faint group-hover:text-link size-3.5" />
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
      title="아직 복습할 항목이 없습니다"
      description="첫 학습을 시작하면 다음 날부터 복습 카드가 자동으로 생깁니다. 관심 있는 과목을 골라 첫 학습을 시작해 보세요."
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

/* ── 완료 상태 (학습 이력 있는 학생이 오늘 할 일을 다 끝냄) ────────── */

function AllDoneCard() {
  return (
    <EmptyState
      icon={<CheckCircle2Icon className="size-8 text-emerald-500" />}
      title="오늘 할 일을 모두 끝냈습니다"
      description="복습·추천·과제를 다 처리했습니다. 더 학습하려면 새 문제를 풀거나 통계로 오늘을 돌아보세요."
      actions={
        <>
          <Button asChild size="sm">
            <Link to="/subjects/patent">새 문제 풀기</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/study/stats">학습현황</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/srs">암기 카드</Link>
          </Button>
        </>
      }
    />
  );
}

/* ── 추천 설정 (feat-2-021 — 7 슬롯 ON/OFF) ─────────────────────────── */

function RecommendationPrefsPanel({
  prefs,
}: {
  prefs: Record<DailyMenuKind, boolean>;
}) {
  return (
    <Surface tone="subtle" pad={4} className="mb-6">
      <p className="text-sm font-semibold">오늘의 학습 추천 설정</p>
      <p className="text-ink-soft mt-0.5 text-xs leading-relaxed">
        끄면 그 종류의 추천이 더는 나오지 않습니다. 변경은 내일(KST 자정)부터
        반영됩니다.
      </p>
      <div className="mt-3 space-y-1.5">
        {ALL_DAILY_MENU_KINDS.map((kind) => (
          <PrefToggleRow key={kind} kind={kind} enabled={prefs[kind]} />
        ))}
      </div>
    </Surface>
  );
}

function PrefToggleRow({
  kind,
  enabled,
}: {
  kind: DailyMenuKind;
  enabled: boolean;
}) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  const submitting = fetcher.state !== "idle";
  // optimistic — 제출 중에는 토글된 상태로 표시.
  const shown = submitting ? !enabled : enabled;
  return (
    <fetcher.Form
      method="post"
      action="/api/study/recommendation-prefs"
      className="bg-card border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <span className="text-foreground text-sm">{KIND_LABEL[kind]}</span>
      <Button
        type="submit"
        size="sm"
        variant={shown ? "default" : "outline"}
        disabled={submitting}
        className="min-w-16"
      >
        {shown ? "켜짐" : "꺼짐"}
      </Button>
    </fetcher.Form>
  );
}

/* ── 암기 카드 밀림 경고 (feat-2-024) ─────────────────────────────── */

function CardBacklogNotice({ items }: { items: TodaySummary["cardBacklog"] }) {
  return (
    <div className="mb-4 rounded-lg border border-amber-300/60 bg-amber-50/60 px-4 py-3 text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
      <p className="text-sm font-semibold">암기 카드 복습이 밀리고 있습니다</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((it) => (
          <Button key={it.kind} asChild size="sm" variant="outline">
            <Link to={`/srs?type=${it.kind}`} viewTransition>
              {it.label} {it.due}개 복습
              {it.oldestOverdueDays ? ` · ${it.oldestOverdueDays}일 지남` : ""}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}

/* ── 메인 ─────────────────────────────────────────────────────────── */

export default function StudyToday({ loaderData }: Route.ComponentProps) {
  const { summary, recommendationPrefs } = loaderData;
  const [prefsOpen, setPrefsOpen] = useState(false);

  return (
    <StudentShell width="narrow">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <AreaEyebrow area="manage" />
          <h1 className="text-foreground mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            오늘 할 일
          </h1>
          <p className="text-ink-soft mt-2 text-sm">
            {formatKstDate(summary.date)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPrefsOpen((v) => !v)}
            aria-expanded={prefsOpen}
            className="text-ink-soft gap-1.5"
          >
            <SlidersHorizontalIcon className="size-3.5" />
            추천 설정
          </Button>
          <GuideHelpButton screenKey="today" />
        </div>
      </header>

      {prefsOpen ? (
        <RecommendationPrefsPanel prefs={recommendationPrefs} />
      ) : null}

      {!summary.isEmptyForNewUser ? <ProgressBar summary={summary} /> : null}

      {summary.cardBacklog.length > 0 ? (
        <CardBacklogNotice items={summary.cardBacklog} />
      ) : null}

      {summary.isEmptyForNewUser ? (
        summary.hasStudiedBefore ? (
          <AllDoneCard />
        ) : (
          <EmptyStateCard />
        )
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
            학습현황
          </Link>
          에서 확인하세요. 추천 종류는 위 “추천 설정”에서 켜고 끌 수 있습니다.
        </p>
      </div>
    </StudentShell>
  );
}
