// feat-11-011 P2 — 주문 항목 표시명 SSOT. 관리자·학생 화면이 **모두** 이 함수만 쓴다.
// (.server 아님 — 화면에서 직접 부른다.)
//
// ★내부코드는 어떤 경우에도 화면에 나오지 않는다. `course_extension` 이 학생 결제내역에
//   그대로 찍히던 것이 요청서 §3.1 의 지적이었다.
// ★이름은 **주문 시점 스냅샷**(order_items.title_snapshot)이 우선이다. 상품명이 바뀌거나
//   상품이 내려가도 과거 영수증은 그때 산 이름을 보여야 한다.

/** 주문 항목 유형 — DB `order_items.item_type`. */
export const ORDER_ITEM_TYPE_LABEL: Record<string, string> = {
  plan: "강의·수강권",
  book: "교재",
  course_extension: "수강기간 연장",
};

export function orderItemTypeLabel(itemType: string | null | undefined): string {
  if (!itemType) return "주문 항목";
  return ORDER_ITEM_TYPE_LABEL[itemType] ?? "주문 항목";
}

export interface OrderItemLabelInput {
  itemType?: string | null;
  /** order_items.title_snapshot — 주문 시점의 이름. */
  titleSnapshot?: string | null;
  /** 조인으로 얻은 현재 상품명(스냅샷이 없는 옛 주문 대비). */
  planName?: string | null;
  bookTitle?: string | null;
}

/** 화면에 쓸 항목 이름. 어떤 경우에도 내부코드를 돌려주지 않는다. */
export function orderItemLabel(input: OrderItemLabelInput): string {
  const snap = input.titleSnapshot?.trim();
  if (snap) return snap;
  const joined = input.planName?.trim() || input.bookTitle?.trim();
  if (joined) return joined;
  return orderItemTypeLabel(input.itemType);
}

/** 수량까지 붙인 한 줄 표기 — "리담특허법 [제25판] × 2". 1개면 수량을 쓰지 않는다. */
export function orderItemLabelWithQuantity(
  input: OrderItemLabelInput & { quantity?: number | null },
): string {
  const label = orderItemLabel(input);
  const q = input.quantity ?? 1;
  return q > 1 ? `${label} × ${q}` : label;
}
