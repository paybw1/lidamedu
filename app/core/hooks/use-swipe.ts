// 손가락으로 넘기기 (feat-11-012 P2).
//
// ★배너·카드 레일에 터치 처리가 **한 줄도 없었다** — 겹쳐 뜬 화살표를 정확히 눌러야만
//   넘어갔다(강사 8명을 보려면 화살표를 7번 탭). 저장소 어디에도 scroll-snap 이 없어
//   본뜰 관용구가 없었고, 캐러셀 라이브러리를 새로 들이지 않는다는 것이 설계 전제다.
//
// ★스와이프가 화면 이동으로 새지 않게 하는 것이 이 훅의 핵심이다 — 배너 슬라이드와
//   레일 카드가 전부 <Link> 라, 손가락을 끌어 넘긴 뒤 따라오는 click 을 막지 않으면
//   "넘겼는데 엉뚱한 페이지로 들어간다"가 된다. click 은 capture 단계에서 삼킨다.
//
// ★마우스는 대상이 아니다. 화살표·키보드가 이미 있고, 마우스 드래그를 가로채면
//   글자 선택·링크 클릭이 어긋난다.

import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";

/** 스와이프로 인정할 최소 가로 이동(px). 이보다 작으면 탭으로 본다. */
export const SWIPE_MIN_DISTANCE = 44;
/** 세로 이동이 가로보다 크면 페이지 스크롤로 본다(가로 제스처가 스크롤을 훔치지 않게). */
export const SWIPE_VERTICAL_TOLERANCE = 1;

export interface SwipeHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onClickCapture: (e: ReactMouseEvent<HTMLElement>) => void;
}

export function useSwipe(opts: {
  onPrev: () => void;
  onNext: () => void;
  /** 손가락이 닿는 순간 한 번 — 자동 넘김을 멈추는 용도(선택). */
  onTouchStart?: () => void;
}): SwipeHandlers {
  const { onPrev, onNext, onTouchStart } = opts;
  const from = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  return {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse") return;
      from.current = { x: e.clientX, y: e.clientY };
      swiped.current = false;
      onTouchStart?.();
    },
    onPointerUp: (e) => {
      const start = from.current;
      from.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return; // 짧은 탭 — 링크를 살린다
      if (Math.abs(dy) > Math.abs(dx) * SWIPE_VERTICAL_TOLERANCE) return; // 세로 스크롤
      swiped.current = true;
      if (dx < 0) onNext();
      else onPrev();
    },
    onPointerCancel: () => {
      from.current = null;
    },
    onClickCapture: (e) => {
      if (!swiped.current) return;
      swiped.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
