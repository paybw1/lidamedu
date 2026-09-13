// 팝업(Dialog)·시트(Sheet) 크기 조절 — 공용 조각.
//
// 배경(원장 지시 2026-09-13): 「팝업이나 시트의 크기를 사용자가 조절할 수 있게」.
// 크기가 96곳에 하드코딩돼 있어 호출부마다 손대지 않고 공용 컴포넌트에만 넣는다.
//
// ★기본은 꺼 둔다 — 「삭제할까요?」 같은 확인창에 손잡이가 붙으면 잡음이다.
//   내용이 많은 팝업에만 resizable 을 켠다.
// ★손가락(coarse pointer)에서는 손잡이를 숨긴다. 터치로는 쓸모가 없고 내용만 가린다.
// ★크기는 **클래스가 아니라 인라인 스타일**로 준다 — cn()/tailwind-merge 가
//   같은 그룹 클래스를 지워 "고쳤는데 화면 그대로"가 되는 일을 피한다.
// ★max-w-* 가 인라인 폭을 막는다 — 조절 중에는 maxWidth/maxHeight 를 함께 푼다.

import * as React from "react";

import { cn } from "~/core/lib/utils";

/** 조절 한계. 화면 밖으로 키우지 못하게 한다. */
export const RESIZE_MIN_W = 320;
export const RESIZE_MIN_H = 200;
export const RESIZE_MAX_VW = 0.98;
export const RESIZE_MAX_VH = 0.94;
/** 키보드 방향키 한 번에 움직이는 양. */
export const RESIZE_STEP = 16;

const STORAGE_PREFIX = "lidam:size:";

export type ResizeAxis = "both" | "x" | "y";

export interface ResizableSize {
  width?: number;
  height?: number;
}

const clampW = (w: number) =>
  Math.max(RESIZE_MIN_W, Math.min(w, window.innerWidth * RESIZE_MAX_VW));
const clampH = (h: number) =>
  Math.max(RESIZE_MIN_H, Math.min(h, window.innerHeight * RESIZE_MAX_VH));

/** 저장된 크기 읽기 — 사생활 보호 모드 등에서 던질 수 있어 감싼다. */
function readStored(key: string | undefined): ResizableSize | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const { width, height } = v as ResizableSize;
    return {
      width: typeof width === "number" ? width : undefined,
      height: typeof height === "number" ? height : undefined,
    };
  } catch {
    return null;
  }
}

function writeStored(key: string | undefined, size: ResizableSize) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(size));
  } catch {
    /* 저장 못 해도 이번 세션은 그대로 쓴다 */
  }
}

function clearStored(key: string | undefined) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* 무시 */
  }
}

/**
 * 크기 조절 상태.
 *
 * ★ref 는 콜백으로 받는다 — 상시 마운트된 Dialog 에서 RefObject 는 첫 열기에
 *   비어 있어 죽은 전례가 있다(2026-08 정리비교표 팝업).
 */
