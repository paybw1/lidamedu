// feat-7-048 D7 — 공부 통계 카드. 학생 화면과 상담 화면이 이 컴포넌트 하나를 쓴다.
// 월 히트맵 + 일간/주간/월간 요약. 날짜를 누르면 그 날의 기록으로 간다.
import { useState } from "react";
import { Link } from "react-router";

import {
  SUBJECT_COLOR_CLASS,
  defaultColorFor,
  type SubjectColorKey,
} from "~/features/study-plans/subject-axis";
import {
  buildHeatmapDays,
  monthRangeOf,
  type StatLog,
} from "~/features/study-plans/lib/study-stats";

import { MonthHeatmap } from "./month-heatmap";
import { PeriodTabs } from "./period-tabs";

export function StudyStatsCard({
  logs,
  monthAnchor,
  todayISO,
  colorOverrides,
  dayHref,
  prevHref,
  nextHref,
}: {
  logs: StatLog[];
  /** 이 달을 그린다(YYYY-MM-DD 아무 날). */
  monthAnchor: string;
  todayISO: string;
  colorOverrides: Record<string, string>;
  dayHref?: (date: string) => string;
  prevHref?: string;
  nextHref?: string;
}) {
  const { from, to } = monthRangeOf(monthAnchor);
  const [selected, setSelected] = useState<string>(
    todayISO >= from && todayISO <= to ? todayISO : from,
  );
  const days = buildHeatmapDays(logs, from, to, todayISO);

  const colorOf = (kind: string | null, code: string | null): SubjectColorKey => {
    if (!kind || !code) return "slate";
    const key = `${kind}:${code}`;
    const override = colorOverrides[key];
    return override && override in SUBJECT_COLOR_CLASS
      ? (override as SubjectColorKey)
      : defaultColorFor(kind, code);
  };

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {/* 날짜 선택은 화면 안에서 — 상세로 나가는 링크는 요약 아래에 따로 둔다.
          (누르자마자 이동하면 일간 요약을 볼 수가 없다) */}
      <MonthHeatmap
        days={days}
        monthLabel={`${Number(from.slice(5, 7))}월`}
        prevHref={prevHref}
        nextHref={nextHref}
        selectedDate={selected}
        onSelectDate={setSelected}
      />
      <div>
        <PeriodTabs logs={logs} anchorDate={selected} colorOf={colorOf} />
        {dayHref ? (
          <Link
            to={dayHref(selected)}
            className="text-link mt-3 inline-block text-xs hover:underline"
          >
            {selected} 기록 보기 →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
