// 도서몰 카탈로그(강의 플랫폼) — 썸네일 그리드 + 검색·정렬 + 장바구니 담기. feat-11 B1.
import { BookOpenIcon, CheckIcon, SearchIcon } from "lucide-react";
import { Form, Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { useCart } from "~/features/lms/lib/cart";
import {
  type BookCard as BookCardT,
  type BookSort,
  listBookstoreBooks,
} from "~/features/bookstore/queries.server";

import type { Route } from "./+types/bookstore-catalog";

export function meta() {
  return [{ title: "도서 | 리담변리사학원" }];
}

const SORTS: Array<{ value: BookSort; label: string }> = [
  { value: "new", label: "신간순" },
  { value: "price_asc", label: "가격 낮은순" },
  { value: "price_desc", label: "가격 높은순" },
  { value: "title", label: "제목순" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const sortParam = url.searchParams.get("sort") as BookSort | null;
  const sort: BookSort =
    sortParam && SORTS.some((s) => s.value === sortParam) ? sortParam : "new";
  const books = await listBookstoreBooks(client, { q, sort });
  return { books, q, sort, isAuthed: Boolean(user) };
}

export default function BookstoreCatalog({ loaderData }: Route.ComponentProps) {
  const { books, q, sort } = loaderData;
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight">도서</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        변리사 수험 교재를 만나보세요.
      </p>

      <Form
        method="get"
        className="mt-6 flex flex-wrap items-center gap-2"
        role="search"
      >
        <div className="relative flex-1 sm:max-w-xs">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="도서명·저자 검색"
            className="pl-8"
          />
        </div>
        <select
          name="sort"
          defaultValue={sort}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          검색
        </Button>
      </Form>

      {books.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
          <BookOpenIcon className="text-muted-foreground/40 size-10" />
          <p className="mt-4 text-sm font-medium">
            {q ? "검색 결과가 없습니다" : "등록된 도서가 없습니다"}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {books.map((b) => (
            <BookGridCard key={b.bookId} book={b} />
          ))}
        </div>
      )}
    </div>
  );
}

export function BookCover({
  coverPath,
  title,
  className,
}: {
  coverPath: string | null;
  title: string;
  className?: string;
}) {
  if (coverPath) {
    return (
      <img
        src={coverPath}
        alt={title}
        loading="lazy"
        className={className}
        style={{ objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      className={`from-muted to-muted/40 flex items-center justify-center bg-gradient-to-br p-3 ${className ?? ""}`}
    >
      <span className="text-muted-foreground line-clamp-4 text-center text-xs font-medium">
        {title}
      </span>
    </div>
  );
}

function BookGridCard({ book }: { book: BookCardT }) {
  const { addBook, has } = useCart();
  const inCart = has(`book:${book.bookId}`);
  return (
    <div className="group flex flex-col">
      <Link
        to={`/lecture/books/${book.bookId}`}
        className="bg-muted block aspect-[3/4] w-full overflow-hidden rounded-lg border"
      >
        <BookCover
          coverPath={book.coverPath}
          title={book.title}
          className="size-full transition-transform group-hover:scale-[1.03]"
        />
      </Link>
      <div className="mt-2 flex flex-1 flex-col">
        <Link
          to={`/lecture/books/${book.bookId}`}
          className="line-clamp-2 text-sm leading-snug font-medium hover:underline"
        >
          {book.title}
        </Link>
        {book.author ? (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {book.author}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-1">
          <span className="text-sm font-bold tabular-nums">
            {book.priceKrw.toLocaleString("ko-KR")}원
          </span>
          {book.soldOut ? (
            <Badge variant="secondary" className="text-[10px]">
              품절
            </Badge>
          ) : inCart ? (
            <Button asChild size="sm" variant="outline" className="h-7 px-2">
              <Link to="/lecture/cart">
                <CheckIcon className="size-3.5" /> 담김
              </Link>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => addBook(book.bookId, 1)}
            >
              담기
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