export function useResizable(opts: {
  enabled: boolean;
  axis: ResizeAxis;
  storageKey?: string;
}) {
  const { enabled, axis, storageKey } = opts;
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [size, setSize] = React.useState<ResizableSize | null>(null);
  const dragging = React.useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  // 저장분은 마운트 뒤에 읽는다 — SSR 중에는 localStorage 가 없다.
  React.useEffect(() => {
    if (!enabled) return;
    const stored = readStored(storageKey);
    if (!stored) return;
    setSize({
      width: stored.width != null ? clampW(stored.width) : undefined,
      height: stored.height != null ? clampH(stored.height) : undefined,
    });
  }, [enabled, storageKey]);

  // 창이 줄면 다시 맞춘다 — 화면 밖으로 삐져나가지 않게.
  React.useEffect(() => {
    if (!enabled) return;
    const onResize = () => {
      setSize((prev) => {
        if (!prev) return prev;
        return {
          width: prev.width != null ? clampW(prev.width) : undefined,
          height: prev.height != null ? clampH(prev.height) : undefined,
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enabled]);

  const apply = React.useCallback(
    (next: ResizableSize) => {
      setSize(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );

  const begin = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!node) return;
      const r = node.getBoundingClientRect();
      dragging.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: r.width,
        startH: r.height,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [node],
  );

  const move = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = dragging.current;
      if (!d) return;
      const next: ResizableSize = {};
      if (axis !== "y") next.width = clampW(d.startW + (e.clientX - d.startX));
      if (axis !== "x") next.height = clampH(d.startH + (e.clientY - d.startY));
      setSize(next);
    },
    [axis],
  );

  const end = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      dragging.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
      setSize((cur) => {
        if (cur) writeStored(storageKey, cur);
        return cur;
      });
    },
    [storageKey],
  );

  /** 손잡이 더블클릭 — 처음 크기로. */
  const reset = React.useCallback(() => {
    setSize(null);
    clearStored(storageKey);
  }, [storageKey]);

  /** 손잡이에 포커스가 있을 때 방향키로 조절. */
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (!node) return;
      const r = node.getBoundingClientRect();
      let dw = 0;
      let dh = 0;
      if (e.key === "ArrowLeft") dw = -RESIZE_STEP;
      else if (e.key === "ArrowRight") dw = RESIZE_STEP;
      else if (e.key === "ArrowUp") dh = -RESIZE_STEP;
      else if (e.key === "ArrowDown") dh = RESIZE_STEP;
      else return;
      e.preventDefault();
      const next: ResizableSize = {};
      if (axis !== "y") next.width = clampW(r.width + dw);
      if (axis !== "x") next.height = clampH(r.height + dh);
      apply(next);
    },
    [node, axis, apply],
  );

  // ★max-w-* / max-h-* 가 인라인 폭·높이를 막으므로 함께 푼다.
  const style: React.CSSProperties | undefined =
    enabled && size
      ? {
          ...(size.width != null
            ? { width: size.width, maxWidth: "none" }
            : null),
          ...(size.height != null
            ? { height: size.height, maxHeight: "none" }
            : null),
        }
      : undefined;

  return { setNode, style, begin, move, end, reset, onKeyDown, resized: !!size };
}

/** 조절 손잡이. 팝업은 모서리, 시트는 한쪽 변. */
export function ResizeGrip({
  axis,
  side,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onKeyDown,
}: {
  axis: ResizeAxis;
  /** 손잡이를 붙일 변. 팝업은 "corner". */
  side: "corner" | "left" | "right" | "top" | "bottom";
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
}) {
  const label =
    axis === "x" ? "너비 조절" : axis === "y" ? "높이 조절" : "크기 조절";
  return (
    <div
      role="separator"
      aria-orientation={axis === "y" ? "horizontal" : "vertical"}
      aria-label={`${label} — 끌어서 조절, 방향키로 미세 조절, 두 번 누르면 기본 크기`}
      title={`${label} (두 번 누르면 기본 크기)`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      className={cn(
        // 손가락에서는 숨긴다 — 터치로 못 쓰고 내용만 가린다.
        "absolute z-10 hidden touch-none select-none [@media(pointer:fine)]:block",
        "focus-visible:ring-ring/60 focus-visible:ring-2 focus-visible:outline-none",
        "after:bg-border/70 hover:after:bg-primary/60 after:absolute after:rounded-full after:transition-colors",
        side === "corner" &&
          "right-0.5 bottom-0.5 size-4 cursor-nwse-resize after:right-1 after:bottom-1 after:size-2",
        side === "left" &&
          "inset-y-0 left-0 w-2 cursor-ew-resize after:inset-y-1/2 after:left-0.5 after:h-10 after:w-1 after:-translate-y-1/2",
        side === "right" &&
          "inset-y-0 right-0 w-2 cursor-ew-resize after:inset-y-1/2 after:right-0.5 after:h-10 after:w-1 after:-translate-y-1/2",
        side === "top" &&
          "inset-x-0 top-0 h-2 cursor-ns-resize after:inset-x-1/2 after:top-0.5 after:h-1 after:w-10 after:-translate-x-1/2",
        side === "bottom" &&
          "inset-x-0 bottom-0 h-2 cursor-ns-resize after:inset-x-1/2 after:bottom-0.5 after:h-1 after:w-10 after:-translate-x-1/2",
      )}
    />
  );
}
