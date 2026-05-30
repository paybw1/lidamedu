// 대시보드 최상단 — "오늘로 가는 입구" 카드.
// 통계가 아니라 오늘 할 일 요약 + 큰 진입 버튼. 카드 넘김(실행) 은 /study/today 에서.
// 같은 데이터(`getTodaySummary`) 를 [오늘] 본문과 공유 → 숫자/모드 일관성 보장.

import { ArrowRightIcon, RepeatIcon, SparklesIcon, ClipboardListIcon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import type { TodaySummary } from "~/features/study/today-summary.server";

import { Card, Eyebrow, Sub, Title } from "~/features/dashboard/lib/dash";

export function TodayEntryCard({ summary }: { summary: TodaySummary }) {
  const totalReview = summary.review.totalToday;
  const totalRec = summary.recommendations.length;
  const totalAssign = summary.assignments.pendingCount;
  const isCohort = summary.assignments.isCohortMember;

  if (summary.isEmptyForNewUser) {
    return <TodayEntryEmpty />;
  }

  // 요약 한 줄 — "복습 N개 · 추천 M개 · (종합반) 과제 K개"
  const parts: string[] = [];
  if (totalReview > 0) parts.push(`복습 ${totalReview}개`);
  if (totalRec > 0) parts.push(`추천 ${totalRec}개`);
  if (isCohort && totalAssign > 0) parts.push(`과제 ${totalAssign}개`);
  const oneLine = parts.length > 0 ? parts.join(" · ") : "할 일 없음";

  return (
    <Card>
      <Eyebrow>TODAY · 오늘로 가는 입구</Eyebrow>
      <Title>오늘의 학습</Title>
      <div className="mt-2">
        <Sub>{oneLine}</Sub>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <TodayChip icon={<RepeatIcon className="size-3.5" />} label={`복습 ${totalReview}`} tone="rose" />
        <TodayChip icon={<SparklesIcon className="size-3.5" />} label={`추천 ${totalRec}`} tone="sky" />
        {isCohort ? (
          <TodayChip
            icon={<ClipboardListIcon className="size-3.5" />}
            label={`과제 ${totalAssign}${summary.assignments.dueSoonCount > 0 ? ` (D-${summary.assignments.dueSoonCount}건 임박)` : ""}`}
            tone="amber"
          />
        ) : (
          // 비종합반 — 과제 카드가 보이지 않는 이유를 자연스럽게 안내.
          <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            자기주도 모드 · 종합반 가입 시 과제 카드 표시
          </span>
        )}
        {summary.review.hasBacklog ? (
          <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
            밀린 항목 우선 · 하루 상한 {summary.review.maxPerDay}
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        <Button asChild size="lg" className="w-full gap-1.5 sm:w-auto">
          <Link to="/study/today" viewTransition>
            오늘 학습 시작
            <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function TodayChip({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "rose" | "sky" | "amber";
}) {
  const cls =
    tone === "rose"
      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
      : tone === "sky"
        ? "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
        : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {icon}
      <span className="tabular-nums">{label}</span>
    </span>
  );
}

function TodayEntryEmpty() {
  return (
    <Card>
      <Eyebrow>TODAY · 오늘로 가는 입구</Eyebrow>
      <Title>첫 학습부터 시작해 볼까요?</Title>
      <div className="mt-2">
        <Sub>
          첫 학습을 시작하면 다음 날부터 복습 카드와 맞춤 추천이 자동으로
          생깁니다.
        </Sub>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
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
    </Card>
  );
}
