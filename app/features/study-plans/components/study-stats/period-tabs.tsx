// feat-7-048 D7 — 일간/주간/월간 공부시간 요약. 총 시간 + 과목별 스택 바 + 직전 대비.
import { useState } from "react";

import { cn } from "~/core/lib/utils";
import { formatMinutes } from "~/features/study-plans/labels";
import {
  SUBJECT_COLOR_CLASS,
  subjectName,
  type SubjectColorKey,
} from "~/features/study-plans/subject-axis";
import {
  summarize,
  type StatLog,
  type StatPeriod,
} from "~/features/study-plans/lib/study-stats";

const PERIOD_LABEL: Record<StatPeriod, string> = {
  day: "일간",
  week: "주간",
  month: "월간",
};

export function PeriodTabs({
  logs,
  anchorDate,
  colorOf,
}: {
  logs: StatLog[];
  /** 기준 날짜 — 일간은 이 날, 주간은 이 주, 월간은 이 달. */
  anchorDate: string;
  colorOf: (kind: string | null, code: string | null) => SubjectColorKey;
}) {
  const [period, setPeriod] = useState<StatPeriod>("week");
  const s = summarize(logs, period, anchorDate);

  return (
    <div>
      <div className="bg-muted/60 mb-3 inline-flex rounded-lg p-0.5">
        {(Object.keys(PERIOD_LABEL) as StatPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              period === p
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums">
          {formatMinutes(s.minutes)}
        </span>
        {s.deltaMinutes !== null && s.deltaMinutes !== 0 ? (
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              s.deltaMinutes > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400",
            )}
          >
            직전 대비 {s.deltaMinutes > 0 ? "+" : "−"}
            {formatMinutes(Math.abs(s.deltaMinutes))}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
        {s.from === s.to ? s.from : `${s.from} ~ ${s.to}`}
      </p>

      {s.subjects.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-xs">
          이 기간에 기록된 학습이 없습니다.
        </p>
      ) : (
        <>
          {/* 과목별 비중 — 한 줄 스택 바 */}
          <div className="bg-muted mt-3 flex h-2.5 overflow-hidden rounded-full">
            {s.subjects.map((sub) => (
              <span
                key={`${sub.kind}:${sub.code}`}
                className={SUBJECT_COLOR_CLASS[colorOf(sub.kind, sub.code)].fill}
                style={{ width: `${(sub.minutes / s.minutes) * 100}%` }}
                title={`${subjectName(sub.kind, sub.code)} ${formatMinutes(sub.minutes)}`}
              />
            ))}
          </div>
          <ul className="mt-2 space-y-1">
            {s.subjects.map((sub) => (
              <li
                key={`${sub.kind}:${sub.code}`}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    SUBJECT_COLOR_CLASS[colorOf(sub.kind, sub.code)].dot,
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  {subjectName(sub.kind, sub.code)}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {formatMinutes(sub.minutes)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
