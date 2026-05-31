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
}

function isActive(pathname: string, item: SectionTabItem): boolean {
  if (item.match && item.match.length > 0) {
    return item.match.some(
      (m) => pathname === m || pathname.startsWith(`${m}/`),
    );
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
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
}: {
  ariaLabel: string;
  items: SectionTabItem[];
  sticky?: boolean;
}) {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "bg-card border-b border-border -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8",
        sticky && "sticky top-0 z-10",
      )}
    >
      <div className="mx-auto flex max-w-screen-xl gap-1 overflow-x-auto py-2">
        {items.map((t) => {
          const active = isActive(pathname, t);
          const Icon = t.icon;
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
    </nav>
  );
}
