// 학습과목 뷰어(조문/판례/문제) 좌·우 패널 접기/펼치기.
//   데스크톱(lg+) 3컬럼 그리드의 좌/우 트랙을 접힘 시 좁은 스트립(2.5rem)으로 줄이고
//   콘텐츠 대신 펼치기 버튼만 보인다. 상태는 localStorage 로 화면 간 유지.
//   (파일명은 left- 이지만 좌·우 양쪽을 다룬다.)
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "~/core/lib/utils";

function usePanelCollapse(key: string) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(key) === "1");
    } catch {
      // localStorage 불가(프라이빗 모드 등) — 기본 펼침.
    }
  }, [key]);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // 무시 — 메모리 상태만.
      }
      return next;
    });
  }, [key]);
  // 읽기 모드(양 패널 동시 접기/펼치기)용 명시적 setter.
  const set = useCallback(
    (value: boolean) => {
      setCollapsed(value);
      try {
        localStorage.setItem(key, value ? "1" : "0");
      } catch {
        // 무시 — 메모리 상태만.
      }
    },
    [key],
  );
  return { collapsed, toggle, set };
}

export function useLeftPanelCollapse() {
  return usePanelCollapse("subjects-left-collapsed");
}
export function useRightPanelCollapse() {
  return usePanelCollapse("subjects-right-collapsed");
}

// 그리드 컬럼 템플릿 — 접힌 트랙은 좁은 스트립. Tailwind JIT 가 스캔하도록 리터럴 4분기
// (동적 문자열 보간은 스캔 불가 → 빌드에서 클래스 누락).
export function panelGridCls(
  leftCollapsed: boolean,
  rightCollapsed: boolean,
): string {
  if (leftCollapsed && rightCollapsed)
    return "lg:grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]";
  if (leftCollapsed) return "lg:grid-cols-[2.5rem_minmax(0,1fr)_320px]";
  if (rightCollapsed) return "lg:grid-cols-[260px_minmax(0,1fr)_2.5rem]";
  return "lg:grid-cols-[260px_minmax(0,1fr)_320px]";
}

// 좌측 트리만 접는 2-컬럼 그리드(체계도 노드/장 뷰어 — 우측 패널이 본문 카드 내부라
// 별도 우측 트랙이 없음). 리터럴 분기로 Tailwind JIT 스캔 보장.
export function leftOnlyGridCls(leftCollapsed: boolean): string {
  return leftCollapsed
    ? "lg:grid-cols-[2.5rem_minmax(0,1fr)]"
    : "lg:grid-cols-[260px_minmax(0,1fr)]";
}

// bg-card 헤더 위에서도 또렷하게 보이도록 — muted 배경 + foreground 아이콘 + 그림자.
// (이전 bg-card 버튼은 bg-card 헤더에 묻혀 "안 보인다"는 피드백)
const BTN =
  "border-border bg-muted text-foreground hover:bg-primary hover:text-primary-foreground inline-flex size-8 items-center justify-center rounded-md border shadow-sm transition-colors";

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
      className={cn(BTN, className)}
    >
      {collapsed ? (
        <PanelLeftOpenIcon className="size-4" />
      ) : (
        <PanelLeftCloseIcon className="size-4" />
      )}
    </button>
  );
}

export function RightPanelToggle({
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
      title={collapsed ? "패널 펼치기" : "패널 접기"}
      aria-label={collapsed ? "패널 펼치기" : "패널 접기"}
      className={cn(BTN, className)}
    >
      {collapsed ? (
        <PanelRightOpenIcon className="size-4" />
      ) : (
        <PanelRightCloseIcon className="size-4" />
      )}
    </button>
  );
}
