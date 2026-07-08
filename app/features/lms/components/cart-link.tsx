// 강의 플랫폼 헤더 장바구니 아이콘 + 개수 배지(클라이언트 — localStorage 카트 구독).
import { ShoppingCartIcon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { useCart } from "~/features/lms/lib/cart";

export function CartLink() {
  const { count } = useCart();
  return (
    <Button asChild variant="ghost" size="icon" className="relative size-9">
      <Link to="/lecture/cart" aria-label="장바구니">
        <ShoppingCartIcon className="size-5" />
        {count > 0 ? (
          <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
