// 결제 완료 복귀(/lecture?purchased=1) 시 장바구니 비우기. 강의 플랫폼 레이아웃에 상시 마운트.
import { useEffect } from "react";
import { useSearchParams } from "react-router";

import { useCart } from "~/features/lms/lib/cart";

export function CartClearOnPurchase() {
  const [sp] = useSearchParams();
  const { clear } = useCart();
  useEffect(() => {
    if (sp.get("purchased") === "1") clear();
  }, [sp, clear]);
  return null;
}
