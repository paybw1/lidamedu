// 도서 상세(강의 플랫폼) — 표지·정보·수량·담기/바로구매 + 강의↔교재 크로스셀. feat-11 B1.
import {
  BookOpenIcon,
  DownloadIcon,
  GraduationCapIcon,
  ListIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";
import { PriceTag } from "~/features/lms/components/price-tag";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { AsyncActionButton } from "~/core/components/async-action-button";
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
import { pageMeta } from "~/core/lib/seo";

export const meta: Route.MetaFunction = (a) => {
  const b = a.data?.book;
  const by = [b?.author, b?.publisher].filter(Boolean).join(" · ");
  return pageMeta(
    {
      title: b?.title ?? "도서",
      description: b
        ? `${b.title}${by ? ` — ${by}` : ""}. 리담변리사학원 교재 구입.`
        : "리담변리사학원 교재 구입.",
    },
    a,
  );
};

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

/** 재고·1인당 한도가 둘 다 없을 때의 화면상 상한(서버가 다시 검증한다). */
const MAX_QTY_FALLBACK = 99;

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
  // ★수량의 권위는 서버(cart-resolve)다 — 화면은 미리 알려 주고 막기만 한다.
  //   종전에는 상한이 없어 재고 3권짜리에 10을 넣고 결제를 눌러야 경고창으로 막혔다.
  const maxQty = Math.max(
    1,
    Math.min(
      book.stock ?? MAX_QTY_FALLBACK,
      book.perPersonLimit ?? MAX_QTY_FALLBACK,
    ),
  );
  const inCart = has(`book:${book.bookId}`);
  const isPdf = book.bookType === "pdf";

  const buyNow = async () => {
    if (!tossClientKey) return;
    await startCartCheckout(
      [{ kind: "book", bookId: book.bookId, quantity: qty }],
      tossClientKey,
      `/lecture/books/${book.bookId}`,
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
        {book.coverPath ? (
          // 표지는 원본 비율 그대로 — 가로가 긴 책은 넓게, 세로가 긴 책은 길게. 고정 3:4 프레임에
          // 가두면 가로형 표지가 레터박스(빈 배경)로 작아 보이므로 natural aspect 로 렌더한다.
          <div className="bg-muted mx-auto w-full max-w-[280px] self-start overflow-hidden rounded-xl border">
            <img
              src={book.coverPath}
              alt={book.title}
              className="h-auto w-full object-contain"
            />
          </div>
        ) : (
          <div className="bg-muted mx-auto aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-xl border">
            <BookCover
              coverPath={null}
              title={book.title}
              className="size-full"
            />
          </div>
        )}

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
          {/* ★운영자가 채워 넣은 항목들이 화면에 하나도 나오지 않았다 — 저장도 되고
              조회도 되는데 이 화면이 쓰지 않았다(feat-11-012 P4).
              ※운영 DB 에 short_intro·author_bio·preview_url·event_phrase 값이 현재
                0건이다. 코드를 고쳐도 값이 없으면 화면은 그대로다("반영했는데 안 보인다"로
                오인하지 말 것) — 출간일 14건·정가 16건만 값이 있다. */}
          {book.eventPhrase ? (
            <p className="mt-2 inline-flex rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {book.eventPhrase}
            </p>
          ) : null}
          {book.shortIntro ? (
            <p className="mt-2 text-sm leading-relaxed">{book.shortIntro}</p>
          ) : null}
          <dl className="text-muted-foreground mt-2 space-y-0.5 text-sm">
            {book.author ? <div>저자 {book.author}</div> : null}
            {book.publisher ? <div>출판사 {book.publisher}</div> : null}
            {book.publishedOn ? (
              <div>출간일 {book.publishedOn.slice(0, 10).replace(/-/g, ".")}</div>
            ) : null}
            {book.isbn ? <div>ISBN {book.isbn}</div> : null}
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* ★정가(listPriceKrw)는 loader 가 내려주는데 이 화면이 한 번도 참조하지 않았다 —
                목록에는 취소선이 보이고 상세로 들어오면 사라졌다(feat-11-012 P4). */}
            <PriceTag
              size="lg"
              priceKrw={book.priceKrw}
              listPriceKrw={book.listPriceKrw}
            />
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
                  onClick={() => setQty((n) => Math.min(maxQty, n + 1))}
                  disabled={qty >= maxQty}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </div>
              {maxQty < MAX_QTY_FALLBACK ? (
                <span className="text-muted-foreground text-xs">
                  최대 {maxQty}권
                </span>
              ) : null}
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
                <AsyncActionButton
                  disabled={!tossClientKey}
                  onRun={buyNow}
                  pendingLabel="결제 준비 중…"
                >
                  바로 구매
                </AsyncActionButton>
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
              <DialogContent
                resizable
                resizeKey="book-detail"
                className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
              >
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
          {/* HtmlEditor 저장분(표·이미지 포함)은 HTML 로, 기존 평문 소개는 pre-wrap 으로. */}
          {/<[a-z][\s\S]*>/i.test(book.description) ? (
            <div
              className="lecture-detail-html text-muted-foreground mt-2 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: book.description }}
            />
          ) : (
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed whitespace-pre-wrap">
              {book.description}
            </p>
          )}
        </section>
      ) : null}

      {book.toc ? (
        <section className="mt-10">
          <h2 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <ListIcon className="size-4" /> 목차
          </h2>
          <div className="bg-muted/30 border-border text-muted-foreground mt-2 rounded-xl border p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {book.toc}
          </div>
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
                {/* ★3개가 나열돼도 전부 목록으로 갔다. code 는 이미 내려와 있다(한 줄). */}
                <Button asChild size="sm" variant="outline">
                  <Link to={`/lecture/catalog/${c.code}`}>보러가기</Link>
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
