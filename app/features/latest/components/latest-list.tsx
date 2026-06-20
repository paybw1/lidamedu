// 학습정보 공통 리스트 패턴 — 필터 폼, 피드 카드, 색인 테이블, 페이지네이션, 빈 상태.
// 키트 lidam-latest/Common.jsx 디자인. brief §5.4~5.9.

import { ArrowRightIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Form, Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";

/* ── 필터 바 (GET 폼) ─────────────────────────────────────────────────── */

// 통일된 한 줄 필터 바 — 검색 + 컨트롤 + 적용 + 초기화 (brief §5.4).
// 페이지네이션 화면도 공유하므로 GET <Form> 을 유지하되 시각만 통일.
export function LatestFilterForm({
  search,
  hasActive,
  resetTo,
  children,
}: {
  search?: { name: string; placeholder: string; defaultValue: string };
  hasActive: boolean;
  resetTo: string;
  children: ReactNode;
}) {
  return (
    <Form
      method="get"
      className="border-border bg-card mb-3.5 flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm"
    >
      {search ? (
        <div className="relative min-w-[200px] flex-1 basis-[240px] sm:max-w-[320px]">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <input
            type="search"
            name={search.name}
            defaultValue={search.defaultValue}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            className="bg-muted/60 focus:bg-background focus:border-primary h-9 w-full rounded-full border border-transparent pr-3 pl-9 text-[13px] outline-none"
          />
        </div>
      ) : null}
      {children}
      <Button type="submit" size="sm" className="h-9 rounded-full">
        적용
      </Button>
      {hasActive ? (
        <Button
          asChild
          type="button"
          size="sm"
          variant="ghost"
          className="text-link ml-auto h-9 rounded-full"
        >
          <Link to={resetTo}>
            <RotateCcwIcon className="size-3" />
            초기화
          </Link>
        </Button>
      ) : null}
    </Form>
  );
}

export function FilterSelect({
  name,
  defaultValue,
  ariaLabel,
  options,
  optionGroups,
}: {
  name: string;
  defaultValue: string;
  ariaLabel: string;
  options: Array<{ value: string; label: string }>;
  // 제공 시 flat options 뒤에 native <optgroup> 으로 묶어 렌더 (예: 1차/2차 과목).
  optionGroups?: Array<{
    label: string;
    options: Array<{ value: string; label: string }>;
  }>;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      className="border-input bg-background focus:border-primary h-9 rounded-full border px-3.5 text-xs outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {optionGroups?.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function FilterCheckbox({
  name,
  defaultChecked,
  children,
}: {
  name: string;
  defaultChecked: boolean;
  children: ReactNode;
}) {
  return (
    <label className="border-input bg-background flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs">
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={defaultChecked}
        className="accent-primary size-3.5"
      />
      {children}
    </label>
  );
}

/* ── 피드 카드 ────────────────────────────────────────────────────────── */

// 카드 전체가 원문 진입점인 경우 (판례·주관식).
export function FeedCardLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      viewTransition
      className="group bg-card border-border hover:border-primary/30 block rounded-xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      {children}
    </Link>
  );
}

// 내부에 액션 버튼이 있는 카드 (논문·추록·정오표).
export function FeedCard({ children }: { children: ReactNode }) {
  return (
    <article className="group bg-card border-border rounded-xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      {children}
    </article>
  );
}

// 카드 헤더 메타 행 — badge 들 + 우측 정렬 날짜.
export function MetaRow({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      {children}
      {right ? (
        <span className="text-muted-foreground ml-auto text-[11px] font-medium tabular-nums">
          {right}
        </span>
      ) : null}
    </div>
  );
}

type PillTone =
  | "neutral"
  | "primary"
  | "emerald"
  | "rose"
  | "amber"
  | "violet"
  | "sky"
  | "brown"
  | "outline";

