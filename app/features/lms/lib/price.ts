// 정상가·판매가 표시 규칙 SSOT (feat-11-008 보완 ⑤).
// 정상가가 없거나 판매가 이하이면 할인 표시를 하지 않는다 — 화면마다 조건을 다시 쓰지 않도록 한곳에 둔다.

export interface DiscountDisplay {
  /** 취소선으로 보여줄 정상가. 할인 표시를 하지 않을 때는 null. */
  listPriceKrw: number | null;
  /** 할인율(%) — 내림. 할인 표시를 하지 않을 때는 null. */
  percentOff: number | null;
}

export function getDiscountDisplay(
  priceKrw: number,
  listPriceKrw: number | null,
): DiscountDisplay {
  if (listPriceKrw == null || listPriceKrw <= priceKrw || listPriceKrw <= 0) {
    return { listPriceKrw: null, percentOff: null };
  }
  return {
    listPriceKrw,
    percentOff: Math.floor(((listPriceKrw - priceKrw) / listPriceKrw) * 100),
  };
}
