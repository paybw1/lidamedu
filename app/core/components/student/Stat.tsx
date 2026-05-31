// 단일 지표 표시 — 큰 숫자 + 라벨 + (옵션) delta.
// 대시보드 KPI 스트립·진도 카드의 공용 building block.

import type { ReactNode } from "react";

import { cn } from "~/core/lib/utils";

export type StatTone = "neutral" | "positive" | "warn" | "danger";

interface StatProps {
  /** 라벨 (위). */
  label: string;
  /** 큰 숫자 (가운데). */
  value: ReactNode;
  /** 단위 (값 뒤). */
  unit?: string;
  /** 보조 설명 (아래). */
  hint?: ReactNode;
  /** delta — +12 / -3% 등. tone 으로 색 결정. */
  delta?: ReactNode;
  tone?: StatTone;
  className?: string;
}

const DELTA_TONE: Record<StatTone, string> = {
  neutral: "text-ink-faint",
  positive: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  danger: "text-rose-600 dark:text-rose-400",
};

export function Stat({
  label,
  value,
  unit,
  hint,
  delta,
  tone = "neutral",
  className,
}: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="text-ink-faint text-xs font-medium">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-foreground text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </span>
        {unit ? (
          <span className="text-ink-soft text-sm font-medium">{unit}</span>
        ) : null}
        {delta ? (
          <span className={cn("text-xs font-semibold tabular-nums ml-1", DELTA_TONE[tone])}>
            {delta}
          </span>
        ) : null}
      </div>
      {hint ? <div className="text-ink-faint text-xs">{hint}</div> : null}
    </div>
  );
}
