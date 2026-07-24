// 학생 모바일 하단탭 — md 미만에서만 표시.
//
// 5탭: 핵심 4 + "더보기"
//   - 핵심: useNavLayout().core (today/review/subjects/aids 디폴트)
//   - 더보기: 시트로 secondary + flat 펼침
//
// 학습과목 탭은 1차/2차 칩 그리드를 시트 안에서 펼침.
// 토글 데스크톱 사이드바와 별개 — 모바일은 통일.

import {
  BellIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  HomeIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { Sheet, SheetContent, SheetTitle } from "~/core/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "~/core/components/ui/avatar";
import { openCommandPalette } from "~/core/components/command-palette";
import ThemeSwitcher from "~/core/components/theme-switcher";
import {
  SUBJECT_NAV_ITEMS,
  subjectSlugFromHref,
} from "~/core/lib/subject-groups";
import { cn } from "~/core/lib/utils";
import {
  FLAT_ADMIN,
  FLAT_HOME,
  LOCKED_DIM_CLASS,
  LOCKED_HINT,
  MOBILE_TAB_LABELS,
  type NavGroupId,
  isAreaLocked,
  isNavActive,
  isSubjectLocked,
  pickActiveLinkTo,
  subjectLockedHint,
  useNavLayout,
} from "~/core/lib/nav-groups";

type BottomBarUser = {
  name: string;
  email?: string;
  avatarUrl?: string | null;
};

export function StudentBottomBar({
  isStaff,
  gradeStaff,
  inboxUnread = 0,
  inboxHref = "/inbox",
  user,
  collapsed = false,
  onToggleCollapse,
  features,
  subjects,
  staffPreparing,
}: {
  isStaff: boolean;
  // 잠금(dim) 판정용 — 등급 리졸버 기준(체험 모드 반영). 미전달 시 isStaff 폴백.
  gradeStaff?: boolean;
  // 상단 바를 모바일에서 숨기므로 알림/계정/검색/테마를 하단 더보기로 흡수.
  inboxUnread?: number;
  inboxHref?: string;
  user?: BottomBarUser;
  // 공부 화면 확대용 — 접으면 탭을 숨기고 핸들만 남긴다(상태는 레이아웃 소유).
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  // feat-8-008 — 구독/cohort 영역 플래그. 잠금 흐림(dim) 시각표시용(상단바·사이드바와 동일).
  features?: string[];
  // feat-8-027 — 학습과목 열람 가능 과목('all' | slug[]). 미허용 과목은 시트에서 비활성.
  subjects?: "all" | string[];
  // feat-7-041 — 준비 중 과목의 staff 접근 목록. admin/manager='all', instructor=담당 과목만.
  staffPreparing?: "all" | string[];
}) {
  // 잠금·staffOnly 항목 판정은 등급 기준(원장 체험 모드 반영) — 운영관리 링크 노출은 역할(isStaff) 기준 유지.
  const lockStaff = gradeStaff ?? isStaff;
  const { core, secondary } = useNavLayout(lockStaff, features);
  // feat-8-008 — 영역 잠금 흐림(dim) 일관 적용. 서버 영역 게이트가 권위, 시각 힌트만.
  const lockOf = (area?: string) => isAreaLocked(area, lockStaff, features);
  const location = useLocation();
  const path = location.pathname;
  const search = location.search;
  const [sheetTab, setSheetTab] = useState<string | null>(null);

  const close = () => setSheetTab(null);
  // ★링크 클릭 시 시트를 '즉시' 닫으면(setState) Radix Sheet 언마운트가 React Router 내비게이션과
  //   같은 클릭에서 경합해, iOS 모바일에서 이동이 씹히거나 body 스크롤락이 남아 목적 페이지가
  //   먹통처럼 보인다(인박스가 '안 열림'). 닫기를 다음 프레임으로 미뤄 내비게이션이 먼저
  //   처리되게 하고, 시트는 마운트된 채 정상 닫힘 정리(스크롤락 해제)를 거치게 한다.
  const deferClose = () => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(close);
    else close();
  };
  const open = sheetTab !== null;
  // 경로가 바뀌면(내비게이션 성공) 시트를 확실히 닫는다 — deferClose 가 누락돼도 안전.
  useEffect(() => {
    setSheetTab(null);
  }, [path, search]);

  // 스크롤 내릴 때 자동으로 바를 미끄러뜨려 숨김(공부 화면 확대), 올릴 때 다시
  // 노출. 최상단 부근·시트 열림 중에는 항상 노출. 수동 접기 상태와 독립.
  const [autoHidden, setAutoHidden] = useState(false);
  useEffect(() => {
    if (open) {
      setAutoHidden(false);
      return;
    }
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (Math.abs(delta) < 8) return; // 미세 흔들림 무시
      if (y < 48) setAutoHidden(false); // 최상단 부근은 항상 노출
      else setAutoHidden(delta > 0); // 내리면 숨김 · 올리면 노출
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  const tabs = [
    ...core.map((g) => ({
      id: g.id,
      label: MOBILE_TAB_LABELS[g.id as NavGroupId] ?? g.label,
      Icon: g.Icon,
      locked: lockOf(g.area),
    })),
    { id: "more", label: "더보기", Icon: MoreHorizontalIcon, locked: false },
  ];

  // active 탭 결정: 현재 path 가 어느 그룹에 속하는지.
  let activeTabId: string | null = null;
  for (const g of core) {
    if (g.id === "subjects") {
      const subjActive = SUBJECT_NAV_ITEMS.some((i) =>
        isNavActive(i.href, path, search),
      );
      if (subjActive) activeTabId = "subjects";
    } else if (g.items.some((i) => isNavActive(i.to, path, search))) {
      activeTabId = g.id;
    }
  }
  if (!activeTabId) {
    if (isNavActive(FLAT_HOME.to, path, search)) activeTabId = "home";
    else if (secondary.some((g) => g.items.some((i) => isNavActive(i.to, path, search))))
      activeTabId = "more";
  }

  const onTabClick = (tabId: string) => {
    if (tabId === "more") setSheetTab("more");
    else if (tabId === "subjects") setSheetTab("subjects");
    else {
      const g = core.find((x) => x.id === tabId);
      if (g && g.items.length === 1) return; // Link 가 처리
      if (g) setSheetTab(tabId);
    }
  };

  return (
    <>
      <nav
        data-testid="student-bottombar"
        className={cn(
          "border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t transition-transform duration-300 ease-out md:hidden print:hidden",
          autoHidden && "translate-y-full",
        )}
      >
        {/* 접기/펴기 핸들 — 공부 화면 확대용. 접으면 탭이 숨고 이 핸들만 남는다. */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
          aria-expanded={!collapsed}
          className="text-muted-foreground hover:text-foreground relative flex h-7 w-full items-center justify-center gap-1"
        >
          {collapsed ? (
            <>
              <ChevronUpIcon className="size-4" />
              <span className="text-[11px] font-medium">메뉴</span>
              {inboxUnread > 0 ? (
                <span className="ml-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white tabular-nums">
                  {inboxUnread > 9 ? "9+" : inboxUnread}
                </span>
              ) : null}
            </>
          ) : (
            <ChevronDownIcon className="size-4" />
          )}
        </button>
        <div className={cn("grid grid-cols-5", collapsed && "hidden")}>
          {tabs.map((t) => {
            const Icon = t.Icon;
            const active = activeTabId === t.id;
            // 단일 link 그룹(today 등)은 직접 Link 처리.
            const g = core.find((x) => x.id === t.id);
            const isDirectLink = g && g.items.length === 1 && t.id !== "subjects";
            const directTo = isDirectLink ? g.items[0].to : null;

            // 더보기 탭에 미읽음 알림 dot — 상단 알림 배지를 대체.
            const showDot = t.id === "more" && inboxUnread > 0;
            const content = (
              <>
                <span className="relative">
                  <Icon className="size-5" />
                  {showDot ? (
                    <span className="absolute -top-1 -right-1.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white tabular-nums">
                      {inboxUnread > 9 ? "9+" : inboxUnread}
                    </span>
                  ) : null}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[10px]">
                  {t.label}
                </span>
              </>
            );
            const cls = cn(
              "flex flex-col items-center gap-0.5 py-2 transition-colors",
              active
                ? "text-link"
                : "text-muted-foreground hover:text-foreground",
              t.locked && LOCKED_DIM_CLASS,
            );
            return directTo ? (
              <Link
                key={t.id}
                to={directTo}
                viewTransition
                prefetch="intent"
                className={cls}
                title={t.locked ? LOCKED_HINT : undefined}
              >
                {content}
              </Link>
            ) : (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabClick(t.id)}
                className={cls}
                title={t.locked ? LOCKED_HINT : undefined}
              >
                {content}
              </button>
            );
          })}
        </div>
        {/* iOS safe-area */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      {/* 시트 — 탭별 펼침 */}
      <Sheet open={open} onOpenChange={(v) => !v && close()}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-t p-0 md:hidden"
        >
          <SheetTitle className="sr-only">
            {sheetTab === "more"
              ? "더보기"
              : sheetTab === "subjects"
                ? "학습과목"
                : core.find((g) => g.id === sheetTab)?.label ?? "메뉴"}
          </SheetTitle>
          <div className="max-h-[70vh] overflow-y-auto p-4">
            {sheetTab === "more" ? (
              <MoreSheet
                isStaff={isStaff}
                onPick={deferClose}
                secondary={secondary}
                inboxUnread={inboxUnread}
                inboxHref={inboxHref}
                user={user}
                lockOf={lockOf}
              />
            ) : sheetTab === "subjects" ? (
              <SubjectsSheet
                onPick={deferClose}
                path={path}
                search={search}
                locked={lockOf(core.find((g) => g.id === "subjects")?.area)}
                isStaff={lockStaff}
                subjects={subjects}
                staffPreparing={staffPreparing}
              />
            ) : sheetTab ? (
              <GroupSheet
                tabId={sheetTab}
                onPick={deferClose}
                core={core}
                path={path}
                search={search}
                lockOf={lockOf}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function GroupSheet({
  tabId,
  onPick,
  core,
  path,
  search,
  lockOf,
}: {
  tabId: string;
  onPick: () => void;
  core: ReturnType<typeof useNavLayout>["core"];
  path: string;
  search: string;
  lockOf: (area?: string) => boolean;
}) {
  const g = core.find((x) => x.id === tabId);
  if (!g) return null;
  const locked = lockOf(g.area);
  return (
    <div>
      <p
        className={cn("mb-2 text-sm font-bold", locked && LOCKED_DIM_CLASS)}
        title={locked ? LOCKED_HINT : undefined}
      >
        {g.label}
      </p>
      <div className="flex flex-col gap-0.5">
        {(() => {
          const activeTo = pickActiveLinkTo(g.items, path, search);
          return g.items.map((it) => {
            const active = it.to === activeTo;
            return (
            <Link
              key={it.to}
              to={it.to}
              viewTransition
              prefetch="intent"
              onClick={onPick}
              className={cn(
                "rounded-md px-3 py-2 text-sm",
                active ? "bg-primary/10 text-link font-semibold" : "hover:bg-muted",
              )}
            >
              {it.label}
            </Link>
            );
          });
        })()}
      </div>
    </div>
  );
}

function SubjectsSheet({
  onPick,
  path,
  search,
  locked,
  isStaff = false,
  subjects,
  staffPreparing,
}: {
  onPick: () => void;
  path: string;
  search: string;
  locked?: boolean;
  isStaff?: boolean;
  subjects?: "all" | string[];
  staffPreparing?: "all" | string[];
}) {
  return (
    <div>
      <p
        className={cn("mb-3 text-sm font-bold", locked && LOCKED_DIM_CLASS)}
        title={locked ? LOCKED_HINT : undefined}
      >
        학습과목
      </p>
      {/* 1/2차 구분 없는 평면 6과목. 권한 없는·준비 중 과목은 비활성(클릭 불가). */}
      <div className="flex flex-wrap gap-1.5">
        {SUBJECT_NAV_ITEMS.map((item) => {
          const active = isNavActive(item.href, path, search);
          const slug = subjectSlugFromHref(item.href);
          if (isSubjectLocked(slug, isStaff, subjects, staffPreparing)) {
            return (
              <span
                key={item.href}
                title={subjectLockedHint(slug, isStaff)}
                aria-disabled="true"
                className={cn(
                  "border-border bg-muted/30 rounded-md border px-2.5 py-1 text-xs",
                  LOCKED_DIM_CLASS,
                )}
              >
                {item.name}
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              to={item.href}
              viewTransition
              prefetch="intent"
              onClick={onPick}
              className={cn(
                "border-border rounded-md border px-2.5 py-1 text-xs",
                active
                  ? "bg-primary/10 text-link border-primary font-semibold"
                  : "bg-muted/30 hover:border-primary hover:text-link",
              )}
            >
              {item.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function MoreSheet({
  isStaff,
  onPick,
  secondary,
  inboxUnread,
  inboxHref,
  user,
  lockOf,
}: {
  isStaff: boolean;
  onPick: () => void;
  secondary: ReturnType<typeof useNavLayout>["secondary"];
  inboxUnread: number;
  inboxHref: string;
  user?: BottomBarUser;
  lockOf: (area?: string) => boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold">더보기</p>

      {/* 상단 바에서 이전된 도구 — 검색 · 알림 · 테마 */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onPick();
            openCommandPalette();
          }}
          className="border-border hover:bg-muted flex h-9 flex-1 items-center gap-2 rounded-lg border px-3 text-sm"
        >
          <SearchIcon className="size-4" /> 검색
          <kbd className="bg-muted ml-auto rounded border px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
        <Link
          to={inboxHref}
          onClick={onPick}
          aria-label={`알림 (미읽음 ${inboxUnread})`}
          className="border-border hover:bg-muted relative inline-flex size-9 items-center justify-center rounded-lg border"
        >
          <BellIcon className="size-4" />
          {inboxUnread > 0 ? (
            <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white tabular-nums">
              {inboxUnread > 99 ? "99+" : inboxUnread}
            </span>
          ) : null}
        </Link>
        <ThemeSwitcher />
      </div>

      {secondary.map((g) => {
        const locked = lockOf(g.area);
        return (
        <div key={g.id} className="mb-3">
          <p
            className={cn(
              "text-muted-foreground mb-1 text-[11px] font-semibold",
              locked && LOCKED_DIM_CLASS,
            )}
            title={locked ? LOCKED_HINT : undefined}
          >
            {g.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {g.items.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                viewTransition
                prefetch="intent"
                onClick={onPick}
                className="rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                {it.label}
              </Link>
            ))}
          </div>
        </div>
        );
      })}
      <div className="border-border mt-3 border-t pt-3">
        <p className="text-muted-foreground mb-1 text-[11px] font-semibold">
          바로가기
        </p>
        <Link
          to={FLAT_HOME.to}
          onClick={onPick}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
        >
          <HomeIcon className="size-4" /> {FLAT_HOME.label}
        </Link>
        {isStaff ? (
          <Link
            to={FLAT_ADMIN.to}
            onClick={onPick}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <SettingsIcon className="size-4" /> {FLAT_ADMIN.label}
          </Link>
        ) : null}
      </div>

      {/* 계정 — 상단 UserMenu 대체 */}
      {user ? (
        <div className="border-border mt-3 border-t pt-3">
          <div className="mb-1.5 flex items-center gap-2 px-2">
            <Avatar className="size-8 rounded-lg">
              <AvatarImage src={user.avatarUrl ?? undefined} />
              <AvatarFallback>
                <UserIcon className="size-4" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              {user.email ? (
                <p className="text-muted-foreground truncate text-xs">
                  {user.email}
                </p>
              ) : null}
            </div>
          </div>
          <Link
            to="/account/edit"
            onClick={onPick}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <UserIcon className="size-4" /> 내 계정
          </Link>
          <Link
            to="/logout"
            onClick={onPick}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <LogOutIcon className="size-4" /> 로그아웃
          </Link>
        </div>
      ) : null}
    </div>
  );
}
