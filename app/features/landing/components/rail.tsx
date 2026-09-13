// 가로 카드 레일 — 한 칸씩 넘기는 캐러셀(스크롤바 없음, 카드 잘림 없음).
//   뷰 폭을 '완전히 보이는 카드 수'에 딱 맞춰 고정 → 옆 카드가 잘려 보이지 않음.
//   좌우 화살표는 항상 노출(끝에서는 흐려짐), 클릭 시 카드 1칸(STRIDE)씩 이동.
//   강사진·현장강의 일정 등 고정폭 카드 레일 공용. *.server 값 import 금지.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useSwipe } from "~/core/hooks/use-swipe";

// 좌우 화살표가 차지하는 여백. 좁은 화면에서는 조금 줄인다.
const GUTTER_NARROW = 44;
const GUTTER_WIDE = 56;
const NARROW_WIDTH = 520;

// 페이지형 레일 계산 훅 — 카드 고정폭·간격 기준으로 perPage·offset 산출.
function usePagedRail(count: number, cardWidth: number, gap: number) {
  const stride = cardWidth + gap;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState(1);
  const [index, setIndex] = useState(0);

  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const gutter =
      el.clientWidth < NARROW_WIDTH ? GUTTER_NARROW : GUTTER_WIDE;
    const avail = el.clientWidth - gutter * 2;
    const fit = Math.max(1, Math.floor((avail + gap) / stride));
    setPerPage(Math.min(fit, Math.max(1, count)));
  }, [stride, gap, count]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const maxIndex = Math.max(0, count - perPage);
  useEffect(() => {
    setIndex((i) => Math.min(i, maxIndex));
  }, [maxIndex]);

  const go = (dir: 1 | -1) =>
    setIndex((i) => Math.min(maxIndex, Math.max(0, i + dir)));

  return {
    wrapRef,
    viewW: perPage * cardWidth + (perPage - 1) * gap,
    offset: index * stride,
    index,
    maxIndex,
    go,
  };
}

export function Rail({
  cardWidth,
  gap = 16,
  count,
  ariaPrev = "이전",
  ariaNext = "다음",
  children,
}: {
  cardWidth: number;
  gap?: number;
  count: number;
  ariaPrev?: string;
  ariaNext?: string;
  children: ReactNode;
}) {
  const { wrapRef, viewW, offset, index, maxIndex, go } = usePagedRail(
    count,
    cardWidth,
    gap,
  );
  // ★손가락으로 넘기기 — 종전에는 터치 처리가 0건이라 겹쳐 뜬 화살표를 정확히 눌러야만
  //   넘어갔다(강사 8명을 보려면 화살표를 7번 탭).
  const swipe = useSwipe({ onPrev: () => go(-1), onNext: () => go(1) });
  return (
    <div className="irailwrap" ref={wrapRef} {...swipe}>
      <button
        type="button"
        className="irail-nav prev"
        aria-label={ariaPrev}
        onClick={() => go(-1)}
        disabled={index <= 0}
      >
        ‹
      </button>
      <div className="irailview" style={{ width: viewW }}>
        <div className="irailtrack" style={{ transform: `translateX(-${offset}px)` }}>
          {children}
        </div>
      </div>
      <button
        type="button"
        className="irail-nav next"
        aria-label={ariaNext}
        onClick={() => go(1)}
        disabled={index >= maxIndex}
      >
        ›
      </button>
    </div>
  );
}
