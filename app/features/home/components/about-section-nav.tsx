// 리담안내 섹션 공용 서브내비 — 인사말 · 강사진 · 찾아오시는 길.
// 세 페이지(/about · /about/instructors · /location)가 공유해 통일감·고정(sticky) 유지.
// 사이트 헤더(h-14 sticky top-0) 바로 아래에 붙도록 top-14.
import { Link, useLocation } from "react-router";

import { cn } from "~/core/lib/utils";

const TABS = [
  { to: "/about", label: "인사말" },
  { to: "/about/instructors", label: "강사진" },
  { to: "/location", label: "찾아오시는 길" },
] as const;

function isActive(pathname: string, to: string): boolean {
  if (to === "/about") return pathname === "/about";
  return pathname === to || pathname.startsWith(to + "/");
}

export function AboutSectionNav() {
  const { pathname } = useLocation();
  return (
    <nav className="border-border bg-background/85 sticky top-14 z-30 border-b backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-3xl items-center justify-center gap-1.5 px-4 py-2.5">
        {TABS.map((t) => {
          const active = isActive(pathname, t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
