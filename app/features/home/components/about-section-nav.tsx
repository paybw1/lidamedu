// 리담안내 섹션 공용 서브내비 — 상단 드롭다운(LECTURE_GUIDE_LINKS)과 동일한 6개.
// 세로 페이지들이 공유해 통일감·고정(sticky) 유지. 사이트 헤더(h-14) 바로 아래 top-14.
// 항목이 많아 모바일에서 가로 스크롤(넘치면 스크롤, 맞으면 가운데).
import { Link, useLocation } from "react-router";

import { LECTURE_GUIDE_LINKS } from "~/core/lib/platforms";
import { cn } from "~/core/lib/utils";

function isActive(pathname: string, to: string): boolean {
  if (to === "/about") return pathname === "/about";
  return pathname === to || pathname.startsWith(to + "/");
}

export function AboutSectionNav() {
  const { pathname } = useLocation();
  return (
    <nav className="border-border bg-background/85 sticky top-14 z-30 border-b backdrop-blur print:hidden">
      <div className="overflow-x-auto">
        <div className="mx-auto flex w-max items-center gap-1.5 px-4 py-2.5">
          {LECTURE_GUIDE_LINKS.map((t) => {
            const active = isActive(pathname, t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-colors",
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
      </div>
    </nav>
  );
}
