// 현장강의 상세 하단 sticky 구매 바 — 장바구니 + 수강신청(바로구매).
//   연결 상품(plan)이 있으면 실제 담기/결제, 없으면 카탈로그로 유도. *.server import 금지.
//   수강료는 본문 결제금액(.sd-price)에서 이미 보여주므로 바에는 버튼만 둔다.
import { ShoppingCartIcon } from "lucide-react";
import { Link } from "react-router";

import { AsyncActionButton } from "~/core/components/async-action-button";
import { Button } from "~/core/components/ui/button";
import { startCartCheckout } from "~/features/lms/lib/cart-checkout";
import { useCart } from "~/features/lms/lib/cart";

export function ScheduleBuyBar({
  planCode,
  buyable,
  tossClientKey,
  failPath,
}: {
  planCode: string | null;
  buyable: boolean;
  tossClientKey: string | null;
  failPath: string;
}) {
  const { addPlan, has } = useCart();
  const inCart = planCode ? has(`plan:${planCode}`) : false;

  const buyNow = async () => {
    if (!planCode || !tossClientKey) return;
    await startCartCheckout(
      [{ kind: "plan", code: planCode }],
      tossClientKey,
      failPath,
    );
  };

  return (
    <div className="sbuy">
      <div className="sbuy-in">
        <div className="sbuy-btns">
          {planCode && buyable ? (
            <>
              {inCart ? (
                <Button asChild variant="outline" size="lg">
                  <Link to="/lecture/cart">
                    <ShoppingCartIcon className="size-4" /> 장바구니 보기
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => addPlan(planCode)}
                >
                  <ShoppingCartIcon className="size-4" /> 장바구니
                </Button>
              )}
              <AsyncActionButton
                size="lg"
                disabled={!tossClientKey}
                onRun={buyNow}
                pendingLabel="결제 준비 중…"
              >
                수강신청
              </AsyncActionButton>
            </>
          ) : (
            <Button asChild size="lg">
              <Link to="/lecture/catalog">수강신청 →</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
