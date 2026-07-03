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

import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";

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
  type NavGroup,
  isAreaLocked,
  isSubjectLocked,
  subjectLockedHint,
  isNavActive,
  pickActiveLinkTo,
  useNavLayout,
} from "~/core/lib/nav-groups";

import { RightTools, UserMenu } from "./navigation-bar";

const STORAGE_KEY = "studentSidebarCollapsed";

interface StudentSidebarProps {
  isStaff: boolean;
  // 잠금(dim) 판정용 — 등급 리졸버 기준(체험 모드 반영). 미전달 시 isStaff 폴백.
  gradeStaff?: boolean;
  user: {
    name: string;
    email: string | undefined;
    avatarUrl?: string | null;
  };
  inboxUnread: number | null;
  inboxHref: string | null;
  // feat-8-008 — 구독/cohort 영역 플래그. 잠금 흐림(dim) 시각표시용(상단바와 동일).
  features?: string[];
  // feat-8-027 — 학습과목 열람 가능 과목('all' | slug[]). 미허용 과목은 비활성.
  subjects?: "all" | string[];
}

export function StudentSidebar({
  isStaff,
  gradeStaff,
  user,
  inboxUnread,
  inboxHref,
  features,
  subjects,
}: StudentSidebarProps) {
  const { core, secondary } = useNavLayout(isStaff);
  // 잠금 판정은 등급 기준(원장 체험 모드 반영) — 메뉴 노출은 역할(isStaff) 기준 유지.
  const lockStaff = gradeStaff ?? isStaff;
  // feat-8-008 — 영역 잠금 흐림(dim) 일관 적용(상단바와 동일 규칙). 서버 영역 게이트가 권위, 시각 힌트만.
  const lockOf = (area?: string) => isAreaLocked(area, lockStaff, features);
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
    setOpenId(id);
  };


  // 그룹 펼침 — accordion exclusive (한 번에 한 그룹만).
  // 초기: 현재 path 가 속한 그룹, 없으면 subjects 기본.
  const initialOpen = useMemo<string | null>(() => {
    for (const g of [...core, ...secondary]) {
      if (g.items.some((i) => isNavActive(i.to, path, search))) return g.id;
    }
    return "subjects";
  }, [path, search, core, secondary]);
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  useEffect(() => {
    for (const g of [...core, ...secondary]) {
      if (g.items.some((i) => isNavActive(i.to, path, search))) {
        setOpenId(g.id);
        return;
      }
    }
  }, [path, search, core, secondary]);
  const toggleGroup = (id: string) =>
    setOpenId((prev) => (prev === id ? null : id));

  return (
    <aside
      data-testid="student-sidebar"
      data-collapsed={collapsed}
      className={cn(
        "border-border bg-card sticky top-0 hidden h-screen shrink-0 overflow-x-hidden overflow-y-auto border-r transition-[width] duration-150 ease-out md:flex md:flex-col",
        collapsed ? "w-[60px]" : "w-[240px]",
      )}
    >
      {/* ── 로고 = 접힘/펼침 토글. 펼침 = 좌측 정렬(계정·메뉴 라인 통일) ── */}
      <div
        className={cn(
          "border-border flex border-b p-2",
          collapsed ? "justify-center" : "px-3 justify-start",
        )}
      >
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
              className="h-auto max-h-7 w-auto max-w-full object-contain dark:[filter:invert(1)_hue-rotate(180deg)]"
            />
          )}
        </button>
      </div>

      {/* ── 계정 메뉴 — 접힘=아바타만, 펼침=아바타+이름 (메뉴 아이콘 줄에 맞춤) ── */}
      <div
        className={cn(
          "border-border border-b p-2 flex",
          collapsed ? "justify-center" : "px-3 justify-start",
        )}
      >
        <UserMenu
          hideName={collapsed}
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
                open={openId === "subjects"}
                onToggle={() => toggleGroup("subjects")}
                onExpand={() => expandToGroup("subjects")}
                path={path}
                search={search}
                onPick={collapseAfterPick}
                locked={lockOf(g.area)}
                isStaff={lockStaff}
                subjects={subjects}
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
                locked={lockOf(g.area)}
              />
            );
          }
          return (
            <Row
              key={g.id}
              collapsed={collapsed}
              kind="group"
              group={g}
              open={openId === g.id}
              onToggle={() => toggleGroup(g.id)}
              onExpand={() => expandToGroup(g.id)}
              path={path}
              search={search}
              onPick={collapseAfterPick}
              locked={lockOf(g.area)}
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
            open={openId === g.id}
            onToggle={() => toggleGroup(g.id)}
            onExpand={() => expandToGroup(g.id)}
            path={path}
            search={search}
            onPick={collapseAfterPick}
            locked={lockOf(g.area)}
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

      {/* ── 하단 — RightTools (검색·인박스·다크모드·상단전환 통합) ── */}
      <div
        className={cn(
          "border-border border-t p-2 flex",
          collapsed
            ? "flex-col items-center gap-1"
            : "items-center justify-around gap-1",
        )}
      >
        <RightTools
          inboxUnread={inboxUnread}
          inboxHref={inboxHref}
          orientation={collapsed ? "vertical" : "horizontal"}
        />
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
  // 영역 잠금 시각표시 = 흐림(dim). 펼침·접힘 아이콘 모드 모두 적용(표면 일관).
  locked?: boolean;
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
        locked={props.locked}
      />
    ) : (
      <GroupIcon
        group={props.group}
        path={props.path}
        search={props.search}
        onExpand={props.onExpand}
        locked={props.locked}
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
  locked,
}: Omit<FlatRowProps, "kind" | "collapsed">) {
  const active = isNavActive(to, path, search);
  return (
    <Link
      to={to}
      viewTransition
      prefetch="intent"
      onClick={onPick}
      title={locked ? LOCKED_HINT : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 text-link font-semibold"
          : "text-foreground/80 hover:bg-muted",
        locked && LOCKED_DIM_CLASS,
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
  locked,
}: Omit<GroupRowProps, "kind" | "collapsed">) {
  const Icon = group.Icon;
  const hasActive = group.items.some((i) => isNavActive(i.to, path, search));
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title={locked ? LOCKED_HINT : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted",
          hasActive ? "text-link font-semibold" : "text-foreground/80",
          locked && LOCKED_DIM_CLASS,
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
          {(() => {
            // 그룹 내 가장 긴 매칭 to 1 개만 active — prefix 충돌(/gs vs /gs/issues) 방지.
            const activeTo = pickActiveLinkTo(group.items, path, search);
            return group.items.map((it) => {
              const active = it.to === activeTo;
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
                    ? "bg-primary/10 text-link font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {it.label}
              </Link>
              );
            });
          })()}
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
  locked,
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
            ? "bg-primary/10 text-link"
            : "text-foreground/80 hover:bg-muted",
          locked && LOCKED_DIM_CLASS,
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
  locked,
}: {
  group: NavGroup;
  path: string;
  search: string;
  onExpand: () => void;
  locked?: boolean;
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
          hasActive ? "bg-primary/10 text-link" : "text-foreground/80",
          locked && LOCKED_DIM_CLASS,
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
  locked?: boolean;
  isStaff?: boolean;
  subjects?: "all" | string[];
}
function SubjectsRow({
  collapsed,
  open,
  onToggle,
  onExpand,
  path,
  search,
  onPick,
  locked,
  isStaff,
  subjects,
}: SubjectsRowProps) {
  if (collapsed)
    return (
      <SubjectsIcon
        path={path}
        search={search}
        onExpand={onExpand}
        locked={locked}
      />
    );
  return (
    <SubjectsFull
      open={open}
      onToggle={onToggle}
      path={path}
      search={search}
      onPick={onPick}
      locked={locked}
      isStaff={isStaff}
      subjects={subjects}
    />
  );
}

function SubjectsFull({
  open,
  onToggle,
  path,
  search,
  onPick,
  locked,
  isStaff = false,
  subjects,
}: Omit<SubjectsRowProps, "collapsed" | "onExpand">) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title={locked ? LOCKED_HINT : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted",
          locked && LOCKED_DIM_CLASS,
        )}
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
        <div className="border-border ml-6 mt-1 flex flex-col gap-0.5 border-l pl-2">
          {/* 1/2차 구분 없는 평면 6과목. 권한 없는 과목은 비활성(클릭 불가). */}
          {SUBJECT_NAV_ITEMS.map((item) => {
            const active = isNavActive(item.href, path, search);
            const slug = subjectSlugFromHref(item.href);
            const subjLocked = isSubjectLocked(slug, isStaff, subjects);
            if (subjLocked) {
              return (
                <span
                  key={item.href}
                  title={subjectLockedHint(slug)}
                  aria-disabled="true"
                  className={cn(
                    "text-muted-foreground rounded-md px-1.5 py-1 text-xs",
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
                  "rounded-md px-1.5 py-1 text-xs transition-colors",
                  active
                    ? "bg-primary/10 text-link font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SubjectsIcon({
  path,
  search,
  onExpand,
  locked,
}: {
  path: string;
  search: string;
  onExpand: () => void;
  locked?: boolean;
}) {
  const hasActive = SUBJECT_NAV_ITEMS.some((i) =>
    isNavActive(i.href, path, search),
  );
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onExpand}
        aria-label="학습과목"
        className={cn(
          "flex h-8 w-full items-center justify-center rounded-lg transition-colors hover:bg-muted",
          hasActive ? "bg-primary/10 text-link" : "text-foreground/80",
          locked && LOCKED_DIM_CLASS,
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
