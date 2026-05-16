// 학습보조 결과 리스트 공용 — 필터 바, 세션 CTA, 결과 카드, 빈 상태.
// 키트 lidam-study-aids/Common.jsx 디자인.

import {
  ArrowRightIcon,
  PlayIcon,
  RotateCcwIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Form, Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { LAW_SUBJECTS, LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

type ContentType =
  | "article"
  | "case"
  | "problem"
  | "problem_choice"
  | "problem_box_item";

// CardHeaderRow / TypeBadge 가 받는 타입 — DB target type 또는 정규화된 "ox".
type DisplayType = ContentType | "ox";

const TYPE_META: Record<
  "article" | "case" | "problem" | "ox",
  { label: string; cls: string }
> = {
  article: { label: "조문", cls: "bg-primary/10 text-primary" },
  case: {
    label: "판례",
    cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  problem: {
    label: "문제",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  ox: { label: "OX", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
};

function normalizeType(
  t: DisplayType,
): "article" | "case" | "problem" | "ox" {
  return t === "problem_choice" || t === "problem_box_item" ? "ox" : t;
}

// lawCode → 과목명. 법률 과목이 아니면 null.
export function subjectName(code: string | null | undefined): string | null {
  if (!code) return null;
  if ((LAW_SUBJECT_SLUGS as readonly string[]).includes(code)) {
    return LAW_SUBJECTS[code as keyof typeof LAW_SUBJECTS].name;
  }
  return null;
}

export function TypeBadge({ type }: { type: DisplayType }) {
  const m = TYPE_META[normalizeType(type)];
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-semibold",
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
}

// 필터 바 — 검색 + chip. 클릭 즉시 반영, [적용] 버튼 없음 (brief §5.4).
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
  children: ReactNode;
}) {
  return (
    <div className="border-border bg-card mb-3.5 flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm">
      {search ? (
        <div className="relative min-w-[200px] flex-1 basis-[220px] sm:max-w-[320px]">
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
          <RotateCcwIcon className="size-3" />
          초기화
        </button>
      ) : null}
    </div>
  );
}

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

export function FilterDivider() {
  return (
    <span
      aria-hidden
      className="bg-border mx-0.5 hidden h-[18px] w-px self-center sm:inline-block"
    />
  );
}

export function FilterChip({
  selected,
  onClick,
  children,
  tone = "neutral",
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: "neutral" | "amber";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : tone === "amber"
            ? "border-transparent bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
            : "border-border bg-muted/40 text-foreground hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

// 묶어 풀기 세션 CTA — 실제 <Form> POST (오답노트·즐겨찾기).
export function SessionBanner({
  action,
  count,
  hint,
  hidden,
  testidPrefix,
}: {
  action: string;
  count: number;
  hint: string;
  hidden?: ReactNode;
  testidPrefix: string;
}) {
  return (
    <Form
      method="post"
      action={action}
      className="border-primary/15 bg-primary/[0.07] mb-3.5 grid grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-2xl border px-[18px] py-3.5 max-[560px]:grid-cols-1"
    >
      {hidden}
      <span className="bg-primary text-primary-foreground inline-flex size-10 items-center justify-center rounded-xl">
        <PlayIcon className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-bold tracking-tight">
          <span className="tabular-nums">{count.toLocaleString("ko-KR")}</span>
          건을 한 세션으로 묶어 풀기
        </div>
        <div className="text-muted-foreground mt-0.5 text-xs">{hint}</div>
      </div>
      <div className="flex gap-2 max-[560px]:justify-end">
        <Button
          type="submit"
          name="mode"
          value="study"
          size="sm"
          variant="outline"
          className="h-9 rounded-full"
          data-testid={`${testidPrefix}-study`}
        >
          학습 모드
        </Button>
        <Button
          type="submit"
          name="mode"
          value="exam"
          size="sm"
          className="h-9 rounded-full"
          data-testid={`${testidPrefix}-exam`}
        >
          시험 모드
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </div>
    </Form>
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

// 결과 카드 — 카드 전체가 원문 viewer 로 가는 링크.
export function ResultCard({
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

// 카드 헤더 행 — 타입 배지 + 과목 + 부가 라벨 + 우측 메타.
export function CardHeaderRow({
  type,
  lawName,
  secondary,
  right,
}: {
  type: DisplayType;
  lawName?: string | null;
  secondary?: string | null;
  right?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-2">
      <TypeBadge type={type} />
      {lawName ? (
        <span className="text-muted-foreground text-xs font-semibold">
          {lawName}
        </span>
      ) : null}
      {secondary ? (
        <>
          <span aria-hidden className="text-muted-foreground/40">
            ·
          </span>
          <span className="text-muted-foreground text-xs">{secondary}</span>
        </>
      ) : null}
      {right ? (
        <div className="ml-auto inline-flex items-center gap-2">{right}</div>
      ) : null}
    </div>
  );
}

export function CardCta({ label }: { label: string }) {
  return (
    <div className="border-border/60 mt-2.5 flex justify-end border-t pt-2">
      <span className="text-primary inline-flex items-center gap-1 text-xs font-semibold">
        {label}
        <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </div>
  );
}

// 별점 5칸 바 — 즐겨찾기 카드.
export function StarBar({ level }: { level: number }) {
  const n = Math.max(0, Math.min(5, level));
  return (
    <span
      className="inline-flex gap-0.5"
      title={`별점 ${n}/5`}
      aria-label={`별점 ${n} / 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon
          key={i}
          className={cn(
            "size-3.5",
            i <= n
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30 fill-transparent",
          )}
        />
      ))}
    </span>
  );
}

// 섹션 제목 — 오답노트의 객관식 / OX 2섹션.
export function SectionTitle({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <div className="mt-[22px] mb-2.5 flex items-baseline gap-2">
      <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
      <span className="text-muted-foreground font-mono text-[11px] font-bold tabular-nums">
        {count}건
      </span>
    </div>
  );
}

// 빈 상태 — 0건(celebrate/neutral) vs 필터 0건(subdued) 카피 구분.
export function EmptyState({
  icon: Icon,
  tone,
  title,
  body,
  cta,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: "celebrate" | "subdued" | "neutral";
  title: string;
  body: string;
  cta?: { label: string; to: string };
}) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center gap-2.5 rounded-2xl border border-dashed px-8 text-center",
        tone === "subdued" ? "py-10" : "py-16",
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
      {cta ? (
        <Button asChild className="mt-2 rounded-full">
          <Link to={cta.to}>
            {cta.label}
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

// ISO 시각 → 상대 시간 ("방금 전" / "N분 전" / "N일 전" …).
export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}개월 전`;
  return `${Math.floor(mo / 12)}년 전`;
}
