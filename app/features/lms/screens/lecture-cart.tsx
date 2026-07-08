// 강의 플랫폼 장바구니 — localStorage 카트(강의·도서) 표시 + 다건 결제.
// 결제: /api/payments/create-cart-order(서버 가격 재검증) → 토스 → confirm 이 전 항목 지급.
import { MinusIcon, PlusIcon, ShoppingCartIcon, Trash2Icon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cartItemKey, useCart } from "~/features/lms/lib/cart";
import { listSellableLectureProducts } from "~/features/lms/queries.server";

import type { Route } from "./+types/lecture-cart";

export function meta() {
  return [{ title: "장바구니 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const products = await listSellableLectureProducts(client, user?.id ?? null);
  const { data: books } = await client
    .from("books")
    .select("book_id, title, price_krw, cover_path")
    .eq("sale_status", "on_sale")
    .is("deleted_at", null);
  return {
    products,
    books: books ?? [],
    isAuthed: Boolean(user),
    tossClientKey: process.env.TOSS_CLIENT_KEY ?? null,
  };
}

interface Line {
  key: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  isBook: boolean;
  bookId?: string;
}

async function checkout(
  payload: Array<
    { kind: "plan"; code: string } | { kind: "book"; bookId: string; quantity: number }
  >,
  tossClientKey: string,
): Promise<void> {
  const fd = new FormData();
  fd.append("items", JSON.stringify(payload));
  const res = await fetch("/api/payments/create-cart-order", {
    method: "POST",
    body: fd,
  });
  const json = (await res.json()) as {
    ok?: boolean;
    orderId?: string;
    amount?: number;
    orderName?: string;
    error?: string;
  };
  if (!json.ok || !json.orderId) {
    alert(`결제 준비에 실패했습니다: ${json.error ?? "알 수 없는 오류"}`);
    return;
  }
  try {
    const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
    const tossPayments = await loadTossPayments(tossClientKey);
    const payment = tossPayments.payment({ customerKey: json.orderId });
    await payment.requestPayment({
      method: "CARD",
      amount: { currency: "KRW", value: json.amount ?? 0 },
      orderId: json.orderId,
      orderName: json.orderName ?? "리담 강의",
      successUrl: `${window.location.origin}/api/payments/toss/confirm`,
      failUrl: `${window.location.origin}/lecture/cart?failed=1`,
    });
  } catch (e) {
    alert(
      `결제 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export default function LectureCart({ loaderData }: Route.ComponentProps) {
  const { products, books, isAuthed, tossClientKey } = loaderData;
  const { items, remove, setBookQty, clear } = useCart();

  const planByCode = new Map(products.map((p) => [p.code, p]));
  const bookById = new Map(books.map((b) => [b.book_id, b]));

  const lines: Line[] = [];
  for (const it of items) {
    if (it.kind === "plan") {
      const p = planByCode.get(it.code);
      if (!p) continue; // 판매 종료/미확인 상품은 표시 제외
      lines.push({
        key: cartItemKey(it),
        name: p.name,
        unitPrice: p.priceKrw,
        quantity: 1,
        lineTotal: p.priceKrw,
        isBook: false,
      });
    } else {
      const b = bookById.get(it.bookId);
      if (!b) continue;
      lines.push({
        key: cartItemKey(it),
        name: b.title,
        unitPrice: b.price_krw,
        quantity: it.quantity,
        lineTotal: b.price_krw * it.quantity,
        isBook: true,
        bookId: it.bookId,
      });
    }
  }
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);

  const onCheckout = () => {
    if (!tossClientKey) return;
    const payload = items
      .map((it) =>
        it.kind === "plan"
          ? planByCode.has(it.code)
            ? { kind: "plan" as const, code: it.code }
            : null
          : bookById.has(it.bookId)
            ? { kind: "book" as const, bookId: it.bookId, quantity: it.quantity }
            : null,
      )
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (payload.length === 0) return;
    void checkout(payload, tossClientKey);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <ShoppingCartIcon className="size-6" /> 장바구니
      </h1>

      {lines.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
          <ShoppingCartIcon className="text-muted-foreground/40 size-10" />
          <p className="mt-4 text-sm font-medium">장바구니가 비어 있습니다</p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/lecture/catalog">강의 둘러보기</Link>
          </Button>
        </div>
      ) : (
        <>
          <ul className="mt-6 divide-y rounded-xl border">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {l.unitPrice.toLocaleString("ko-KR")}원
                    {l.isBook ? ` · ${l.quantity}권` : ""}
                  </p>
                </div>
                {l.isBook && l.bookId ? (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => setBookQty(l.bookId!, l.quantity - 1)}
                      disabled={l.quantity <= 1}
                    >
                      <MinusIcon className="size-3.5" />
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">
                      {l.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => setBookQty(l.bookId!, l.quantity + 1)}
                    >
                      <PlusIcon className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
                <span className="w-24 text-right text-sm font-semibold tabular-nums">
                  {l.lineTotal.toLocaleString("ko-KR")}원
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-8"
                  aria-label="삭제"
                  onClick={() => remove(l.key)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={clear}
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              전체 비우기
            </button>
            <div className="text-right">
              <span className="text-muted-foreground text-xs">합계 </span>
              <span className="text-xl font-bold tabular-nums">
                {total.toLocaleString("ko-KR")}원
              </span>
            </div>
          </div>

          <div className="mt-4">
            {isAuthed ? (
              <Button
                className="w-full"
                size="lg"
                disabled={!tossClientKey}
                onClick={onCheckout}
              >
                {total.toLocaleString("ko-KR")}원 결제하기
              </Button>
            ) : (
              <Button asChild className="w-full" size="lg">
                <Link to="/login">로그인 후 결제</Link>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
