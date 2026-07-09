// 강의 플랫폼 상단 네비 — 평면 링크 + "마이페이지" hover 드롭다운(학습 플랫폼 flyout 과 동일 UX).
// 데스크톱=드롭다운, 모바일=자식 노드 평탄화(가로 스크롤).
import { ChevronDownIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router";

import { cn } from "~/core/lib/utils";
import {
  LECTURE_NAV_LINKS,
  childMatchesPath,
  type LectureNavItem,
} from "~/core/lib/platforms";

const itemCls = (active: boolean) =>
  cn(
    // 한 줄 유지 — 항목 폭을 학습 플랫폼처럼 촘촘히(px-2.5, whitespace-nowrap).
    "inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-accent text-foreground"
      : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
  );

function Dropdown({ item }: { item: LectureNavItem }) {
  const { pathname } = useLocation();
  const active = (item.children ?? []).some((c) =>
    childMatchesPath(c.to, pathname),
  );
  return (
    <div className="group relative flex h-full items-center">
      <button type="button" className={itemCls(active)} aria-haspopup="menu">
        {item.label}
        <ChevronDownIcon className="size-3.5 opacity-70 transition-transform group-hover:rotate-180" />
      </button>
      {/* pt-2 브릿지로 트리거-패널 사이 hover 유지 */}
      <div className="invisible absolute right-0 top-full z-50 pt-2 opacity-0 transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="border-border bg-popover min-w-[176px] rounded-xl border p-1.5 shadow-lg">
          {item.children!.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              end={c.to === "/lecture"}
              className={({ isActive }) =>
                cn(
                  "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )
              }
            >
              {c.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

// 데스크톱 — 평면 링크 + 마이페이지 드롭다운.
export function LectureNav({ isStaff }: { isStaff: boolean }) {
  return (
    <nav className="hidden h-full items-center gap-0.5 md:flex">
        {LECTURE_NAV_LINKS.map((l) =>
          l.children ? (
            <Dropdown key={l.label} item={l} />
          ) : (
            <NavLink
              key={l.to}
              to={l.to!}
              className={({ isActive }) => itemCls(isActive)}
            >
              {l.label}
            </NavLink>
          ),
        )}
        {isStaff ? (
          <NavLink to="/admin" className={({ isActive }) => itemCls(isActive)}>
            운영관리
          </NavLink>
        ) : null}
      </nav>
  );
}

// 모바일 — 자식 노드 평탄화(가로 스크롤). 상단 바 아래 별도 행.
export function LectureNavMobile({ isStaff }: { isStaff: boolean }) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-t border-black/[0.04] px-4 py-1.5 md:hidden dark:border-white/[0.04]">
      {LECTURE_NAV_LINKS.flatMap((l) =>
        l.children ? l.children.slice() : [{ label: l.label, to: l.to! }],
      ).map((c) => (
        <NavLink
          key={c.to}
          to={c.to}
          end={c.to === "/lecture"}
          className={({ isActive }) =>
            cn(
              "rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
              isActive ? "bg-accent text-foreground" : "text-muted-foreground",
            )
          }
        >
          {c.label}
        </NavLink>
      ))}
      {isStaff ? (
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            cn(
              "rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
              isActive ? "bg-accent text-foreground" : "text-muted-foreground",
            )
          }
        >
          운영관리
        </NavLink>
      ) : null}
    </nav>
  );
}