const PILL_TONE: Record<PillTone, string> = {
  neutral: "bg-muted text-foreground/80",
  primary: "bg-primary text-primary-foreground",
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  brown: "bg-[#8B5A2B]/15 text-[#7A4E26] dark:text-[#C99A6A]",
  outline: "border-border text-muted-foreground border bg-transparent",
};

// 카드·셀 안에서 쓰는 작은 pill badge.
export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap",
        PILL_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// 최근(7일 이내) 등록 항목 표시 (brief §5.6).
export function NewBadge() {
  return (
    <span className="inline-flex h-[18px] items-center rounded-full bg-emerald-500 px-1.5 font-mono text-[10px] font-bold tracking-[0.06em] text-white">
      NEW
    </span>
  );
}

// 카드 하단 진입 cta — "label →".
export function CardCta({ label }: { label: string }) {
  return (
    <div className="border-border/60 mt-2.5 flex justify-end border-t pt-2">
      <span className="text-link inline-flex items-center gap-1 text-xs font-semibold">
        {label}
        <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </div>
  );
}

export function ListStack({
  children,
  testid,
}: {
  children: ReactNode;
  testid?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5" data-testid={testid}>
      {children}
    </div>
  );
}

/* ── 색인 테이블 ──────────────────────────────────────────────────────── */

// 색인 테이블 카드 — R16 카드 안의 가로 스크롤 테이블 (brief §5.5 A).
export function IndexCard({
  children,
  testid,
}: {
  children: ReactNode;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm"
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/* ── 페이지네이션 ─────────────────────────────────────────────────────── */

export function LatestPagination({
  page,
  totalPages,
  makeUrl,
}: {
  page: number;
  totalPages: number;
  makeUrl: (overrides: Record<string, string | null>) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      <Button
        asChild={page > 1}
        variant="outline"
        size="sm"
        disabled={page <= 1}
        className="h-9 rounded-full"
      >
        {page > 1 ? (
          <Link to={makeUrl({ page: String(page - 1) })}>← 이전</Link>
        ) : (
          <span>← 이전</span>
        )}
      </Button>
      <span className="text-muted-foreground px-2 text-xs font-bold tabular-nums">
        {page} / {totalPages}
      </span>
      <Button
        asChild={page < totalPages}
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        className="h-9 rounded-full"
      >
        {page < totalPages ? (
          <Link to={makeUrl({ page: String(page + 1) })}>다음 →</Link>
        ) : (
          <span>다음 →</span>
        )}
      </Button>
    </div>
  );
}

/* ── 빈 상태 ──────────────────────────────────────────────────────────── */

// 빈 상태 — 데이터 0(neutral) vs 필터 0(subdued) 카피 구분 (brief §5.9).
export function LatestEmpty({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: "neutral" | "subdued";
  title: string;
  body: string;
}) {
  return (
    <div className="border-border bg-muted/40 flex flex-col items-center gap-2.5 rounded-2xl border border-dashed px-8 py-14 text-center">
      <span
        className={cn(
          "bg-background mb-1 inline-flex size-14 items-center justify-center rounded-2xl",
          tone === "subdued" ? "text-muted-foreground" : "text-link",
        )}
      >
        <Icon className="size-7" />
      </span>
      <div className="text-base font-bold tracking-tight">{title}</div>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        {body}
      </p>
    </div>
  );
}

/* ── 최신성 표현 ──────────────────────────────────────────────────────── */

// 날짜 문자열(YYYY-MM-DD 또는 ISO) → 상대 시각 ("오늘" / "3일 전" / "2주 전" …).
export function relativeKo(value: string | null | undefined): string {
  if (!value) return "";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return value;
  const dayMs = 86_400_000;
  const diffDays = Math.floor((Date.now() - t) / dayMs);
  if (diffDays <= 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}개월 전`;
  return `${Math.floor(diffDays / 365)}년 전`;
}

// 최근 7일 이내 등록 여부 — NEW 마커 노출 판단.
export function isRecent(value: string | null | undefined): boolean {
  if (!value) return false;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 7 * 86_400_000;
}
