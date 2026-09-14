// 강의 플랫폼 장바구니 — localStorage 카트(강의·도서) 표시 + 다건 결제.
// 결제: /api/payments/create-cart-order(서버 가격 재검증) → 토스 → confirm 이 전 항목 지급.
//
// ★금액의 권위는 **서버**다 (feat-11-012 P5-b). 화면은 /api/lecture/cart/quote 가 준 숫자를
//   그리기만 한다. 종전에는 화면이 자기 방식으로 더했고 **배송비를 몰라** 버튼에 적힌 금액과
//   실제 청구액이 달랐다. 견적은 결제와 **같은 함수**(resolveCartItems)를 쓰므로
//   "화면엔 되는데 결제는 거절"이 구조적으로 생기지 않는다.
// ★쿠폰도 화면 상태가 아니라 **견적 요청의 입력**이다 — 항목을 지우거나 수량을 바꾸면
//   견적을 다시 받으므로 "할인액만 남아 있다가 결제에서 거절"이 따로 손대지 않아도 닫힌다.
import { useEffect, useState } from "react";

import {
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
  TicketPercentIcon,
  Trash2Icon,
} from "lucide-react";
import { Link } from "react-router";

import { AsyncActionButton } from "~/core/components/async-action-button";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { CheckoutSheet } from "~/features/orders/components/checkout-sheet";
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
  /**
   * 더 이상 팔지 않는 항목. ★종전에는 이런 항목을 **말없이 건너뛰어**, 헤더 배지는 2인데
   * 화면은 비어 있는 일이 실제로 났다. 지우기 전까지는 자리에 남겨 둔다.
   */
  unavailable?: boolean;
}

/** /api/lecture/cart/quote 응답. */
type Quote =
  | {
      ok: true;
      subtotalKrw: number;
      shippingFeeKrw: number;
      freeShippingThresholdKrw: number;
      freeShippingRemainKrw: number;
      couponName: string | null;
      couponDiscountKrw: number;
      couponError: string | null;
      payableKrw: number;
    }
  | { ok: false; error: string };

/** 더 이상 팔지 않는 항목의 자리 — 금액 0으로 두고 표시만 한다. */
function unavailableLine(key: string, name: string): Line {
  return {
    key,
    name,
    unitPrice: 0,
    quantity: 1,
    lineTotal: 0,
    isBook: false,
    unavailable: true,
  };
}

