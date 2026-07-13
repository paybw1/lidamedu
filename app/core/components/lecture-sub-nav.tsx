// 강의 레이아웃 sticky 서브내비 — 리담안내/마이페이지 등 하위 링크를 헤더 안에서 노출.
// 헤더(sticky)에 포함돼 함께 고정된다. 현재 경로가 links 중 하나에 해당할 때만 렌더.
import { Link, useLocation } from "react-router";

import { childMatchesPath } from "~/core/lib/platforms";
import { cn } from "~/core/lib/utils";

export function LectureSubNav({
  links,
}: {
  links: ReadonlyArray<{ label: string; to: string }>;
}) {
  const { pathname } = useLocation();
  const onSection = links.some((l) => childMatchesPath(l.to, pathname));
  if (!onSection) return null;
  return (
    <div className="dark:border-border border-t border-black/[0.05]">
      <div className="mx-auto w-full max-w-[1200px] overflow-x-auto px-4 md:px-6">
        <div className="flex w-max items-center gap-1.5 py-2">
          {links.map((l) => {
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
