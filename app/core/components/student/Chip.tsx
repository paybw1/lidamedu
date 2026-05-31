// 의미 단위 작은 라벨 — count chip / tag / 상태 표시 공용.
// shadcn `Badge` 보다 더 조용한 톤 (학생 화면 다발 배치 대비).

import type { ReactNode } from "react";

import { cn } from "~/core/lib/utils";

export type ChipTone =
  | "neutral"
  | "primary"
  | "positive"
  | "warn"
  | "danger"
  | "info";

const TONE_CLS: Record<ChipTone, string> = {
  neutral: "bg-muted text-ink-soft border-border",
  primary: "bg-secondary text-secondary-foreground border-secondary",
  positive:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  warn: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  danger:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
};

export function Chip({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: ChipTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE_CLS[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
