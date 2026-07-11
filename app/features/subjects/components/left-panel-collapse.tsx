// 학습과목 뷰어(조문/판례/문제) 좌·우 패널 접기/펼치기.
//   데스크톱(lg+) 3컬럼 그리드의 좌/우 트랙을 접힘 시 좁은 스트립(2.5rem)으로 줄이고
//   콘텐츠 대신 펼치기 버튼만 보인다. 상태는 localStorage 로 화면 간 유지.
//   (파일명은 left- 이지만 좌·우 양쪽을 다룬다.)
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "~/core/lib/utils";

/* ── 좌패널 폭 조절(드래그 리사이즈) ─────────────────────────────────────
   좌 트랙 폭을 CSS 변수 --left-w 로 구동(기본 312px 폴백). 목차 글자가 잘릴 때
   경계 핸들을 드래그해 폭을 넓히거나 줄인다. localStorage 로 화면 간 유지. */
const LEFT_W_KEY = "subjects-left-width";
export const LEFT_W_DEFAULT = 312;
const LEFT_W_MIN = 240;
const LEFT_W_MAX = 640;

function clampLeftW(n: number): number {
  return Math.max(LEFT_W_MIN, Math.min(LEFT_W_MAX, Math.round(n)));
}

export function useLeftPanelWidth() {
  const [width, setWidthState] = useState(LEFT_W_DEFAULT);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LEFT_W_KEY);
      const n = raw ? Number.parseInt(raw, 10) : NaN;
      if (Number.isFinite(n)) setWidthState(clampLeftW(n));
    } catch {
      // localStorage 불가 — 기본 폭.
    }
  }, []);
  const setWidth = useCallback((w: number) => {
    const c = clampLeftW(w);
    setWidthState(c);
    try {
      localStorage.setItem(LEFT_W_KEY, String(c));
    } catch {
      // 무시 — 메모리 상태만.
    }
  }, []);
  return { width, setWidth };
}

/** 좌패널 오른쪽 경계 드래그 핸들 — 폭을 조절한다. 좌패널이 펼쳐졌을 때만 렌더. */
export function LeftPanelResizer({
  width,
  onWidth,
}: {
  width: number;
  onWidth: (w: number) => void;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    onWidth(start.current.w + (e.clientX - start.current.x));
  };
  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    start.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // 무시.
    }
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="목차 폭 조절"
      title="드래그하여 목차 폭 조절"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onWidth(LEFT_W_DEFAULT)}
      className="group absolute top-0 right-[-9px] z-20 hidden h-full w-[16px] cursor-col-resize touch-none lg:block"
    >
      <div className="bg-border group-hover:bg-primary/50 mx-auto h-full w-px transition-colors" />
    </div>
  );
}

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
// 좌 트랙 312px = 책갈피 레일 52px + 트리 카드 260px (펼침 시 레일 포함 폭).
export function panelGridCls(
  leftCollapsed: boolean,
  rightCollapsed: boolean,
): string {
  if (leftCollapsed && rightCollapsed)
    return "lg:grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]";
  if (leftCollapsed) return "lg:grid-cols-[2.5rem_minmax(0,1fr)_320px]";
  // 좌 트랙 = var(--left-w, 312px) — 드래그로 조절(미설정 시 기본 312px).
  if (rightCollapsed)
    return "lg:grid-cols-[var(--left-w,312px)_minmax(0,1fr)_2.5rem]";
  return "lg:grid-cols-[var(--left-w,312px)_minmax(0,1fr)_320px]";
}

// 좌측 트리만 접는 2-컬럼 그리드(체계도 노드/장 뷰어 — 우측 패널이 본문 카드 내부라
// 별도 우측 트랙이 없음). 리터럴 분기로 Tailwind JIT 스캔 보장.
export function leftOnlyGridCls(leftCollapsed: boolean): string {
  return leftCollapsed
    ? "lg:grid-cols-[2.5rem_minmax(0,1fr)]"
    : "lg:grid-cols-[var(--left-w,312px)_minmax(0,1fr)]";
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

/**
 * 국가법령정보센터식 경계 손잡이 — 패널과 본문 사이 경계의 세로 중앙에 붙는
 * 얇고 긴 화살표 탭. 클릭으로 패널 접기/펼치기.
 *   side="left"  = 좌패널(펼침: 오른쪽 변에 ◀ / 접힘: 스트립 중앙에 ▶)
 *   side="right" = 우패널(펼침: 왼쪽 변에 ▶ / 접힘: 스트립 중앙에 ◀)
 * 위치(absolute/중앙정렬)는 호출부가 className 으로 지정한다.
 */
export function PanelEdgeHandle({
  side,
  collapsed,
  onToggle,
  className,
}: {
  side: "left" | "right";
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const pointsLeft = side === "left" ? !collapsed : collapsed;
  const Icon = pointsLeft ? ChevronLeftIcon : ChevronRightIcon;
  const label =
    side === "left"
      ? collapsed
        ? "왼쪽 패널 펼치기"
        : "왼쪽 패널 접기"
      : collapsed
        ? "오른쪽 패널 펼치기"
        : "오른쪽 패널 접기";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
      className={cn(
        "border-border bg-card text-muted-foreground flex h-16 w-[18px] items-center justify-center rounded-lg border shadow-sm transition-colors",
        "hover:border-primary hover:bg-primary hover:text-primary-foreground",
        "focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
    >
      <Icon className="size-3.5" />
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
