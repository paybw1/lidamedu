// 도서 상세(강의 플랫폼) — 표지·정보·수량·담기/바로구매 + 강의↔교재 크로스셀. feat-11 B1.
import {
  BookOpenIcon,
  DownloadIcon,
  GraduationCapIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/core/components/ui/dialog";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { startCartCheckout } from "~/features/lms/lib/cart-checkout";
import { useCart } from "~/features/lms/lib/cart";
import { RestockAlertButton } from "~/features/bookstore/components/restock-alert-button";
import { WishlistHeart } from "~/features/bookstore/components/wishlist-heart";
import {
  getBookDetail,
  getWishlistBookIds,
} from "~/features/bookstore/queries.server";
import { ReviewsSection } from "~/features/lms/components/reviews-section";
import {
  getMyReview,
  isPurchaser,
  listPublicReviews,
} from "~/features/lms/reviews.server";

import { BookCover } from "./bookstore-catalog";

import type { Route } from "./+types/book-detail";

export function meta({ data: d }: Route.MetaArgs) {
  return [{ title: `${d?.book?.title ?? "도서"} | 리담변리사학원` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const bookId = params.bookId;
  if (!bookId) throw data({ error: "도서를 찾을 수 없습니다" }, { status: 404 });
  const book = await getBookDetail(client, bookId);
  if (!book) throw data({ error: "도서를 찾을 수 없습니다" }, { status: 404 });
  const wishlist = await getWishlistBookIds(client, user?.id ?? null);
  // 품절 시 재입고 알림 신청 여부.
  let restockRequested = false;
  if (user && book.soldOut) {
    const { data: alert } = await client
      .from("book_restock_alerts")
      .select("alert_id")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .maybeSingle();
    restockRequested = Boolean(alert);
  }
  // PDF 도서 — 구매(결제완료) 여부 → 다운로드 버튼 노출.
  let owned = false;
  if (user && book.bookType === "pdf") {
    const { data: oi } = await adminClient
      .from("order_items")
      .select("order_item_id, orders!inner(user_id, status)")
      .eq("book_id", bookId)
      .eq("orders.user_id", user.id)
      .eq("orders.status", "paid")
      .limit(1);
    owned = (oi ?? []).length > 0;
  }
  const [{ reviews, summary }, myReview, canWrite] = await Promise.all([
    listPublicReviews(client, "book", bookId),
    user ? getMyReview(client, user.id, "book", bookId) : Promise.resolve(null),
    user ? isPurchaser(client, user.id, "book", bookId) : Promise.resolve(false),
  ]);
  return {
    book,
    isAuthed: Boolean(user),
    wishlisted: wishlist.has(bookId),
    restockRequested,
    owned,
    tossClientKey: process.env.TOSS_CLIENT_KEY ?? null,
    reviews,
    summary,
    myReview,
    canWrite,
  };
}

export default function BookDetail({ loaderData }: Route.ComponentProps) {
  const {
    book,
    isAuthed,
    wishlisted,
    restockRequested,
    owned,
    tossClientKey,
    reviews,
    summary,
    myReview,
    canWrite,
  } = loaderData;
  const { addBook, has } = useCart();
  const [qty, setQty] = useState(1);
  const inCart = has(`book:${book.bookId}`);
  const isPdf = book.bookType === "pdf";

  const buyNow = () => {
    if (!tossClientKey) return;
    void startCartCheckout(
      [{ kind: "book", bookId: book.bookId, quantity: qty }],
      tossClientKey,
      `/lecture/books/${book.bookId}?failed=1`,
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <Link
        to="/lecture/books"
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        ← 도서 목록
      </Link>

      <div className="mt-4 grid gap-8 md:grid-cols-[280px_1fr]">
        <div className="bg-muted mx-auto aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-xl border">
          <BookCover
            coverPath={book.coverPath}
            title={book.title}
            className="size-full"
          />
        </div>

        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-balance">
              {book.title}
            </h1>
            <WishlistHeart
              bookId={book.bookId}
              wishlisted={wishlisted}
              className="border"
            />
          </div>
          <dl className="text-muted-foreground mt-2 space-y-0.5 text-sm">
            {book.author ? <div>저자 {book.author}</div> : null}
            {book.publisher ? <div>출판사 {book.publisher}</div> : null}
            {book.isbn ? <div>ISBN {book.isbn}</div> : null}
          </dl>

          <div className="mt-4 flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {book.priceKrw.toLocaleString("ko-KR")}원
            </span>
            {book.soldOut ? (
              <Badge variant="secondary">품절</Badge>
            ) : book.stock !== null && book.stock <= 5 ? (
              <Badge variant="outline" className="text-amber-600">
                재고 {book.stock}권
              </Badge>
            ) : (
              <Badge variant="outline" className="text-emerald-600">
                재고 있음
              </Badge>
            )}
          </div>

          {!book.soldOut && !isPdf ? (
            <div className="mt-4 flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => setQty((n) => Math.max(1, n - 1))}
                  disabled={qty <= 1}
                >
                  <MinusIcon className="size-4" />
                </Button>
                <span className="w-8 text-center text-sm tabular-nums">{qty}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => setQty((n) => n + 1)}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {isPdf && owned ? (
              <Button asChild>
                <a href={`/api/lecture/book-download?bookId=${book.bookId}`}>
                  <DownloadIcon className="size-4" /> PDF 다운로드
                </a>
              </Button>
            ) : book.soldOut ? (
              isAuthed ? (
                <RestockAlertButton
                  bookId={book.bookId}
                  requested={restockRequested}
                />
              ) : (
                <Button asChild variant="outline">
                  <Link to="/login">재입고 알림 신청 (로그인)</Link>
                </Button>
              )
            ) : !isAuthed ? (
              <Button asChild>
                <Link to="/login">로그인 후 구매</Link>
              </Button>
            ) : (
              <>
                {inCart ? (
                  <Button asChild variant="outline">
                    <Link to="/lecture/cart">장바구니 보기</Link>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => addBook(book.bookId, qty)}
                  >
                    장바구니 담기
                  </Button>
                )}
                <Button disabled={!tossClientKey} onClick={buyNow}>
                  바로 구매
                </Button>
              </>
            )}
          </div>

          {book.previewPages.length > 0 ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="mt-3 w-fit gap-1.5">
                  <BookOpenIcon className="size-4" /> 미리보기 (
                  {book.previewPages.length}p)
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{book.title} 미리보기</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                  {book.previewPages.map((p, i) => (
                    <img
                      key={p.previewId}
                      src={p.imageUrl}
                      alt={`미리보기 ${i + 1}페이지`}
                      loading="lazy"
                      className="w-full rounded-md border"
                    />
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          ) : null}

          <p className="text-muted-foreground mt-3 text-xs">
            {isPdf
              ? "PDF 도서 — 결제 후 내려받을 수 있습니다."
              : "배송비·예상 배송일은 결제 단계에서 안내됩니다."}
          </p>
        </div>
      </div>

      {book.description ? (
        <section className="mt-10">
          <h2 className="text-sm font-bold tracking-tight">책 소개</h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed whitespace-pre-wrap">
            {book.description}
          </p>
        </section>
      ) : null}

      {book.relatedCourses.length > 0 ? (
        <section className="mt-10">
          <h2 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <GraduationCapIcon className="size-4" /> 이 교재로 수강하는 강의
          </h2>
          <ul className="mt-3 divide-y rounded-xl border">
            {book.relatedCourses.map((c) => (
              <li
                key={c.planId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {c.name}
                </span>
                <span className="text-sm tabular-nums">
                  {c.priceKrw.toLocaleString("ko-KR")}원
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link to="/lecture/catalog">보러가기</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 교재평 */}
      <ReviewsSection
        targetType="book"
        targetId={book.bookId}
        reviews={reviews}
        summary={summary}
        myReview={myReview}
        canWrite={canWrite}
        isLoggedIn={isAuthed}
        title="교재평"
      />
    </div>
  );
}
