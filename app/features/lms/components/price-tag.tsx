// 가격 표시 부품 (feat-11-012 P4) — 정가 취소선 · 할인율 · 판매가.
//
// ★같은 상품의 가격이 구매 4단계에서 제각각 보였다 — 목록 카드는 「30%」에 정가 단위가 없고,
//   상세 헤더는 「30% 할인」에 원이 붙고, 하단 구매바에는 할인율이 없고, 도서 상세에는
//   취소선이 아예 없었다(정가는 loader 가 내려주는데 화면이 참조하지 않았다).
//   목록에서 30%를 보고 담은 사람이 다음 화면에서 할인이 먹었는지 확인할 근거가 없다.
// ★할인 여부 판정은 여전히 price.ts 의 getDiscountDisplay 하나 — 이 부품은 그것을 **표시**만 한다.
import { cn } from "~/core/lib/utils";

import { getDiscountDisplay } from "../lib/price";

/**
 * 학생 표면의 금액 표기.
 * ★P6(표기 SSOT)에서 공용 포매터가 생기면 이 함수만 그것으로 바꾼다 — 호출부는 그대로다.
 */
function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

const SIZES = {
  sm: { list: "text-[11px]", off: "text-[11px]", price: "text-sm" },
  md: { list: "text-xs", off: "text-xs", price: "text-lg" },
  lg: { list: "text-sm", off: "text-sm", price: "text-2xl" },
} as const;

export function PriceTag({
  priceKrw,
  listPriceKrw,
  size = "md",
  className,
}: {
  priceKrw: number;
  /** 정상가. 판매가 이하이거나 없으면 할인 표시를 하지 않는다. */
  listPriceKrw: number | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const d = getDiscountDisplay(priceKrw, listPriceKrw);
  const s = SIZES[size];
  return (
    <span
      className={cn(
        "flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5",
        className,
      )}
    >
      {d.listPriceKrw != null ? (
        <>
          <span
            className={cn(
              "text-muted-foreground line-through tabular-nums",
              s.list,
            )}
          >
            {won(d.listPriceKrw)}
          </span>
          <span
            className={cn(
              "font-semibold text-rose-600 dark:text-rose-400",
              s.off,
            )}
          >
            {d.percentOff}% 할인
          </span>
        </>
      ) : null}
      <span className={cn("font-bold tabular-nums", s.price)}>
        {won(priceKrw)}
      </span>
    </span>
  );
}
