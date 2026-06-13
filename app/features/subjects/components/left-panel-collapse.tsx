// 학습과목 뷰어(조문/판례/문제) 좌측 트리 패널 접기/펼치기.
//   데스크톱(lg+) 3컬럼 그리드의 좌측 트랙을 접힘 시 좁은 스트립(2.5rem)으로 줄이고
//   트리 대신 펼치기 버튼만 보인다. 상태는 localStorage 로 화면 간 유지.
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "~/core/lib/utils";

const KEY = "subjects-left-collapsed";

export function useLeftPanelCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(KEY) === "1");
    } catch {
      // localStorage 접근 불가(프라이빗 모드 등) — 기본 펼침 유지.
    }
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        // 무시 — 메모리 상태만 변경.
      }
      return next;
    });
  }, []);
  return { collapsed, toggle };
}

// 그리드 컬럼 템플릿 — 접힘 시 좌측 트랙을 좁은 스트립으로.
export function leftPanelGridCls(collapsed: boolean): string {
  return collapsed
    ? "lg:grid-cols-[2.5rem_minmax(0,1fr)_320px]"
    : "lg:grid-cols-[260px_minmax(0,1fr)_320px]";
}

export function LeftPanelToggle({
  collapsed,
  onToggle,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={collapsed ? "트리 펼치기" : "트리 접기"}
      aria-label={collapsed ? "트리 펼치기" : "트리 접기"}
      className={cn(
        "border-input bg-card text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-7 items-center justify-center rounded-md border transition-colors",
        className,
      )}
    >
      {collapsed ? (
        <PanelLeftOpenIcon className="size-4" />
      ) : (
        <PanelLeftCloseIcon className="size-4" />
      )}
    </button>
  );
}
