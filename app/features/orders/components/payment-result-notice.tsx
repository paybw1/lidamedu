// 결제 결과 알림 — 강의 플랫폼 레이아웃에 **한 번** 마운트한다 (feat-11-012 P5).
//
// ★종전: 실패 시 원래 화면으로 되돌려 보내는 곳이 6군데인데, 그 「실패했음」 표시를 읽어
//   보여주는 화면이 **한 곳도 없었다**. 사용자는 결제창이 닫히고 튕겨 돌아왔는데 성공인지
//   실패인지 알 수 없었다. 토스가 사유(code·message)까지 주소에 붙여 보내는데도 그랬다.
// ★화면마다 배너를 붙이지 않는다 — 복귀 6곳이 전부 이 레이아웃 아래라, 이미 여기 마운트돼
//   있던 「장바구니 비우기」 부품을 넓히면 한 곳으로 끝난다.
// ★장바구니는 **결제한 항목만** 비운다(cart.ts clearPurchasedItems) — 통째로 비우면
//   강의 셋을 담아둔 채 책 한 권을 바로 산 사람이 담아둔 셋을 잃는다.
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { clearPurchasedItems } from "~/features/lms/lib/cart";

import {
  PAYMENT_RETURN_PARAMS,
  readPaymentReturn,
} from "../lib/payment-return";

/** 토스트 중복 방지 키 — StrictMode 이중 effect·빠른 재렌더에도 한 번만 뜨게. */
const TOAST_ID = "payment-result";

export function PaymentResultNotice() {
  const [searchParams, setSearchParams] = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const result = readPaymentReturn(searchParams);
    if (!result) return;
    handled.current = true;

    // 장바구니 정리는 바로 — 화면이 곧 이 값을 읽는다.
    if (result.kind === "paid") clearPurchasedItems();

    // ★토스트는 **다음 틱**에 띄운다. 이 부품은 레이아웃(children) 안이라 root 의
    //   <Toaster> 보다 effect 가 **먼저** 돈다 — 그 시점에 부른 토스트는 Toaster 가 아직
    //   구독하기 전이라 그냥 사라진다(실제로 알림이 뜨지 않고 주소만 정리됐다).
    //   cleanup 에서 취소하지 않는다 — 아래 setSearchParams 가 곧 deps 를 바꾸기 때문에
    //   취소하면 알림이 영영 안 뜬다(handled 로 중복을 막는다).
    window.setTimeout(() => {
      if (result.kind === "paid") {
        toast.success("결제가 완료되었습니다.", { id: TOAST_ID });
      } else if (result.kind === "deposit") {
        toast.info("입금이 확인되면 바로 지급됩니다.", {
          id: TOAST_ID,
          description: "입금 기한 안에 보내 주세요.",
        });
      } else {
        toast.error("결제가 완료되지 않았습니다.", {
          id: TOAST_ID,
          // 사유는 토스가 보낸 문구 — 글자로만 그린다.
          description: result.message ?? undefined,
        });
      }

      // 표시했으면 주소에서 지운다 — 새로고침·뒤로가기에 같은 알림이 되살아나지 않게.
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const key of PAYMENT_RETURN_PARAMS) next.delete(key);
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    }, 0);
  }, [searchParams, setSearchParams]);

  return null;
}
