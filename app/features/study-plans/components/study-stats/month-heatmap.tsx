// feat-7-048 D7 — 월 히트맵. 셀 = 그날 총 공부 시간, 채도 5단계.
// 모바일 우선: 7열 정사각 그리드, 날짜 탭으로 상세 이동.
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";
import { formatMinutesCompact } from "~/features/study-plans/labels";
import { STUDY_HEATMAP_STEPS } from "~/features/study-plans/subject-axis";
import type { DayCell } from "~/features/study-plans/lib/study-stats";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 채도 5단계 — 인라인 hex 없이 클래스만(다크 모드 정합).
const LEVEL_CLASS = [
  "bg-muted/40 text-muted-foreground",
  "bg-orange-500/20 text-orange-900 dark:text-orange-200",
  "bg-orange-500/40 text-orange-950 dark:text-orange-100",
  "bg-orange-500/65 text-white",
  "bg-orange-600/90 text-white",
] as const;

export function MonthHeatmap({
  days,
  monthLabel,
  prevHref,
  nextHref,
  selectedDate,
  dayHref,
  onSelectDate,
}: {
  days: DayCell[];
  monthLabel: string;
  prevHref?: string;
  nextHref?: string;
  selectedDate?: string;
  /** 날짜를 링크로 만들 때. onSelectDate 와 함께 쓰지 않는다. */
  dayHref?: (d: DayCell) => string;
  onSelectDate?: (date: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        {prevHref ? (
          <Link
            to={prevHref}
            aria-label="이전 달"
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <ChevronLeftIcon className="size-4" />
          </Link>
        ) : (
          <span className="size-6" />
        )}
        <span className="text-sm font-semibold tabular-nums">{monthLabel}</span>
        {nextHref ? (
          <Link
            to={nextHref}
            aria-label="다음 달"
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <ChevronRightIcon className="size-4" />
          </Link>
        ) : (
          <span className="size-6" />
        )}
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={cn(
              "text-muted-foreground pb-1 text-[10px]",
              i === 0 && "text-rose-500",
              i === 6 && "text-sky-500",
            )}
          >
            {w}
          </span>
        ))}
        {days.map((d) => {
          const content = (
            <>
              <span className="text-[10px] leading-none font-semibold tabular-nums">
                {Number(d.date.slice(8))}
              </span>
              {d.minutes > 0 ? (
                <span className="text-[9px] leading-none tabular-nums">
                  {formatMinutesCompact(d.minutes)}
                </span>
              ) : null}
            </>
          );
          const cls = cn(
            "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md",
            d.inMonth ? LEVEL_CLASS[d.level] : "opacity-30",
            d.isToday && "ring-primary ring-2",
            selectedDate === d.date && "ring-foreground/60 ring-2",
            d.isFuture && "opacity-50",
          );
          if (dayHref && d.inMonth) {
            return (
              <Link key={d.date} to={dayHref(d)} className={cls}>
                {content}
              </Link>
            );
          }
          if (onSelectDate && d.inMonth) {
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => onSelectDate(d.date)}
                className={cls}
              >
                {content}
              </button>
            );
          }
          return (
            <span key={d.date} className={cls}>
              {content}
            </span>
          );
        })}
      </div>

      <div className="text-muted-foreground mt-2 flex items-center justify-end gap-1 text-[10px]">
        <span>적음</span>
        {LEVEL_CLASS.map((c, i) => (
          <span key={i} className={cn("size-3 rounded-sm", c)} />
        ))}
        <span>{formatMinutesCompact(STUDY_HEATMAP_STEPS[2])}+</span>
      </div>
    </div>
  );
}
