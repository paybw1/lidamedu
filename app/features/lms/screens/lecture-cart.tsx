// 강의 플랫폼 장바구니 — localStorage 카트(강의·도서) 표시 + 다건 결제.
// 결제: /api/payments/create-cart-order(서버 가격 재검증) → 토스 → confirm 이 전 항목 지급.
// feat-13 — 쿠폰 코드 입력·서버 미리보기(preview-cart-coupon) → 할인 표시 후 결제에 반영.
import { useState } from "react";

import {
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
  TicketPercentIcon,
  Trash2Icon,
} from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { startCartCheckout } from "~/features/lms/lib/cart-checkout";
import { cartItemKey, useCart } from "~/features/lms/lib/cart";
import { listBundles } from "~/features/bookstore/queries.server";
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
  const [products, bundles] = await Promise.all([
    listSellableLectureProducts(client, user?.id ?? null),
    listBundles(client),
  ]);
  const { data: books } = await client
    .from("books")
    .select("book_id, title, price_krw, cover_path")
    .eq("sale_status", "on_sale")
    .is("deleted_at", null);
  return {
    products,
    books: books ?? [],
    bundles,
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

type CouponState =
  | { status: "none" }
  | { status: "applied"; code: string; name: string; discount: number }
  | { status: "error"; message: string };

export default function LectureCart({ loaderData }: Route.ComponentProps) {
  const { products, books, bundles, isAuthed, tossClientKey } = loaderData;
  const { items, remove, setBookQty, clear, addBook } = useCart();
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponState>({ status: "none" });
  const [checking, setChecking] = useState(false);

  const planByCode = new Map(products.map((p) => [p.code, p]));
  const bookById = new Map(books.map((b) => [b.book_id, b]));
  const bundleById = new Map(bundles.map((b) => [b.bundleId, b]));

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
    } else if (it.kind === "bundle") {
      const bn = bundleById.get(it.bundleId);
      if (!bn) continue;
      lines.push({
        key: cartItemKey(it),
        name: `[세트] ${bn.title}`,
        unitPrice: bn.priceKrw,
        quantity: 1,
        lineTotal: bn.priceKrw,
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
  // ★필수 교재 미담김 경고 (feat-11-012 P4 — 최소안).
  //   배지로 필수/선택을 보여주면서도 수강신청 버튼은 강의만 결제했다. 경고도 동반 담기도
  //   없어서, 목록 카드에서 바로 산 사람은 필수 교재가 있다는 사실조차 못 봤다.
  //   ★서버 강제(동반 결제)는 **원장 결정** — 그리고 카탈로그 카드의 「바로 구매」가 아직
  //     결제 검증 함수를 우회하므로(뮤테이션 경로 동결) 그 경로를 통일한 뒤에야 실효가 있다.
  //   필요한 값(product.books[].requirement)은 이미 실려 있어 추가 쿼리가 없다.
  const bookIdsInCart = new Set(
    items.filter((i) => i.kind === "book").map((i) => i.bookId),
  );
  const missingRequired: Array<{ bookId: string; title: string }> = [];
  for (const it of items) {
    if (it.kind !== "plan") continue;
    const p = planByCode.get(it.code);
    if (!p) continue;
    for (const b of p.books) {
      if (b.requirement !== "required") continue;
      if (b.soldOut) continue; // 품절 교재를 담으라고 권하지 않는다
      if (bookIdsInCart.has(b.bookId)) continue;
      if (missingRequired.some((m) => m.bookId === b.bookId)) continue;
      missingRequired.push({ bookId: b.bookId, title: b.title });
    }
  }

  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  const discount =
    coupon.status === "applied" ? Math.min(coupon.discount, total) : 0;
  const payable = Math.max(0, total - discount);

  const buildPayload = () =>
    items
      .map((it) =>
        it.kind === "plan"
          ? planByCode.has(it.code)
            ? { kind: "plan" as const, code: it.code }
            : null
          : it.kind === "bundle"
            ? bundleById.has(it.bundleId)
              ? { kind: "bundle" as const, bundleId: it.bundleId }
              : null
            : bookById.has(it.bookId)
              ? { kind: "book" as const, bookId: it.bookId, quantity: it.quantity }
              : null,
      )
      .filter((x): x is NonNullable<typeof x> => x !== null);

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code || checking) return;
    setChecking(true);
    try {
      const fd = new FormData();
      fd.append("items", JSON.stringify(buildPayload()));
      fd.append("code", code);
      const res = await fetch("/api/coupons/preview-cart", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        name?: string;
        discountKrw?: number;
        error?: string;
      };
      if (json.ok) {
        setCoupon({
          status: "applied",
          code,
          name: json.name ?? "쿠폰",
          discount: json.discountKrw ?? 0,
        });
      } else {
        setCoupon({ status: "error", message: json.error ?? "쿠폰을 적용할 수 없습니다." });
      }
    } catch {
      setCoupon({ status: "error", message: "쿠폰 확인 중 오류가 발생했습니다." });
    } finally {
      setChecking(false);
    }
  };

  const clearCoupon = () => {
    setCoupon({ status: "none" });
    setCouponInput("");
  };

  const onCheckout = () => {
    if (!tossClientKey) return;
    const payload = buildPayload();
    if (payload.length === 0) return;
    const code = coupon.status === "applied" ? coupon.code : undefined;
    void startCartCheckout(payload, tossClientKey, "/lecture/cart?failed=1", code);
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
          {missingRequired.length > 0 ? (
            <div className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 mt-6 rounded-xl border px-4 py-3">
              <p className="text-sm font-semibold">
                담긴 강의의 필수 교재 {missingRequired.length}권이 장바구니에 없습니다
              </p>
              <ul className="mt-2 space-y-1.5">
                {missingRequired.map((m) => (
                  <li
                    key={m.bookId}
                    className="flex items-center justify-between gap-3"
                  >
                    <Link
                      to={`/lecture/books/${m.bookId}`}
                      className="min-w-0 flex-1 truncate text-sm hover:underline"
                    >
                      {m.title}
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addBook(m.bookId)}
                    >
                      담기
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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

          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={clear}
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              전체 비우기
            </button>
          </div>

          {/* 쿠폰 */}
          {isAuthed ? (
            <div className="mt-5 rounded-xl border p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <TicketPercentIcon className="size-4" /> 쿠폰
              </p>
              {coupon.status === "applied" ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{coupon.name}</p>
                    <p className="text-primary text-xs font-semibold tabular-nums">
                      -{coupon.discount.toLocaleString("ko-KR")}원 적용됨
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearCoupon}
                    className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline"
                  >
                    해제
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="쿠폰 코드 입력"
                      className="h-9"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void applyCoupon();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 shrink-0"
                      disabled={!couponInput.trim() || checking}
                      onClick={() => void applyCoupon()}
                    >
                      {checking ? "확인 중…" : "적용"}
                    </Button>
                  </div>
                  {coupon.status === "error" ? (
                    <p className="text-destructive mt-1.5 text-xs">
                      {coupon.message}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {/* 합계 */}
          <div className="mt-5 space-y-1.5 text-right">
            <div className="flex items-center justify-end gap-3 text-sm">
              <span className="text-muted-foreground">상품 금액</span>
              <span className="w-28 tabular-nums">
                {total.toLocaleString("ko-KR")}원
              </span>
            </div>
            {discount > 0 ? (
              <div className="text-primary flex items-center justify-end gap-3 text-sm">
                <span>쿠폰 할인</span>
                <span className="w-28 tabular-nums">
                  -{discount.toLocaleString("ko-KR")}원
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-3 pt-1">
              <span className="text-muted-foreground text-xs">결제 금액</span>
              <span className="w-28 text-xl font-bold tabular-nums">
                {payable.toLocaleString("ko-KR")}원
              </span>
            </div>
          </div>

          <div className="mt-4">
            {isAuthed ? (
              <Button
                className="w-full"
                size="lg"
                disabled={!tossClientKey || payable <= 0}
                onClick={onCheckout}
              >
                {payable.toLocaleString("ko-KR")}원 결제하기
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
