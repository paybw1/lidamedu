// 학생 데스크톱 사이드바 — A안 아이콘 모드 통합.
//
// 구성:
//   - 헤더: 로고 (접힘=로고만, 펼침=로고+"리담변리사학원") + collapse 토글
//   - 계정 메뉴: 로고 바로 아래 (사용자 menu dropdown)
//   - 본문: 메뉴 (핵심·가끔·관리)
//   - 하단: 검색·인박스·다크모드 (RightTools)
//
// 동작:
//   - 펼침(260px) / 접힘(60px) — localStorage("studentSidebarCollapsed")
//   - 접힘 시 모든 항목 아이콘 + hover flyout
//   - 메뉴 항목 클릭 시 자동 접힘 (사용자 학습 동선 방해 최소)
//   - 모바일(md 미만) 자체 숨김 — StudentBottomBar 가 별도 담당

import { ChevronDownIcon, ChevronRightIcon, PanelTopOpenIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";

import { SUBJECT_SECTIONS } from "~/core/lib/subject-groups";
import { cn } from "~/core/lib/utils";
import {
  FLAT_ADMIN,
  FLAT_HOME,
  type NavGroup,
  isNavActive,
  useNavLayout,
} from "~/core/lib/nav-groups";

import { RightTools, UserMenu } from "./navigation-bar";

const STORAGE_KEY = "studentSidebarCollapsed";

interface StudentSidebarProps {
  isStaff: boolean;
  user: {
    name: string;
    email: string | undefined;
    avatarUrl?: string | null;
  };
  inboxUnread: number | null;
  inboxHref: string | null;
}

export function StudentSidebar({
  isStaff,
  user,
  inboxUnread,
  inboxHref,
}: StudentSidebarProps) {
  const { core, secondary } = useNavLayout();
  const location = useLocation();
  const path = location.pathname;
  const search = location.search;

  // 접힘/펼침 — 초기 false, 클라에서 localStorage 동기화.
  const [collapsed, setCollapsed] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);
  const persistCollapsed = (v: boolean) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    }
  };
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      persistCollapsed(next);
      return next;
    });
  };
  // 항목 클릭 시 자동 접힘 (학습 동선에 방해 최소).
  const collapseAfterPick = () => {
    if (!collapsed) {
      setCollapsed(true);
      persistCollapsed(true);
    }
  };

  // 접힘 상태에서 그룹 아이콘 클릭 → 펼침 + 해당 그룹 자동 open.
  const expandToGroup = (id: string) => {
    setCollapsed(false);
    persistCollapsed(false);
    setOpen((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
  };

  // 상단 nav 모드로 전환 — cookie + localStorage + reload.
  const switchToTopbar = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("studentNavMode", "topbar");
    document.cookie = `studentNavMode=topbar; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    window.location.reload();
  };

  // 그룹 펼침 상태.
  const initialOpen = useMemo(() => {
    const s = new Set<string>(["subjects", "aids"]);
    for (const g of [...core, ...secondary]) {
      if (g.items.some((i) => isNavActive(i.to, path, search))) s.add(g.id);
    }
    return s;
  }, [path, search, core, secondary]);
  const [open, setOpen] = useState<Set<string>>(initialOpen);
  useEffect(() => {
    setOpen((prev) => {
      const next = new Set(prev);
      for (const g of [...core, ...secondary]) {
        if (g.items.some((i) => isNavActive(i.to, path, search))) next.add(g.id);
      }
      return next;
    });
  }, [path, search, core, secondary]);
  const toggleGroup = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside
      data-testid="student-sidebar"
      data-collapsed={collapsed}
      className={cn(
        "border-border bg-card sticky top-0 hidden h-screen shrink-0 overflow-x-hidden overflow-y-auto border-r transition-[width] duration-150 ease-out md:flex md:flex-col",
        collapsed ? "w-[60px]" : "w-[220px]",
      )}
    >
      {/* ── 로고 = 접힘/펼침 토글 ── 별도 토글 바 없음 ── */}
      <div className="border-border flex justify-center border-b p-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          className="hover:opacity-80 transition-opacity flex shrink-0 items-center"
        >
          {collapsed ? (
            <img
              src="/favicon.png"
              alt="리담"
              className="size-8 shrink-0 object-contain"
            />
          ) : (
            <img
              src="/lidam-logo.png"
              alt="리담변리사학원"
              className="h-7 w-auto max-h-7 object-contain dark:[filter:invert(1)_hue-rotate(180deg)]"
            />
          )}
        </button>
      </div>

      {/* ── 계정 메뉴 — 아바타만, 이름 숨김 ── */}
      <div className="border-border flex justify-center border-b p-2">
        <UserMenu
          hideName
          name={user.name}
          email={user.email}
          avatarUrl={user.avatarUrl}
        />
      </div>

      {/* ── 본문 — 메뉴 ── */}
      <div className={cn("flex-1 overflow-y-auto overflow-x-hidden", collapsed ? "p-1" : "p-3")}>
        {!collapsed && <SidebarSection label="핵심" />}
        <Row
          collapsed={collapsed}
          kind="flat"
          Icon={FLAT_HOME.Icon}
          label={FLAT_HOME.label}
          to={FLAT_HOME.to}
          path={path}
          search={search}
          onPick={collapseAfterPick}
        />
        {core.map((g) => {
          if (g.id === "subjects") {
            return (
              <SubjectsRow
                key={g.id}
                collapsed={collapsed}
                open={open.has("subjects")}
                onToggle={() => toggleGroup("subjects")}
                onExpand={() => expandToGroup("subjects")}
                path={path}
                search={search}
                onPick={collapseAfterPick}
              />
            );
          }
          if (g.items.length === 1) {
            return (
              <Row
                key={g.id}
                collapsed={collapsed}
                kind="flat"
                Icon={g.Icon}
                label={g.label}
                to={g.items[0].to}
                path={path}
                search={search}
                onPick={collapseAfterPick}
              />
            );
          }
          return (
            <Row
              key={g.id}
              collapsed={collapsed}
              kind="group"
              group={g}
              open={open.has(g.id)}
              onToggle={() => toggleGroup(g.id)}
              onExpand={() => expandToGroup(g.id)}
              path={path}
              search={search}
              onPick={collapseAfterPick}
            />
          );
        })}

        {!collapsed && <SidebarSection label="가끔" />}
        {secondary.map((g) => (
          <Row
            key={g.id}
            collapsed={collapsed}
            kind="group"
            group={g}
            open={open.has(g.id)}
            onToggle={() => toggleGroup(g.id)}
            onExpand={() => expandToGroup(g.id)}
            path={path}
            search={search}
            onPick={collapseAfterPick}
          />
        ))}

        {isStaff ? (
          <>
            {!collapsed && <SidebarSection label="관리" />}
            <Row
              collapsed={collapsed}
              kind="flat"
              Icon={FLAT_ADMIN.Icon}
              label={FLAT_ADMIN.label}
              to={FLAT_ADMIN.to}
              path={path}
              search={search}
              onPick={collapseAfterPick}
            />
          </>
        ) : null}
      </div>

      {/* ── 하단 — 검색·인박스·다크모드 + 상단 nav 전환 (항상 세로) ── */}
      <div className="border-border flex flex-col items-center gap-1 border-t p-2">
        <RightTools
          inboxUnread={inboxUnread}
          inboxHref={inboxHref}
          orientation="vertical"
        />
        <button
          type="button"
          onClick={switchToTopbar}
          title="상단 메뉴로 전환"
          aria-label="상단 메뉴로 전환"
          className="hover:bg-muted text-muted-foreground hover:text-foreground mt-1 flex size-9 items-center justify-center rounded-md transition-colors"
        >
          <PanelTopOpenIcon className="size-4" />
        </button>
      </div>
    </aside>
  );
}

function SidebarSection({ label }: { label: string }) {
  return (
    <p className="text-muted-foreground mt-3 mb-1 px-2 text-[10px] font-bold tracking-widest uppercase">
      {label}
    </p>
  );
}

// ── Row — flat / group 통합 ────────────────────────────────────────────────

interface BaseRowProps {
  collapsed: boolean;
  path: string;
  search: string;
  onPick: () => void;
}
interface FlatRowProps extends BaseRowProps {
  kind: "flat";
  Icon: NavGroup["Icon"];
  label: string;
  to: string;
}
interface GroupRowProps extends BaseRowProps {
  kind: "group";
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  onExpand: () => void;
}
type RowProps = FlatRowProps | GroupRowProps;

function Row(props: RowProps) {
  if (props.collapsed) {
    return props.kind === "flat" ? (
      <FlatIcon
        Icon={props.Icon}
        label={props.label}
        to={props.to}
        path={props.path}
        search={props.search}
        onPick={props.onPick}
      />
    ) : (
      <GroupIcon
        group={props.group}
        path={props.path}
        search={props.search}
        onExpand={props.onExpand}
      />
    );
  }
  return props.kind === "flat" ? (
    <FlatFull {...props} />
  ) : (
    <GroupFull {...props} />
  );
}

function FlatFull({
  Icon,
  label,
  to,
  path,
  search,
  onPick,
}: Omit<FlatRowProps, "kind" | "collapsed">) {
  const active = isNavActive(to, path, search);
  return (
    <Link
      to={to}
      viewTransition
      prefetch="intent"
      onClick={onPick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 text-primary font-semibold"
          : "text-foreground/80 hover:bg-muted",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

function GroupFull({
  group,
  open,
  onToggle,
  path,
  search,
  onPick,
}: Omit<GroupRowProps, "kind" | "collapsed">) {
  const Icon = group.Icon;
  const hasActive = group.items.some((i) => isNavActive(i.to, path, search));
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted",
          hasActive ? "text-primary font-semibold" : "text-foreground/80",
        )}
      >
        <Icon className="size-4" />
        <span className="flex-1 text-left">{group.label}</span>
        {open ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
      </button>
      {open ? (
        <div className="border-border ml-6 flex flex-col gap-0.5 border-l py-1 pl-2">
          {group.items.map((it) => {
            const active = isNavActive(it.to, path, search);
            return (
              <Link
                key={it.to}
                to={it.to}
                viewTransition
                prefetch="intent"
                onClick={onPick}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {it.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FlatIcon({
  Icon,
  label,
  to,
  path,
  search,
  onPick,
}: Omit<FlatRowProps, "kind" | "collapsed">) {
  const active = isNavActive(to, path, search);
  return (
    <div className="group relative">
      <Link
        to={to}
        viewTransition
        prefetch="intent"
        onClick={onPick}
        className={cn(
          "flex h-8 items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-primary/10 text-primary"
            : "text-foreground/80 hover:bg-muted",
        )}
        aria-label={label}
      >
        <Icon className="size-5" />
      </Link>
      <Flyout>{label}</Flyout>
    </div>
  );
}

function GroupIcon({
  group,
  path,
  search,
  onExpand,
}: {
  group: NavGroup;
  path: string;
  search: string;
  onExpand: () => void;
}) {
  const Icon = group.Icon;
  const hasActive = group.items.some((i) => isNavActive(i.to, path, search));
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onExpand}
        aria-label={group.label}
        className={cn(
          "flex h-8 w-full items-center justify-center rounded-lg transition-colors hover:bg-muted",
          hasActive ? "bg-primary/10 text-primary" : "text-foreground/80",
        )}
      >
        <Icon className="size-5" />
      </button>
      <Flyout>{group.label}</Flyout>
    </div>
  );
}

interface SubjectsRowProps {
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  onExpand: () => void;
  path: string;
  search: string;
  onPick: () => void;
}
function SubjectsRow({
  collapsed,
  open,
  onToggle,
  onExpand,
  path,
  search,
  onPick,
}: SubjectsRowProps) {
  if (collapsed)
    return <SubjectsIcon path={path} search={search} onExpand={onExpand} />;
  return (
    <SubjectsFull
      open={open}
      onToggle={onToggle}
      path={path}
      search={search}
      onPick={onPick}
    />
  );
}

function SubjectsFull({
  open,
  onToggle,
  path,
  search,
  onPick,
}: Omit<SubjectsRowProps, "collapsed" | "onExpand">) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
      >
        <SUBJECT_ICON className="size-4" />
        <span className="flex-1 text-left">학습과목</span>
        {open ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
      </button>
      {open ? (
        <div className="border-border ml-6 mt-1 border-l pl-2">
          {SUBJECT_SECTIONS.map((section) => (
            <div key={section.exam} className="mb-2">
              <p className="text-primary mt-1 mb-1 px-1 text-[9px] font-bold tracking-widest uppercase">
                {section.label}
              </p>
              {section.groups.map((group) => (
                <div key={`${section.exam}-${group.id}`} className="mb-1.5">
                  <p className="text-muted-foreground px-1 text-[10px] font-semibold">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-0.5 pl-2">
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
                            "rounded-md px-1.5 py-0.5 text-xs transition-colors",
                            active
                              ? "bg-primary/10 text-primary font-semibold"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
      ) : null}
    </div>
  );
}

function SubjectsIcon({
  path,
  search,
  onExpand,
}: {
  path: string;
  search: string;
  onExpand: () => void;
}) {
  const hasActive = SUBJECT_SECTIONS.some((s) =>
    s.groups.some((g) => g.items.some((i) => isNavActive(i.href, path, search))),
  );
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onExpand}
        aria-label="학습과목"
        className={cn(
          "flex h-8 w-full items-center justify-center rounded-lg transition-colors hover:bg-muted",
          hasActive ? "bg-primary/10 text-primary" : "text-foreground/80",
        )}
      >
        <SUBJECT_ICON className="size-5" />
      </button>
      <Flyout>학습과목</Flyout>
    </div>
  );
}

function Flyout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-popover text-popover-foreground pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover:opacity-100">
      {children}
    </div>
  );
}

import { BookOpenIcon } from "lucide-react";
const SUBJECT_ICON = BookOpenIcon;
