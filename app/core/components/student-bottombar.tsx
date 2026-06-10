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
import { useState } from "react";
import { Link, useLocation } from "react-router";

import { Sheet, SheetContent, SheetTitle } from "~/core/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "~/core/components/ui/avatar";
import { openCommandPalette } from "~/core/components/command-palette";
import ThemeSwitcher from "~/core/components/theme-switcher";
import { SUBJECT_SECTIONS } from "~/core/lib/subject-groups";
import { cn } from "~/core/lib/utils";
import {
  FLAT_ADMIN,
  FLAT_HOME,
  MOBILE_TAB_LABELS,
  type NavGroupId,
  isNavActive,
  pickActiveLinkTo,
  useNavLayout,
} from "~/core/lib/nav-groups";

type BottomBarUser = {
  name: string;
  email?: string;
  avatarUrl?: string | null;
};

export function StudentBottomBar({
  isStaff,
  inboxUnread = 0,
  inboxHref = "/inbox",
  user,
  collapsed = false,
  onToggleCollapse,
}: {
  isStaff: boolean;
  // 상단 바를 모바일에서 숨기므로 알림/계정/검색/테마를 하단 더보기로 흡수.
  inboxUnread?: number;
  inboxHref?: string;
  user?: BottomBarUser;
  // 공부 화면 확대용 — 접으면 탭을 숨기고 핸들만 남긴다(상태는 레이아웃 소유).
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { core, secondary } = useNavLayout();
  const location = useLocation();
  const path = location.pathname;
  const search = location.search;
  const [sheetTab, setSheetTab] = useState<string | null>(null);

  const close = () => setSheetTab(null);
  const open = sheetTab !== null;

  const tabs = [
    ...core.map((g) => ({
      id: g.id,
      label: MOBILE_TAB_LABELS[g.id as NavGroupId] ?? g.label,
      Icon: g.Icon,
    })),
    { id: "more", label: "더보기", Icon: MoreHorizontalIcon },
  ];

  // active 탭 결정: 현재 path 가 어느 그룹에 속하는지.
  let activeTabId: string | null = null;
  for (const g of core) {
    if (g.id === "subjects") {
      const subjActive = SUBJECT_SECTIONS.some((s) =>
        s.groups.some((gg) =>
          gg.items.some((i) => isNavActive(i.href, path, search)),
        ),
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
        className="border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
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
                <span className="text-[10px]">{t.label}</span>
              </>
            );
            const cls = cn(
              "flex flex-col items-center gap-0.5 py-2 transition-colors",
              active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            );
            return directTo ? (
              <Link
                key={t.id}
                to={directTo}
                viewTransition
                prefetch="intent"
                className={cls}
              >
                {content}
              </Link>
            ) : (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabClick(t.id)}
                className={cls}
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
                onPick={close}
                secondary={secondary}
                inboxUnread={inboxUnread}
                inboxHref={inboxHref}
                user={user}
              />
            ) : sheetTab === "subjects" ? (
              <SubjectsSheet onPick={close} path={path} search={search} />
            ) : sheetTab ? (
              <GroupSheet
                tabId={sheetTab}
                onPick={close}
                core={core}
                path={path}
                search={search}
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
}: {
  tabId: string;
  onPick: () => void;
  core: ReturnType<typeof useNavLayout>["core"];
  path: string;
  search: string;
}) {
  const g = core.find((x) => x.id === tabId);
  if (!g) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-bold">{g.label}</p>
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
                active ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted",
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
}: {
  onPick: () => void;
  path: string;
  search: string;
}) {
  return (
    <div>
      <p className="mb-3 text-sm font-bold">학습과목</p>
      {SUBJECT_SECTIONS.map((section) => (
        <div key={section.exam} className="mb-3">
          <p className="text-primary mb-1.5 text-[10px] font-bold tracking-widest uppercase">
            {section.label}
          </p>
          {section.groups.map((group) => (
            <div key={`${section.exam}-${group.id}`} className="mb-2">
              <p className="text-muted-foreground mb-1 text-[11px] font-semibold">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((item) => {
                  const active = isNavActive(item.href, path, search);
                  return (
                    <Link
                      key={`${section.exam}-${group.id}-${item.href}`}
                      to={item.href}
                      viewTransition
                      prefetch="intent"
                      onClick={onPick}
                      className={cn(
                        "border-border rounded-md border px-2.5 py-1 text-xs",
                        active
                          ? "bg-primary/10 text-primary border-primary font-semibold"
                          : "bg-muted/30 hover:border-primary hover:text-primary",
                      )}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
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
}: {
  isStaff: boolean;
  onPick: () => void;
  secondary: ReturnType<typeof useNavLayout>["secondary"];
  inboxUnread: number;
  inboxHref: string;
  user?: BottomBarUser;
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

      {secondary.map((g) => (
        <div key={g.id} className="mb-3">
          <p className="text-muted-foreground mb-1 text-[11px] font-semibold">
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
      ))}
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
