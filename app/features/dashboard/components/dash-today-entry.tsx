// 대시보드 최상단 — "오늘로 가는 입구" 카드.
// 통계가 아니라 오늘 할 일 요약 + 큰 진입 버튼. 카드 넘김(실행) 은 /study/today 에서.
// 같은 데이터(`getTodaySummary`) 를 [오늘] 본문과 공유 → 숫자/모드 일관성 보장.
//
// 디자인: Notion·Linear 톤 (담백·미니멀·고대비). 학생 공용 프리미티브만 사용.

import {
  ArrowRightIcon,
  ClipboardListIcon,
  RepeatIcon,
  SparklesIcon,
} from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Chip, EmptyState, Eyebrow, Surface } from "~/core/components/student";
import type { TodaySummary } from "~/features/study/today-summary.server";

export function TodayEntryCard({ summary }: { summary: TodaySummary }) {
  if (summary.isEmptyForNewUser) {
    return <TodayEntryEmpty />;
  }

  const totalReview = summary.review.totalToday;
  const totalRec = summary.recommendations.length;
  const totalAssign = summary.assignments.pendingCount;
  const isCohort = summary.assignments.isCohortMember;

  // 요약 한 줄 — "복습 N개 · 추천 M개 · (종합반) 과제 K개"
  const parts: string[] = [];
  if (totalReview > 0) parts.push(`복습 ${totalReview}개`);
  if (totalRec > 0) parts.push(`추천 ${totalRec}개`);
  if (isCohort && totalAssign > 0) parts.push(`과제 ${totalAssign}개`);
  const oneLine = parts.length > 0 ? parts.join(" · ") : "오늘 할 일 없음";

  return (
    <Surface tone="default" pad={6}>
      <Eyebrow>TODAY · 오늘로 가는 입구</Eyebrow>
      <h2 className="text-foreground mt-1 text-xl font-semibold tracking-tight md:text-2xl">
        오늘의 학습
      </h2>
      <p className="text-ink-soft mt-1 text-sm">{oneLine}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Chip
          tone="danger"
          icon={<RepeatIcon className="size-3" />}
        >
          복습 <span className="tabular-nums">{totalReview}</span>
        </Chip>
        <Chip tone="info" icon={<SparklesIcon className="size-3" />}>
          추천 <span className="tabular-nums">{totalRec}</span>
        </Chip>
        {isCohort ? (
          <Chip
            tone="warn"
            icon={<ClipboardListIcon className="size-3" />}
          >
            과제 <span className="tabular-nums">{totalAssign}</span>
            {summary.assignments.dueSoonCount > 0
              ? ` (D-${summary.assignments.dueSoonCount}건 임박)`
              : ""}
          </Chip>
        ) : (
          // 비종합반 — 과제 카드가 보이지 않는 이유 자연스럽게 안내.
          <Chip tone="neutral">자기주도 모드 · 종합반 가입 시 과제 표시</Chip>
        )}
        {summary.review.hasBacklog ? (
          <Chip tone="warn">
            밀린 항목 우선 · 하루 상한 {summary.review.maxPerDay}
          </Chip>
        ) : null}
      </div>

      <div className="mt-6">
        <Button asChild size="lg" className="w-full gap-1.5 sm:w-auto">
          <Link to="/study/today" viewTransition>
            오늘 학습 시작
            <ArrowRightIcon className="size-4" />
          </Link>
        </Button>
      </div>
    </Surface>
  );
}

function TodayEntryEmpty() {
  return (
    <EmptyState
      icon={<SparklesIcon className="size-7" />}
      title="첫 학습부터 시작해 볼까요?"
      description="첫 학습을 시작하면 다음 날부터 복습 카드와 맞춤 추천이 자동으로 생깁니다."
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
