// feat-6-010 반별 게시판 — 공통 레이아웃. community-shell 의 탭 없는 경량판(뒤로가기 + 헤더 + 우측 슬롯).
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";

export function CohortBoardShell({
  title,
  desc,
  headerRight,
  backLink,
  width = "feed",
  children,
}: {
  title: ReactNode;
  desc?: ReactNode;
  headerRight?: ReactNode;
  backLink?: { to: string; label: string };
  width?: "feed" | "narrow";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 md:py-8",
        width === "narrow" ? "max-w-2xl" : "max-w-3xl",
      )}
    >
      {backLink ? (
        <Link
          to={backLink.to}
          viewTransition
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-[13px] font-medium"
        >
          <ArrowLeftIcon className="size-3.5" /> {backLink.label}
        </Link>
      ) : null}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            반별 게시판
          </p>
          <h1 className="mt-1 text-[22px] leading-tight font-extrabold tracking-tight">
            {title}
          </h1>
          {desc ? (
            <p className="text-muted-foreground mt-1 text-sm">{desc}</p>
          ) : null}
        </div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </header>
      {children}
    </div>
  );
}
