// 학생 데스크톱 사이드바 — A안-아이콘 확정안.
//
// 동작:
//   - 펼침 (260px): 아이콘 + 라벨, 그룹 펼침 토글, subjects 1차/2차 2섹션
//   - 접힘 (60px):  아이콘만. hover 시 옆에 flyout panel (라벨 / items / subjects 풀버전)
//                  접힘 상태에서도 active 표시 유지.
//   - 토글 버튼: 사이드바 헤더 우측. 클릭으로 펼침↔접힘.
//   - 상태 persist: localStorage("studentSidebarCollapsed").
// 모바일(md 미만): 자체 숨김. §3 모바일 하단탭이 별도.

import {
  ChevronDownIcon,
  ChevronRightIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from "lucide-react";
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

const STORAGE_KEY = "studentSidebarCollapsed";

export function StudentSidebar({ isStaff }: { isStaff: boolean }) {
  const { core, secondary } = useNavLayout();
  const location = useLocation();
  const path = location.pathname;
  const search = location.search;

  // 접힘/펼침 — 초기 false(펼침), 클라에서만 localStorage 동기화 (SSR flash 1tick).
  const [collapsed, setCollapsed] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      }
      return next;
    });
  };

  // 그룹 펼침 상태 — 펼침 모드용. 초기: active 그룹 + subjects/aids 기본 펼침.
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

  const toggle = (id: string) =>
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
        "border-border bg-card sticky top-0 hidden h-screen shrink-0 overflow-y-auto overflow-x-visible border-r transition-[width] duration-150 ease-out md:block",
        collapsed ? "w-[60px]" : "w-[260px]",
      )}
    >
      {/* 헤더 — 토글 버튼 (눈에 띄게: border + 라벨) */}
      <div
        className={cn(
          "border-border border-b p-2",
          collapsed ? "flex justify-center" : "",
        )}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          className={cn(
            "border-border hover:border-primary hover:bg-primary/5 hover:text-primary flex items-center gap-1.5 rounded-md border bg-card transition-colors",
            collapsed ? "size-8 justify-center" : "w-full justify-between px-2 py-1.5",
          )}
        >
          {collapsed ? (
            <PanelLeftOpenIcon className="size-4" />
          ) : (
            <>
              <span className="text-xs font-medium">사이드바 접기</span>
              <PanelLeftCloseIcon className="size-4" />
            </>
          )}
        </button>
      </div>

      <div className={cn(collapsed ? "p-2" : "p-3")}>
        {/* 핵심 */}
        {!collapsed && <SidebarSection label="핵심" />}
        <Row
          collapsed={collapsed}
          kind="flat"
          Icon={FLAT_HOME.Icon}
          label={FLAT_HOME.label}
          to={FLAT_HOME.to}
          path={path}
          search={search}
        />
        {core.map((g) => {
          if (g.id === "subjects") {
            return (
              <SubjectsRow
                key={g.id}
                collapsed={collapsed}
                open={open.has("subjects")}
                onToggle={() => toggle("subjects")}
                path={path}
                search={search}
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
              onToggle={() => toggle(g.id)}
              path={path}
              search={search}
            />
          );
        })}

        {/* 가끔 */}
        {!collapsed && <SidebarSection label="가끔" />}
        {secondary.map((g) => (
          <Row
            key={g.id}
            collapsed={collapsed}
            kind="group"
            group={g}
            open={open.has(g.id)}
            onToggle={() => toggle(g.id)}
            path={path}
            search={search}
          />
        ))}

        {/* 관리 (staff) */}
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
            />
          </>
        ) : null}
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

// ── Row — flat / group 통합. collapsed 분기 ────────────────────────────────

interface BaseRowProps {
  collapsed: boolean;
  path: string;
  search: string;
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
      />
    ) : (
      <GroupIcon
        group={props.group}
        path={props.path}
        search={props.search}
      />
    );
  }
  return props.kind === "flat" ? (
    <FlatFull {...props} />
  ) : (
    <GroupFull {...props} />
  );
}

// ── 펼침(full) — 라벨 + 아이콘 ─────────────────────────────────────────────

