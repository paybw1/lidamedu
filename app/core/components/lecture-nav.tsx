// 강의 플랫폼 상단 네비 — 평면 링크 + "마이페이지" hover 드롭다운(학습 플랫폼 flyout 과 동일 UX).
// 데스크톱=드롭다운, 모바일=**최상위 항목만** 가로 탭(feat-11-012 P2).
//   ★종전에는 모바일에서 자식을 제자리에 펼쳐 칩이 20개(강사·원장 22개)가 됐다. 그 순서가
//     「리담안내 7개」로 시작해 수강신청이 8번째·도서구입이 9번째로 밀렸고, 400px 화면에서는
//     약 506px 지점이라 **구매 진입점이 첫 화면 밖**이었다. 게다가 리담안내·마이페이지 화면에서는
//     바로 아래 LectureSubNav 가 같은 자식들을 한 줄 더 그려 중복이었다.
//     자식 도달은 LectureSubNav 가 이미 맡고 있다 — 여기서는 펼치지 않는다.
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";

import {
  LECTURE_NAV_LINKS,
  type LectureNavItem,
  childMatchesPath,
  lectureMypageLinks,
} from "~/core/lib/platforms";
import { cn } from "~/core/lib/utils";

/** 마이페이지 자식은 역할에 따라 달라진다(강사·원장에게만 정산현황). */
function navLinksFor(isStaff: boolean): ReadonlyArray<LectureNavItem> {
  return LECTURE_NAV_LINKS.map((l) =>
    l.label === "마이페이지" && l.children
      ? { ...l, children: lectureMypageLinks(isStaff) }
      : l,
  );
}

const itemCls = (active: boolean) =>
  cn(
    // 학습 플랫폼처럼 여유 있는 간격(px-3.5)·글자크기(15px) — 한 줄 유지(whitespace-nowrap).
    "inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-3.5 py-1.5 text-[15px] font-medium transition-colors",
    active ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/60",
  );

function Dropdown({ item }: { item: LectureNavItem }) {
  const { pathname } = useLocation();
  const active = (item.children ?? []).some((c) =>
    childMatchesPath(c.to, pathname),
  );
  // JS 제어 — hover/클릭으로 열고, 항목 클릭·경로 변경 시 닫는다(CSS :hover/:focus-within 은
  // 클릭 후 포커스가 남아 패널이 안 닫히는 문제가 있었다). 닫힘엔 페이드+슬라이드 애니메이션.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  return (
    <div
      className="relative flex h-full items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={itemCls(active)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {item.label}
        <ChevronDownIcon
          className={cn(
            "size-3.5 opacity-70 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {/* pt-2 브릿지로 트리거-패널 사이 hover 유지. opacity/translate 로 열고닫힘 애니메이션. */}
      <div
        aria-hidden={!open}
        className={cn(
          "absolute top-full right-0 z-50 pt-2 transition-all duration-200 ease-out",
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <div className="border-border bg-popover min-w-[176px] rounded-xl border p-1.5 shadow-lg">
          {item.children!.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              end={c.to === "/lecture"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-foreground hover:bg-accent/60",
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
    <nav className="hidden h-full items-center gap-1 md:flex">
      {navLinksFor(isStaff).map((l) =>
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

const chipCls = (active: boolean) =>
  cn(
    "rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
    active ? "bg-accent text-foreground" : "text-foreground",
  );

// 모바일 — 최상위 항목만(가로 탭). 상단 바 아래 별도 행.
export function LectureNavMobile({ isStaff }: { isStaff: boolean }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-t border-black/[0.04] px-4 py-1.5 md:hidden dark:border-white/[0.04]">
      {navLinksFor(isStaff).map((l) => {
        // ★활성 판정은 드롭다운과 **같은 규칙**(childMatchesPath)을 쓴다. 새로 짜면
        //   "/about" vs "/about/instructors", "/lecture" vs "/lecture/*" 예외가 깨진다.
        const to = l.to ?? l.children![0].to;
        const active = l.children
          ? l.children.some((c) => childMatchesPath(c.to, pathname))
          : childMatchesPath(to, pathname);
        return (
          <Link
            key={l.label}
            to={to}
            aria-current={active ? "page" : undefined}
            className={chipCls(active)}
          >
            {l.label}
          </Link>
        );
      })}
      {isStaff ? (
        <NavLink to="/admin" className={({ isActive }) => chipCls(isActive)}>
          운영관리
        </NavLink>
      ) : null}
    </nav>
  );
}
