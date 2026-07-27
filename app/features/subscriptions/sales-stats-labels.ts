// feat-11-007 #7 — 매출 상품유형 분류 라벨(클라·서버 공용, 비-server). 화면(클라)에서
//   value import 해도 안전하도록 sales-stats.server 에서 분리.
export type ItemCategory = "subscription" | "course" | "book";
export const ITEM_CATEGORIES: ItemCategory[] = ["subscription", "course", "book"];
export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  subscription: "정기구독",
  course: "강의",
  book: "도서",
};

export function classifyItem(
  itemType: string,
  productKind: string | null,
): ItemCategory {
  if (itemType === "book") return "book";
  if (productKind === "course" || productKind === "tpass") return "course";
  return "subscription";
}