export default function LectureCart({ loaderData }: Route.ComponentProps) {
  const { products, books, bundles, isAuthed, tossClientKey } = loaderData;
  const { items, remove, setBookQty, clear, addBook } = useCart();
  const [couponInput, setCouponInput] = useState("");
  /** 적용을 시도한 쿠폰 코드 — 할인액은 서버 견적이 준다(화면이 들고 있지 않는다). */
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);

  const planByCode = new Map(products.map((p) => [p.code, p]));
  const bookById = new Map(books.map((b) => [b.book_id, b]));
  const bundleById = new Map(bundles.map((b) => [b.bundleId, b]));

  const lines: Line[] = [];
  for (const it of items) {
    if (it.kind === "plan") {
      const p = planByCode.get(it.code);
      if (!p) {
        lines.push(unavailableLine(cartItemKey(it), "판매 종료된 강의"));
        continue;
      }
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
      if (!bn) {
        lines.push(unavailableLine(cartItemKey(it), "판매 종료된 세트"));
        continue;
      }
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
      if (!b) {
        lines.push(unavailableLine(cartItemKey(it), "판매 종료된 도서"));
        continue;
      }
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

  const hasUnavailable = lines.some((l) => l.unavailable);
  const q = quote?.ok ? quote : null;

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

  // 항목·쿠폰이 바뀌면 견적을 다시 받는다. 문자열을 의존성으로 써서 같은 내용이면 다시 안 부른다.
  const payloadJson = JSON.stringify(buildPayload());
  useEffect(() => {
    const payload: unknown[] = JSON.parse(payloadJson);
    if (payload.length === 0) {
      setQuote(null);
      return;
    }
    // ★응답 역전 방지 — 수량 +/- 를 연타하면 늦게 온 옛 응답이 금액을 덮을 수 있다.
    let alive = true;
    setQuote(null);
    const fd = new FormData();
    fd.append("items", payloadJson);
    if (appliedCode) fd.append("code", appliedCode);
    fetch("/api/lecture/cart/quote", { method: "POST", body: fd })
      .then((r) => r.json() as Promise<Quote>)
      .then((j) => {
        if (alive) setQuote(j);
      })
      .catch(() => {
        if (alive) {
          setQuote({
            ok: false,
            error: "금액을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [payloadJson, appliedCode]);

  const clearCoupon = () => {
    setAppliedCode(null);
    setCouponInput("");
  };

  // ★결제 버튼은 이제 **바로 결제창을 열지 않는다.** 결제수단(카드·무통장)과 배송지를
  //   받는 시트를 먼저 연다 — 실물 교재가 든 장바구니는 주소 없이 나가면 안 된다.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const checkoutItems = buildPayload();
  const couponForCheckout = q?.couponName ? (appliedCode ?? undefined) : undefined;
  const onCheckout = async () => {
    if (!tossClientKey || checkoutItems.length === 0) return;
    setCheckoutOpen(true);
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
                  {l.unavailable ? (
                    <p className="text-destructive text-xs">
                      지금은 판매하지 않습니다 — 지워 주세요
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {l.unitPrice.toLocaleString("ko-KR")}원
                      {l.isBook ? ` · ${l.quantity}권` : ""}
                    </p>
                  )}
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

          {/* 쿠폰 — 할인액은 화면이 들고 있지 않는다. 코드만 견적에 넘긴다. */}
          {isAuthed ? (
            <div className="mt-5 rounded-xl border p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <TicketPercentIcon className="size-4" /> 쿠폰
              </p>
              {q?.couponName ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{q.couponName}</p>
                    <p className="text-primary text-xs font-semibold tabular-nums">
                      -{q.couponDiscountKrw.toLocaleString("ko-KR")}원 적용됨
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
                          setAppliedCode(couponInput.trim() || null);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 shrink-0"
                      disabled={!couponInput.trim() || quote === null}
                      onClick={() => setAppliedCode(couponInput.trim() || null)}
                    >
                      {quote === null && appliedCode ? "확인 중…" : "적용"}
                    </Button>
                  </div>
                  {q?.couponError ? (
                    <p className="text-destructive mt-1.5 text-xs">
                      {q.couponError}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {/* 합계 — 전부 서버 견적 값. 화면은 더하지 않는다. */}
          {quote && !quote.ok ? (
            <p className="text-destructive mt-5 rounded-xl border border-dashed px-4 py-3 text-sm">
              {quote.error}
            </p>
          ) : null}
          <div className="mt-5 space-y-1.5 text-right">
            {q === null ? (
              <p className="text-muted-foreground text-sm">금액을 계산하고 있습니다…</p>
            ) : (
              <>
                <div className="flex items-center justify-end gap-3 text-sm">
                  <span className="text-muted-foreground">상품 금액</span>
                  <span className="w-28 tabular-nums">
                    {q.subtotalKrw.toLocaleString("ko-KR")}원
                  </span>
                </div>
                {q.couponDiscountKrw > 0 ? (
                  <div className="text-primary flex items-center justify-end gap-3 text-sm">
                    <span>쿠폰 할인</span>
                    <span className="w-28 tabular-nums">
                      -{q.couponDiscountKrw.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ) : null}
                {/* ★배송비 — 종전에는 이 줄 자체가 없어서 버튼 금액과 청구액이 달랐다. */}
                <div className="flex items-center justify-end gap-3 text-sm">
                  <span className="text-muted-foreground">배송비</span>
                  <span className="w-28 tabular-nums">
                    {q.shippingFeeKrw > 0
                      ? `${q.shippingFeeKrw.toLocaleString("ko-KR")}원`
                      : "무료"}
                  </span>
                </div>
                {q.freeShippingRemainKrw > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {q.freeShippingRemainKrw.toLocaleString("ko-KR")}원 더 담으면 무료배송
                  </p>
                ) : null}
                <div className="flex items-center justify-end gap-3 pt-1">
                  <span className="text-muted-foreground text-xs">결제 금액</span>
                  <span className="w-28 text-xl font-bold tabular-nums">
                    {q.payableKrw.toLocaleString("ko-KR")}원
                  </span>
                </div>
              </>
            )}
          </div>

          {hasUnavailable ? (
            <p className="text-muted-foreground mt-3 text-xs">
              판매가 끝난 항목은 결제되지 않습니다. 목록에서 지워 주세요.
            </p>
          ) : null}

          <div className="mt-4">
            {isAuthed ? (
              <AsyncActionButton
                className="w-full"
                size="lg"
                disabled={!tossClientKey || q === null || q.payableKrw <= 0}
                onRun={onCheckout}
                pendingLabel="결제 준비 중…"
              >
                {q === null
                  ? "금액 계산 중…"
                  : `${q.payableKrw.toLocaleString("ko-KR")}원 결제하기`}
              </AsyncActionButton>
            ) : (
              <Button asChild className="w-full" size="lg">
                <Link to="/login">로그인 후 결제</Link>
              </Button>
            )}
          </div>
          <CheckoutSheet
            open={checkoutOpen}
            onOpenChange={setCheckoutOpen}
            items={checkoutItems}
            tossClientKey={tossClientKey}
            failPath="/lecture/cart"
            couponCode={couponForCheckout}
          />
        </>
      )}
    </div>
  );
}
