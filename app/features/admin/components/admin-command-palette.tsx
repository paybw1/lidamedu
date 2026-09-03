// 운영자 화면 검색(⌘K) — /admin 안에서 91개 운영 화면을 이름으로 점프.
// /admin 에선 전역 검색(조문·판례·문제) 대신 이 화면검색이 ⌘K 를 가진다
// (command-palette.tsx 가 /admin 경로에서 ⌘K 를 양보). 역할 필터(visibleAdminNav) 반영.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/core/components/ui/command";
import type { UserRole } from "~/core/lib/roles";
import { visibleAdminNav } from "~/features/admin/components/admin-shell";
import { useMyDuties } from "~/features/admin/hooks/use-my-duties";
import { ADMIN_PALETTE_OPEN_EVENT } from "~/features/admin/components/admin-palette-event";

export function AdminCommandPalette({ role }: { role: UserRole | null }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(ADMIN_PALETTE_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(ADMIN_PALETTE_OPEN_EVENT, onOpen);
    };
  }, []);

  // hub 제외, 역할·담당별로 보이는 화면만 — 열 수 없는 화면이 검색에 잡히면
  // 사이드바에서 숨긴 의미가 없다.
  const duties = useMyDuties(role);
  const groups = visibleAdminNav(role, duties).filter((c) => c.section);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="운영자 화면 검색"
      description="운영관리 화면을 이름으로 찾아 이동합니다"
    >
      <CommandInput placeholder="화면 이름으로 검색 (예: 환불 · 판례 · 정산 · 배너)" />
      <CommandList>
        <CommandEmpty>일치하는 화면이 없습니다.</CommandEmpty>
        {groups.map((c) => (
          <CommandGroup key={c.id} heading={c.label}>
            {c.screens.map((s) => (
              <CommandItem
                key={s.to}
                value={`${c.label} ${s.label} ${s.to}`}
                onSelect={() => {
                  setOpen(false);
                  navigate(s.to);
                }}
              >
                <span className="flex-1">{s.label}</span>
                <span className="text-muted-foreground text-[10.5px]">
                  {c.label}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="text-muted-foreground border-t px-3 py-2 text-[10.5px]">
        ↵ 로 이동 · Esc 로 닫기
      </div>
    </CommandDialog>
  );
}
