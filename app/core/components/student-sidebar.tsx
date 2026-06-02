// 학생 데스크톱 사이드바 — 좌측 고정. 미리보기(/admin/nav-preview) 디자인 기반.
// 핵심 그룹 + 가끔 그룹 + Flat. active 표시, 펼침/접힘, staff 분기.

import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
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

export function StudentSidebar({ isStaff }: { isStaff: boolean }) {
  const { core, secondary } = useNavLayout();
  const location = useLocation();
  const path = location.pathname;
  const search = location.search;

  // 그룹별 펼침 상태 — 초기: 현재 경로가 속한 그룹은 자동 펼침 + subjects/aids 기본 펼침.
  const initialOpen = useMemo(() => {
    const s = new Set<string>(["subjects", "aids"]);
    for (const g of [...core, ...secondary]) {
      if (g.items.some((i) => isNavActive(i.to, path, search))) s.add(g.id);
    }
    return s;
  }, [path, search, core, secondary]);
  const [open, setOpen] = useState<Set<string>>(initialOpen);

  // 경로 변경 시 active 그룹 자동 펼침(닫혀 있던 것도 펼침).
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
      className="border-border bg-card sticky top-0 hidden h-screen w-[260px] shrink-0 overflow-y-auto border-r p-3 md:block"
    >
      <SidebarSection label="핵심" />
      <SidebarFlat
        Icon={FLAT_HOME.Icon}
        label={FLAT_HOME.label}
        to={FLAT_HOME.to}
        path={path}
        search={search}
      />
      {core.map((g) =>
        g.id === "subjects" ? (
          <SidebarSubjects
            key={g.id}
            open={open.has("subjects")}
            onToggle={() => toggle("subjects")}
            path={path}
            search={search}
          />
        ) : g.items.length === 1 ? (
          <SidebarFlat
            key={g.id}
            Icon={g.Icon}
            label={g.label}
            to={g.items[0].to}
            path={path}
            search={search}
          />
        ) : (
          <SidebarGroup
            key={g.id}
            group={g}
            open={open.has(g.id)}
            onToggle={() => toggle(g.id)}
            path={path}
            search={search}
          />
        ),
      )}

      <SidebarSection label="가끔" />
      {secondary.map((g) => (
        <SidebarGroup
          key={g.id}
          group={g}
          open={open.has(g.id)}
          onToggle={() => toggle(g.id)}
          path={path}
          search={search}
        />
      ))}

      {isStaff ? (
        <>
          <SidebarSection label="관리" />
          <SidebarFlat
            Icon={FLAT_ADMIN.Icon}
            label={FLAT_ADMIN.label}
            to={FLAT_ADMIN.to}
            path={path}
            search={search}
          />
        </>
      ) : null}
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

interface FlatProps {
  Icon: NavGroup["Icon"];
  label: string;
  to: string;
  path: string;
  search: string;
}
function SidebarFlat({ Icon, label, to, path, search }: FlatProps) {
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

interface GroupProps {
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  path: string;
  search: string;
}
function SidebarGroup({ group, open, onToggle, path, search }: GroupProps) {
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

interface SubjectsProps {
  open: boolean;
  onToggle: () => void;
  path: string;
  search: string;
}
function SidebarSubjects({ open, onToggle, path, search }: SubjectsProps) {
  // subject 칩 active 체크 — pathname 이 /subjects/<href 의 마지막 segment> 로 시작하는지.
  const isChipActive = (href: string): boolean =>
    isNavActive(href, path, search);

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
                    {group.items.map((item) => {
                      const active = isChipActive(item.href);
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
        </div>
      ) : null}
    </div>
  );
}

// SidebarSubjects 의 헤더 아이콘 — NAV_GROUP_POOL 의 subjects.Icon 와 동일.
// 직접 import 하면 순환 우려 방지 위해 별도 상수.
import { BookOpenIcon } from "lucide-react";
const SUBJECT_ICON = BookOpenIcon;
