// 도서 상세(강의 플랫폼) — 표지·정보·수량·담기/바로구매 + 강의↔교재 크로스셀. feat-11 B1.
import { GraduationCapIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { startCartCheckout } from "~/features/lms/lib/cart-checkout";
import { useCart } from "~/features/lms/lib/cart";
import { getBookDetail } from "~/features/bookstore/queries.server";

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
  return {
    book,
    isAuthed: Boolean(user),
    tossClientKey: process.env.TOSS_CLIENT_KEY ?? null,
  };
}

export default function BookDetail({ loaderData }: Route.ComponentProps) {
  const { book, isAuthed, tossClientKey } = loaderData;
  const { addBook, has } = useCart();
  const [qty, setQty] = useState(1);
  const inCart = has(`book:${book.bookId}`);

  const buyNow = () => {
    if (!tossClientKey) return;
    void startCartCheckout(
      [{ kind: "book", bookId: book.bookId, quantity: qty }],
      tossClientKey,
      `/lecture/books/${book.bookId}?failed=1`,
    );
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-6">
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
          <h1 className="text-2xl font-bold tracking-tight text-balance">
            {book.title}
          </h1>
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

          {!book.soldOut ? (
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
            {book.soldOut ? (
              <Button disabled>품절</Button>
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

          <p className="text-muted-foreground mt-3 text-xs">
            배송비·예상 배송일은 결제 단계에서 안내됩니다.
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
    </div>
  );
}
