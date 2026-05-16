// 운영자 영역 공통 UI 프리미티브 — 키트 lidam-admin/lib.jsx · Shell.jsx 기반.
// Chip · Bar · StatusChip · FilterBar · IndexTable · Field(통일 폼) 등 7 패턴 공유.

import { RefreshCwIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/core/lib/utils";

/* ── Chip ─────────────────────────────────────────────────────────────── */

type ChipTone =
  | "neutral"
  | "blue"
  | "emerald"
  | "coral"
  | "amber"
  | "violet"
  | "solid"
  | "outline";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "bg-muted text-foreground/80",
  blue: "bg-primary/10 text-primary",
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

// DB 상태 문자열 → 의미색 chip (brief §4.3).
export function StatusChip({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  if (["verified", "published", "ok", "done", "completed"].includes(status))
    return <Chip tone="emerald">{label ?? "완료"}</Chip>;
  if (["pending", "review", "warn", "draft"].includes(status))
    return (
      <Chip tone="amber">{label ?? (status === "draft" ? "초안" : "대기")}</Chip>
    );
  if (["unmatched", "missing", "error", "rejected"].includes(status))
    return <Chip tone="coral">{label ?? "미배정"}</Chip>;
  return <Chip tone="neutral">{label ?? status}</Chip>;
}

/* ── Bar — div 기반 분포 막대 ─────────────────────────────────────────── */

// tone="auto" 시 값 비율로 의미색 자동 (정답률 등): <50 코랄 · <70 앰버 · ≥70 에메랄드.
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
    fill = pct < 50 ? "bg-rose-500" : pct < 70 ? "bg-amber-500" : "bg-emerald-500";
  else if (tone === "emerald") fill = "bg-emerald-500";
  else if (tone === "coral") fill = "bg-rose-500";
  else if (tone === "amber") fill = "bg-amber-500";
  return (
    <div
      className={cn(
        "bg-muted h-1.5 overflow-hidden rounded-full",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ── FilterBar — P2/P4/P6 공통 ────────────────────────────────────────── */

export function FilterBar({
  search,
  hasActive,
  onReset,
  children,
}: {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
  };
  hasActive: boolean;
  onReset: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="border-border bg-card mb-3 flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm">
      {search ? (
        <div className="relative min-w-[200px] flex-1 basis-[240px] sm:max-w-[300px]">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <input
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            className="bg-muted/60 focus:bg-background focus:border-primary h-9 w-full rounded-full border border-transparent pr-3 pl-9 text-[13px] outline-none"
          />
        </div>
      ) : null}
      {children}
      {hasActive ? (
        <button
          type="button"
          onClick={onReset}
          className="text-primary ml-auto inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold"
        >
          <RefreshCwIcon className="size-3" />
          초기화
        </button>
      ) : null}
    </div>
  );
}

// 필터 그룹 — 라벨 + 컨트롤.
export function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground text-[11px] font-semibold whitespace-nowrap">
        {label}
      </span>
      <div className="inline-flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

/* ── IndexTable — P2/P4/P6 공통 색인 표 ───────────────────────────────── */

export interface TableHeaderDef {
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
}

export function IndexTable({
  headers,
  children,
  footer,
  minWidth,
  testid,
}: {
  headers: TableHeaderDef[];
  children: ReactNode;
  footer?: ReactNode;
  minWidth?: number;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className="border-border bg-card overflow-hidden rounded-xl border shadow-sm"
    >
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse"
          style={minWidth ? { minWidth } : undefined}
        >
          <thead>
            <tr className="border-border bg-muted/60 border-b">
              {headers.map((h, i) => (
                <th
                  key={i}
                  style={h.width ? { width: h.width } : undefined}
                  className={cn(
                    "text-muted-foreground px-3 py-2.5 font-mono text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
                    h.align === "right"
                      ? "text-right"
                      : h.align === "center"
                        ? "text-center"
                        : "text-left",
                  )}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function TR({
  children,
  onClick,
  active,
  testid,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  testid?: string;
}) {
  return (
    <tr
      data-testid={testid}
      onClick={onClick}
      className={cn(
        "border-border/60 border-b transition-colors last:border-0",
        active ? "bg-primary/[0.04]" : "hover:bg-muted/40",
        onClick ? "cursor-pointer" : undefined,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  align,
  mono,
  soft,
  className,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  soft?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-middle text-[13px] tabular-nums",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
        mono ? "font-mono font-semibold" : "font-medium",
        soft ? "text-muted-foreground" : "text-foreground",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ── 통일 폼 — Field (brief §10.B) ────────────────────────────────────── */

// 라벨 + 필수 표시 + hint/error 를 감싸는 한 벌짜리 폼 필드 래퍼.
// 안쪽 컨트롤은 shadcn Input/Textarea 또는 AdminSelect 를 둔다.
export function Field({
  label,
  required,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="inline-flex items-center gap-0.5 text-xs font-semibold"
        >
          {label}
          {required ? <span className="text-rose-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error || hint ? (
        <p
          className={cn(
            "text-[11px] leading-relaxed",
            error ? "text-rose-600" : "text-muted-foreground",
          )}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}

// 디자인 시스템 톤의 native select — 운영자 폼·필터 공용.
export function AdminSelect({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none",
        className,
      )}
    />
  );
}
