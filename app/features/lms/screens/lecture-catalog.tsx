// 강의 카탈로그(강의 플랫폼) — course/T-PASS 판매 상품 목록 + 수강신청/구매 (feat-11 S2).
// 구매는 단건 결제: /api/payments/create-order(1-item 주문 경유) → 토스 requestPayment.
// 결제 성공 시 confirm 이 주문 fulfill → enrollments 지급(M4).
import { CheckIcon, GraduationCapIcon, TicketIcon } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { useCart } from "~/features/lms/lib/cart";
import { PRODUCT_KIND_LABEL } from "~/features/subscriptions/labels";
import {
  type LectureProduct,
  listSellableLectureProducts,
} from "~/features/lms/queries.server";

import type { Route } from "./+types/lecture-catalog";

export function meta() {
  return [{ title: "강의 카탈로그 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const products = await listSellableLectureProducts(client, user?.id ?? null);
  return {
    products,
    isAuthed: Boolean(user),
    tossClientKey: process.env.TOSS_CLIENT_KEY ?? null,
  };
}

// 단건 결제 개시 — pending payment 생성(서버 권위 금액) 후 토스 SDK 호출.
async function startLectureCheckout(
  product: LectureProduct,
  tossClientKey: string,
): Promise<void> {
  const fd = new FormData();
  fd.append("intent", "create-order");
  fd.append("planCode", product.code);
  const res = await fetch("/api/payments/create-order", {
    method: "POST",
    body: fd,
  });
  const json = (await res.json()) as {
    ok?: boolean;
    orderId?: string;
    amount?: number;
    error?: string;
  };
  if (!json.ok || !json.orderId) {
    alert(`결제 준비에 실패했습니다: ${json.error ?? "알 수 없는 오류"}`);
    return;
  }
  const amount = typeof json.amount === "number" ? json.amount : product.priceKrw;
  try {
    const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
    const tossPayments = await loadTossPayments(tossClientKey);
    const payment = tossPayments.payment({ customerKey: product.planId });
    await payment.requestPayment({
      method: "CARD",
      amount: { currency: "KRW", value: amount },
      orderId: json.orderId,
      orderName: product.name,
      successUrl: `${window.location.origin}/api/payments/toss/confirm`,
      failUrl: `${window.location.origin}/lecture/catalog?failed=1`,
    });
  } catch (e) {
    alert(
      `결제 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export default function LectureCatalog({ loaderData }: Route.ComponentProps) {
  const { products, isAuthed, tossClientKey } = loaderData;
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight">강의 카탈로그</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        영상 강의와 기간권(T-PASS)을 수강신청·구매합니다.
      </p>

      {products.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
          <GraduationCapIcon className="text-muted-foreground/50 size-10" />
          <p className="mt-4 text-sm font-medium">판매 중인 강의 상품이 없습니다</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            강의가 오픈되면 이곳에서 수강신청할 수 있습니다.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard
              key={p.planId}
              product={p}
              isAuthed={isAuthed}
              tossClientKey={tossClientKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({
  product,
  isAuthed,
  tossClientKey,
}: {
  product: LectureProduct;
  isAuthed: boolean;
  tossClientKey: string | null;
}) {
  const isTpass = product.productKind === "tpass";
  const { addPlan, has } = useCart();
  const inCart = has(`plan:${product.code}`);
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-[11px]">
            {isTpass ? (
              <TicketIcon className="size-3" />
            ) : (
              <GraduationCapIcon className="size-3" />
            )}
            {PRODUCT_KIND_LABEL[product.productKind]}
          </Badge>
          {product.durationDays > 0 ? (
            <span className="text-muted-foreground text-[11px]">
              {product.durationDays}일 수강
            </span>
          ) : null}
        </div>

        <h2 className="text-base leading-snug font-semibold text-balance">
          {product.name}
        </h2>
        {product.description ? (
          <p className="text-muted-foreground line-clamp-3 text-sm">
            {product.description}
          </p>
        ) : null}

        {product.courses.length > 0 ? (
          <ul className="text-muted-foreground mt-auto space-y-0.5 text-xs">
            {product.courses.slice(0, 4).map((c) => (
              <li key={c.courseId} className="truncate">
                · {c.title}
              </li>
            ))}
            {product.courses.length > 4 ? (
              <li>· 외 {product.courses.length - 4}개 강의</li>
            ) : null}
          </ul>
        ) : (
          <div className="mt-auto" />
        )}

        <div className="mt-2 flex items-center justify-between border-t pt-3">
          <span className="text-lg font-bold tabular-nums">
            {product.priceKrw.toLocaleString("ko-KR")}
            <span className="text-muted-foreground ml-0.5 text-xs font-normal">
              원
            </span>
          </span>
          {product.owned ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/lecture">수강 중</Link>
            </Button>
          ) : !isAuthed ? (
            <Button asChild size="sm">
              <Link to="/login">로그인 후 구매</Link>
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              {inCart ? (
                <Button asChild size="sm" variant="outline">
                  <Link to="/lecture/cart">
                    <CheckIcon className="size-3.5" /> 담김
                  </Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addPlan(product.code)}
                >
                  담기
                </Button>
              )}
              <Button
                size="sm"
                disabled={!tossClientKey}
                onClick={() =>
                  tossClientKey
                    ? startLectureCheckout(product, tossClientKey)
                    : undefined
                }
              >
                바로 구매
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