function FlatFull({
  Icon,
  label,
  to,
  path,
  search,
}: Omit<FlatRowProps, "kind" | "collapsed">) {
  const active = isNavActive(to, path, search);
  return (
    <Link
      to={to}
      viewTransition
      prefetch="intent"
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

// ── 접힘(collapsed) — 아이콘 only + hover flyout ───────────────────────────

function FlatIcon({
  Icon,
  label,
  to,
  path,
  search,
}: Omit<FlatRowProps, "kind" | "collapsed">) {
  const active = isNavActive(to, path, search);
  return (
    <div className="group relative my-0.5">
      <Link
        to={to}
        viewTransition
        prefetch="intent"
        className={cn(
          "flex h-9 items-center justify-center rounded-lg transition-colors",
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
}: {
  group: NavGroup;
  path: string;
  search: string;
}) {
  const Icon = group.Icon;
  const hasActive = group.items.some((i) => isNavActive(i.to, path, search));
  return (
    <div className="group relative my-0.5">
      <div
        className={cn(
          "flex h-9 items-center justify-center rounded-lg transition-colors hover:bg-muted",
          hasActive ? "bg-primary/10 text-primary" : "text-foreground/80",
        )}
        aria-label={group.label}
      >
        <Icon className="size-5" />
      </div>
      <FlyoutPanel title={group.label}>
        {group.items.map((it) => {
          const active = isNavActive(it.to, path, search);
          return (
            <Link
              key={it.to}
              to={it.to}
              viewTransition
              prefetch="intent"
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
      </FlyoutPanel>
    </div>
  );
}

// ── subjects — 펼침/접힘 양쪽 ────────────────────────────────────────────

interface SubjectsRowProps {
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  path: string;
  search: string;
}
function SubjectsRow({
  collapsed,
  open,
  onToggle,
  path,
  search,
}: SubjectsRowProps) {
  if (collapsed) return <SubjectsIcon path={path} search={search} />;
  return <SubjectsFull open={open} onToggle={onToggle} path={path} search={search} />;
}

function SubjectsFull({
  open,
  onToggle,
  path,
  search,
}: Omit<SubjectsRowProps, "collapsed">) {
  const isChipActive = (href: string): boolean => isNavActive(href, path, search);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
      >
        {(() => {
          const Icon = SUBJECT_ICON;
          return <Icon className="size-4" />;
        })()}
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
                    {group.items.map((item) => (
                      <Link
                        key={`${section.exam}-${group.id}-${item.href}`}
                        to={item.href}
                        viewTransition
                        prefetch="intent"
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-xs transition-colors",
                          isChipActive(item.href)
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {item.name}
                      </Link>
                    ))}
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

function SubjectsIcon({ path, search }: { path: string; search: string }) {
  const Icon = SUBJECT_ICON;
  const hasActive = SUBJECT_SECTIONS.some((s) =>
    s.groups.some((g) => g.items.some((i) => isNavActive(i.href, path, search))),
  );
  return (
    <div className="group relative my-0.5">
      <div
        className={cn(
          "flex h-9 items-center justify-center rounded-lg transition-colors hover:bg-muted",
          hasActive ? "bg-primary/10 text-primary" : "text-foreground/80",
        )}
        aria-label="학습과목"
      >
        <Icon className="size-5" />
      </div>
      <FlyoutPanel title="학습과목" widthClass="w-[280px]">
        {SUBJECT_SECTIONS.map((section) => (
          <div key={section.exam} className="mb-2">
            <p className="text-primary mt-1 mb-1 text-[9px] font-bold tracking-widest uppercase">
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
      </FlyoutPanel>
    </div>
  );
}

// ── Flyout (접힘 모드 hover 툴팁/패널) ────────────────────────────────────

/** 단순 라벨 툴팁 — 아이콘만 있을 때 라벨 표시. */
function Flyout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-popover text-popover-foreground pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover:opacity-100">
      {children}
    </div>
  );
}

/** 그룹 items / subjects 풀버전 panel — 아이콘 hover 시 옆에 펼침. */
function FlyoutPanel({
  title,
  children,
  widthClass = "w-[200px]",
}: {
  title: string;
  children: React.ReactNode;
  widthClass?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-popover absolute top-0 left-full z-50 ml-2 hidden flex-col gap-0.5 rounded-md border p-2 shadow-lg group-hover:flex",
        widthClass,
      )}
    >
      <p className="text-muted-foreground border-border mb-1 border-b pb-1 px-1 text-[10px] font-bold tracking-widest uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

// SubjectsIcon/SubjectsFull 공용 — 순환 import 우려 방지 위해 별도 상수.
import { BookOpenIcon } from "lucide-react";
const SUBJECT_ICON = BookOpenIcon;
