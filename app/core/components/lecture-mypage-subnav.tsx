// 마이페이지 sticky 서브내비 — 상단 드롭다운(LECTURE_MYPAGE_LINKS)과 동일한 6개.
// 강의 레이아웃 헤더(sticky) 안에서 렌더돼 자연스럽게 함께 고정된다. 마이페이지 경로에서만 노출.
import { Link, useLocation } from "react-router";

import { childMatchesPath, LECTURE_MYPAGE_LINKS } from "~/core/lib/platforms";
import { cn } from "~/core/lib/utils";

export function LectureMypageSubNav() {
  const { pathname } = useLocation();
  const onMypage = LECTURE_MYPAGE_LINKS.some((l) =>
    childMatchesPath(l.to, pathname),
  );
  if (!onMypage) return null;
  return (
    <div className="dark:border-border border-t border-black/[0.05]">
      <div className="mx-auto w-full max-w-[1200px] overflow-x-auto px-4 md:px-6">
        <div className="flex w-max items-center gap-1.5 py-2">
          {LECTURE_MYPAGE_LINKS.map((l) => {
            const active = childMatchesPath(l.to, pathname);
            return (
              <Link
                key={l.to}
                to={l.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
