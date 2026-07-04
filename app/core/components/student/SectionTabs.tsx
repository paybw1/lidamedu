// 학습관리·학습지원·학습정보 등 세 영역에서 공유하는 가로 탭바.
// 디자인 시스템 v1 — Notion·Linear 톤. sticky top, border-b, primary 활성.
// count badge / color dot 같은 부가 정보는 옵션으로 지원.
import type { ComponentType, ReactNode } from "react";

import { Link, useLocation } from "react-router";

import { cn } from "~/core/lib/utils";

export interface SectionTabItem {
  /** 고유 키. */
  id: string;
  /** 화면 진입 URL. */
  to: string;
  /** 라벨 텍스트. */
  label: string;
  /** 아이콘 (옵션). */
  icon?: ComponentType<{ className?: string }>;
  /** 활성 매칭 prefix (옵션). 없으면 to 와 정확히 같은 경로만 활성. */
  match?: string[];
  /** 우측 count badge — 본인 보유 항목 수 등 (옵션). */
  count?: number;
  /** 카테고리 dot 색 Tailwind 클래스 (옵션). */
  dotClass?: string;
  /** 베타·잠금 등 라벨 옆 작은 chip (옵션). */
  badge?: ReactNode;
  /** feat-8-027 — 권한 없음 등으로 비활성(클릭 불가·회색) 표시. */
  disabled?: boolean;
  /** 비활성 사유 툴팁. */
  disabledHint?: string;
}

// 한 항목의 매칭 길이 — match prefix(없으면 to) 중 현재 pathname 에 맞는 가장 긴 것의 길이.
// 매칭 없으면 -1. (query 는 비교하지 않음 — pathname prefix 기준.)
function activeMatchLen(pathname: string, item: SectionTabItem): number {
  const targets = item.match && item.match.length > 0 ? item.match : [item.to];
  let best = -1;
  for (const m of targets) {
    if (pathname === m || pathname.startsWith(`${m}/`)) {
      best = Math.max(best, m.length);
    }
  }
  return best;
}

/**
 * 영역 가로 탭바. 화면 본문 최상단 또는 layout 에서 사용.
 *
 * @param ariaLabel  접근성 라벨 (예: "학습관리").
 * @param items      탭 항목 배열.
 * @param sticky     top sticky 동작 (default true). 모바일 가로 스크롤 가능.
 */
export function SectionTabs({
  ariaLabel,
  items,
  sticky = true,
  rightSlot,
}: {
  ariaLabel: string;
  items: SectionTabItem[];
  sticky?: boolean;
  /** 바 우측 고정 영역(탭 스크롤 밖) — 학습과목 축 칩 등. */
  rightSlot?: ReactNode;
}) {
  const { pathname } = useLocation();
  // 겹치는 prefix 항목(예: /gs vs /gs/issues, /latest/mcq vs /latest/mcq/exams)이
  // 동시에 활성으로 표시되지 않도록 — 가장 긴 매칭 항목 하나만 활성.
  let activeId: string | null = null;
  let activeLen = -1;
  for (const t of items) {
    const len = activeMatchLen(pathname, t);
    if (len > activeLen) {
      activeLen = len;
      activeId = t.id;
    }
  }
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "bg-card border-border -mx-4 border-b px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8",
        // 모바일: 항상 top-0(인증 사용자는 상단 navbar 가 hidden). md+: navigation.layout
        //   이 설정한 --area-sticky-top(topbar=navbar 높이 3.5rem / sidebar=0)만큼 내려
        //   navbar 아래에 고정 — navbar(sticky top-0 z-50)에 가려지지 않게.
        sticky && "sticky top-0 z-10 md:top-[var(--area-sticky-top)]",
      )}
    >
      <div className="mx-auto flex max-w-screen-xl items-center gap-1 py-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {items.map((t) => {
          const active = t.id === activeId;
          const Icon = t.icon;
          // 권한 없는 항목 = 비활성(클릭 불가·회색).
          if (t.disabled) {
            return (
              <span
                key={t.id}
                aria-disabled="true"
                title={t.disabledHint}
                className="text-ink-soft inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium opacity-45"
              >
                {Icon ? <Icon className="size-3.5" /> : null}
                <span>{t.label}</span>
              </span>
            );
          }
          return (
            <Link
              key={t.id}
              to={t.to}
              prefetch="intent"
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-ink-soft hover:bg-surface-3 hover:text-foreground",
              )}
            >
              {Icon ? <Icon className="size-3.5" /> : null}
              {t.dotClass ? (
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", t.dotClass)}
                />
              ) : null}
              <span>{t.label}</span>
              {t.badge ? t.badge : null}
              {typeof t.count === "number" ? (
                <span
                  className={cn(
                    "ml-0.5 inline-flex min-w-[20px] items-center justify-center rounded px-1 text-[10px] font-bold tabular-nums",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-ink-soft",
                  )}
                >
                  {t.count.toLocaleString("ko-KR")}
                </span>
              ) : null}
            </Link>
          );
        })}
        </div>
        {/* 우측 슬롯(축 칩) — 데스크톱은 같은 줄 우측 끝. */}
        {rightSlot ? <div className="hidden lg:block">{rightSlot}</div> : null}
      </div>
      {/* 모바일: 축 칩을 둘째 줄로 내림 — 탭 줄 폭을 뺏지 않는다. */}
      {rightSlot ? (
        <div className="mx-auto max-w-screen-xl overflow-x-auto pb-2 lg:hidden">
          {rightSlot}
        </div>
      ) : null}
    </nav>
  );
}
