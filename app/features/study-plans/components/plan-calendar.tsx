// Phase 3 — 월간 계획·일일 기록 공용 월 캘린더.
// 데이터는 전부 파생(buildCalendarDays) — 일간 슬롯 테이블 없음(§3.2).
// full = 계획 화면(날짜별 부하 미리보기·항목 기간 하이라이트),
// mini = 기록 화면(달성 현황 점 + 날짜 이동).

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";

import { formatMinutesCompact, type DayScope } from "../labels";
import { scopeMatches, type CalendarDay } from "../lib/expected-items";

const WEEKDAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export interface CalendarHighlight {
  start: string;
  end: string;
  scope: DayScope;
}

function dayNumberColor(col: number): string {
  if (col === 0) return "text-rose-600 dark:text-rose-400";
  if (col === 6) return "text-sky-600 dark:text-sky-400";
  return "";
}

function StatusDot({ day }: { day: CalendarDay }) {
  if (day.status === "done")
    return <span className="size-1.5 rounded-full bg-emerald-500" />;
  if (day.status === "partial")
    return <span className="size-1.5 rounded-full bg-amber-500" />;
  if (day.status === "missed")
    return <span className="size-1.5 rounded-full border border-rose-400" />;
  if (day.status === "free" && day.loggedMinutes > 0)
    return <span className="size-1.5 rounded-full bg-sky-400" />;
  return <span className="size-1.5" />;
}

function Legend() {
  const item = (dot: React.ReactNode, label: string) => (
    <span className="inline-flex items-center gap-1">
      {dot}
      {label}
    </span>
  );
  return (
    <p className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
      {item(<span className="size-1.5 rounded-full bg-emerald-500" />, "완료")}
      {item(<span className="size-1.5 rounded-full bg-amber-500" />, "부분")}
      {item(
        <span className="size-1.5 rounded-full border border-rose-400" />,
        "미기록",
      )}
      {item(<span className="size-1.5 rounded-full bg-sky-400" />, "계획 외 기록")}
    </p>
  );
}

export function PlanCalendar({
  variant,
  days,
  todayISO,
  showStatus = true,
  selectedDate,
  highlight,
  overloadedDates,
  dayHref,
  prevHref,
  nextHref,
}: {
  variant: "full" | "mini";
  days: CalendarDay[];
  todayISO: string;
  /** false 면 상태 점·범례 숨김 (계획 작성 중 — '미기록' 소음 방지). */
  showStatus?: boolean;
  selectedDate?: string;
  /** 계획 항목 hover — 적용 기간(요일범위 반영) 하이라이트. */
  highlight?: CalendarHighlight | null;
  /** 계획 합계가 가용시간을 넘는 날. */
  overloadedDates?: ReadonlySet<string>;
  dayHref?: (day: CalendarDay) => string;
  prevHref?: string;
  nextHref?: string;
}) {
  if (days.length === 0) return null;
  const offset = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const monthLabel = `${Number(days[0].date.slice(0, 4))}년 ${Number(days[0].date.slice(5, 7))}월`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-center gap-2">
        {prevHref ? (
          <Link
            to={prevHref}
            className="text-muted-foreground hover:text-foreground"
            aria-label="이전 달"
          >
            <ChevronLeftIcon className="size-4" />
          </Link>
        ) : null}
        <span className="text-sm font-semibold tabular-nums">{monthLabel}</span>
        {nextHref ? (
          <Link
            to={nextHref}
            className="text-muted-foreground hover:text-foreground"
            aria-label="다음 달"
          >
            <ChevronRightIcon className="size-4" />
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_HEADERS.map((h, i) => (
          <span
            key={h}
            className={cn(
              "text-muted-foreground pb-1 text-center text-[10px] font-semibold",
              dayNumberColor(i),
            )}
          >
            {h}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {days.map((day, idx) => {
          const col = (offset + idx) % 7;
          const isToday = day.date === todayISO;
          const href = dayHref?.(day);
          const highlighted = highlight
            ? day.date >= highlight.start &&
              day.date <= highlight.end &&
              scopeMatches(highlight.scope, day.weekend)
            : false;
          const overloaded = overloadedDates?.has(day.date) ?? false;
          const dayNo = Number(day.date.slice(8));

          if (variant === "mini") {
            const selected = day.date === selectedDate;
            const future = day.date > todayISO;
            const inner = (
              <>
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs tabular-nums",
                    dayNumberColor(col),
                    future && "opacity-40",
                    selected
                      ? "bg-foreground text-background font-semibold opacity-100"
                      : isToday && "ring-foreground/40 ring-1",
                  )}
                >
                  {dayNo}
                </span>
                {showStatus ? <StatusDot day={day} /> : null}
              </>
            );
            return href ? (
              <Link
                key={day.date}
                to={href}
                preventScrollReset
                className="hover:bg-muted flex flex-col items-center gap-0.5 rounded-md py-1"
              >
                {inner}
              </Link>
            ) : (
              <span
                key={day.date}
                className="flex flex-col items-center gap-0.5 py-1"
              >
                {inner}
              </span>
            );
          }

          // full — 날짜별 부하 셀
          const cellCls = cn(
            "relative flex min-h-14 flex-col rounded-lg border p-1 text-left transition-colors sm:min-h-16 sm:p-1.5",
            highlighted
              ? "border-primary/60 bg-primary/10"
              : overloaded
                ? "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20"
                : "border-border/60 bg-background",
            href && "hover:border-primary/50 hover:bg-muted",
          );
          const inner = (
            <>
              <span
                className={cn(
                  "self-start text-[11px] font-medium tabular-nums",
                  dayNumberColor(col),
                  isToday &&
                    "bg-foreground text-background -mx-0.5 rounded-full px-1.5",
                )}
              >
                {dayNo}
              </span>
              {day.expectedCount > 0 ? (
                <span className="text-muted-foreground mt-auto text-[10px] leading-tight tabular-nums">
                  {formatMinutesCompact(day.expectedMinutes)}
                  <span className="hidden sm:inline"> · {day.expectedCount}건</span>
                </span>
              ) : null}
              {showStatus ? (
                <span className="absolute top-1.5 right-1.5">
                  <StatusDot day={day} />
                </span>
              ) : null}
            </>
          );
          return href ? (
            <Link key={day.date} to={href} className={cellCls}>
              {inner}
            </Link>
          ) : (
            <div key={day.date} className={cellCls}>
              {inner}
            </div>
          );
        })}
      </div>

      {showStatus ? <Legend /> : null}
    </div>
  );
}
