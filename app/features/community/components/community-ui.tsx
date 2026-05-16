// 커뮤니티 영역 공통 UI 프리미티브 — 키트 lidam-community/lib.jsx · Shell.jsx 기반.
// Chip · StatTile · NewBadge · Section · Bar · EmptyState 등을 13 화면이 공유.

import type { ComponentType, ReactNode } from "react";

import { cn } from "~/core/lib/utils";

/* ── Chip ─────────────────────────────────────────────────────────────── */

type ChipTone =
  | "neutral"
  | "primary"
  | "emerald"
  | "coral"
  | "amber"
  | "violet"
  | "solid"
  | "outline";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "bg-muted text-foreground/80",
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  coral: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  solid: "bg-primary text-primary-foreground",
  outline: "border-border text-muted-foreground border bg-transparent",
};

export function Chip({
  tone = "neutral",
  className,
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap",
        CHIP_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// 최근 항목 표시 — 작은 에메랄드 pill.
export function NewBadge({ children = "NEW" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded-full bg-emerald-500 px-1.5 font-mono text-[10px] font-bold tracking-[0.06em] text-white">
      {children}
    </span>
  );
}

/* ── StatTile — KPI 타일 ──────────────────────────────────────────────── */

const STAT_TONE: Record<string, string> = {
  primary: "text-primary",
  coral: "text-rose-600 dark:text-rose-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-700 dark:text-amber-400",
};

export function StatTile({
  label,
  value,
  sub,
  tone,
  emph,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "primary" | "coral" | "emerald" | "amber";
  /** 강조 타일 — primary tint 배경. */
  emph?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        emph
          ? "border-primary/15 bg-primary/[0.07]"
          : "border-border bg-card",
      )}
    >
      <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-2xl font-extrabold tracking-tight tabular-nums",
          tone ? STAT_TONE[tone] : "text-foreground",
        )}
      >
        {value}
      </p>
      {sub ? (
        <p className="text-muted-foreground mt-1 text-xs">{sub}</p>
      ) : null}
    </div>
  );
}

/* ── Section — eyebrow + 우측 슬롯 ────────────────────────────────────── */

export function Section({
  eyebrow,
  right,
  className,
  children,
}: {
  eyebrow: ReactNode;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("mt-6", className)}>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          {eyebrow}
        </p>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ── Bar — div 기반 막대 (rubric 점수·z-score 시각화) ─────────────────── */

export function Bar({
  value,
  max = 100,
  tone = "primary",
  className,
}: {
  value: number;
  max?: number;
  tone?: "primary" | "auto" | "emerald" | "coral" | "amber";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  let fill = "bg-primary";
  if (tone === "auto")
    fill =
      pct < 50 ? "bg-rose-500" : pct < 70 ? "bg-amber-500" : "bg-emerald-500";
  else if (tone === "emerald") fill = "bg-emerald-500";
  else if (tone === "coral") fill = "bg-rose-500";
  else if (tone === "amber") fill = "bg-amber-500";
  return (
    <div className={cn("bg-muted h-1.5 overflow-hidden rounded-full", className)}>
      <div
        className={cn("h-full rounded-full transition-[width]", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ── EmptyState ───────────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  tone = "neutral",
  title,
  body,
  cta,
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: "neutral" | "subdued" | "celebrate";
  title: string;
  body: string;
  cta?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center gap-2.5 rounded-2xl border border-dashed px-8 py-14 text-center",
        tone === "celebrate" ? "bg-emerald-500/[0.06]" : "bg-muted/40",
      )}
    >
      <span
        className={cn(
          "bg-background mb-1 inline-flex size-14 items-center justify-center rounded-2xl",
          tone === "celebrate"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "subdued"
              ? "text-muted-foreground"
              : "text-primary",
        )}
      >
        <Icon className="size-7" />
      </span>
      <div className="text-base font-bold tracking-tight">{title}</div>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        {body}
      </p>
      {cta}
    </div>
  );
}

/* ── 상대 시각 ────────────────────────────────────────────────────────── */

// ISO/날짜 문자열 → "오늘" / "3일 전" / "2주 전" …
export function relativeKo(value: string | null | undefined): string {
  if (!value) return "";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return value;
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  if (day < 365) return `${Math.floor(day / 30)}개월 전`;
  return `${Math.floor(day / 365)}년 전`;
}
