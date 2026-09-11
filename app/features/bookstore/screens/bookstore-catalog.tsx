// 도서몰 카탈로그(강의 플랫폼) — 썸네일 그리드 + 검색·정렬 + 장바구니 담기. feat-11 B1.
import type { Route } from "./+types/bookstore-catalog";

import {
  BookOpenIcon,
  CheckIcon,
  HeartIcon,
  LayersIcon,
  SearchIcon,
} from "lucide-react";
import { Form, Link, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { WishlistHeart } from "~/features/bookstore/components/wishlist-heart";
import {
  bookSubjectLabel,
  groupBooksBySubject,
} from "~/features/bookstore/lib/book-taxonomy";
import {
  type BookCard as BookCardT,
  type BookSort,
  type BundleCard,
  getWishlistBookIds,
  listBookstoreBooks,
  listBundles,
} from "~/features/bookstore/queries.server";
import { useCart } from "~/features/lms/lib/cart";
import { isLmsSubjectCode } from "~/features/lms/lib/subject-options";

export function meta() {
  return [{ title: "도서 | 리담변리사학원" }];
}

const SORTS: Array<{ value: BookSort; label: string }> = [
  { value: "recommended", label: "기본 진열순" },
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
    sortParam && SORTS.some((s) => s.value === sortParam)
      ? sortParam
      : "recommended";
  // 과목 탭(2026-09-11) — 모르는 코드는 전체로.
  const subjectParam = url.searchParams.get("subject");
  const subject = isLmsSubjectCode(subjectParam) ? subjectParam : null;
  const [allBooks, wishlist, bundles] = await Promise.all([
    listBookstoreBooks(client, { q, sort }),
    getWishlistBookIds(client, user?.id ?? null),
    // 세트는 검색어 없을 때만 상단 노출(검색 결과 화면은 도서만).
    q ? Promise.resolve([]) : listBundles(client),
  ]);
  // 탭의 수는 검색어·정렬을 적용한 전체 목록에서 세고, 과목 필터는 그 위에 건다(쿼리 1회).
  // 과목 미지정 도서는 탭이 없고 「전체」의 맨 뒤 「기타」 묶음에만 나온다.
  const subjectTabs = groupBooksBySubject(allBooks, "기타")
    .filter((g) => g.subjectCode !== null)
    .map((g) => ({
      subjectCode: g.subjectCode,
      label: g.label,
      count: g.items.length,
    }));
  const books = subject
    ? allBooks.filter((b) => b.subjectCode === subject)
    : allBooks;
  return {
    books,
    totalCount: allBooks.length,
    subject,
    subjectTabs,
    bundles,
    q,
    sort,
    isAuthed: Boolean(user),
    wishlistedIds: [...wishlist],
  };
}

export default function BookstoreCatalog({ loaderData }: Route.ComponentProps) {
  const {
    books,
    totalCount,
    subject,
    subjectTabs,
    bundles,
    q,
    sort,
    wishlistedIds,
  } = loaderData;
  const wished = new Set(wishlistedIds);
  const [, setSearchParams] = useSearchParams();
  const setSubject = (code: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (code) next.set("subject", code);
        else next.delete("subject");
        return next;
      },
      { preventScrollReset: true },
    );
  };
  // 과목별 섹션은 「전체」 탭 + 기본 진열순 + 검색어 없음일 때만. 신간·가격·제목순과 검색 결과는 한 줄 목록.
  const sections =
    !subject && !q && sort === "recommended"
      ? groupBooksBySubject(books, "기타")
      : null;
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">도서</h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/lecture/wishlist">
            <HeartIcon className="size-4" /> 찜한 도서
          </Link>
        </Button>
      </div>
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
        {subject ? (
          <input type="hidden" name="subject" value={subject} />
        ) : null}
        <Button type="submit" variant="outline" size="sm">
          검색
        </Button>
      </Form>

      {/* 과목 탭 — 전체 + 도서가 있는 과목(subject-options.ts 순서). 미분류는 「전체」의 「기타」 묶음에만. */}
      {subjectTabs.length > 0 ? (
        <div
          className="mt-4 flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="과목"
        >
          <SubjectTab
            label="전체"
            count={totalCount}
            active={subject === null}
            onClick={() => setSubject(null)}
          />
          {subjectTabs.map((t) => (
            <SubjectTab
              key={t.subjectCode}
              label={t.label}
              count={t.count}
              active={subject === t.subjectCode}
              onClick={() => setSubject(t.subjectCode)}
            />
          ))}
        </div>
      ) : null}

      {bundles.length > 0 ? (
        <section className="mt-8">
          <h2 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <LayersIcon className="size-4" /> 세트·번들
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bundles.map((bn) => (
              <BundleGridCard key={bn.bundleId} bundle={bn} />
            ))}
          </div>
        </section>
      ) : null}

      {books.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
          <BookOpenIcon className="text-muted-foreground/40 size-10" />
          <p className="mt-4 text-sm font-medium">
            {q
              ? "검색 결과가 없습니다"
              : subject
                ? "이 과목의 도서가 아직 없습니다"
                : "등록된 도서가 없습니다"}
          </p>
          {subject ? (
            <button
              type="button"
              onClick={() => setSubject(null)}
              className="text-link mt-2 text-sm font-semibold hover:underline"
            >
              전체 보기 →
            </button>
          ) : null}
        </div>
      ) : sections && sections.length > 1 ? (
        <div className="mt-8 flex flex-col gap-10">
          {sections.map((g) => (
            <section key={g.subjectCode ?? "other"} aria-label={g.label}>
              <h2 className="flex items-baseline gap-2 text-base font-bold tracking-tight">
                {g.label}
                <span className="text-muted-foreground text-xs font-medium tabular-nums">
                  {g.items.length}종
                </span>
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {g.items.map((b) => (
                  <BookGridCard
                    key={b.bookId}
                    book={b}
                    wishlisted={wished.has(b.bookId)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {books.map((b) => (
            <BookGridCard
              key={b.bookId}
              book={b}
              wishlisted={wished.has(b.bookId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 과목 탭 — 수강신청 화면의 카테고리 탭과 같은 세그먼트 pill(수 뱃지 포함).
function SubjectTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      onClick={onClick}
      aria-selected={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[11px] tabular-nums",
          active ? "bg-primary-foreground/20" : "bg-muted",
        )}
      >
        {count}
      </span>
    </button>
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
        // 세로형 표지(대부분 1500×2000=3:4)는 프레임을 꽉 채우고, 가로형 표지는 잘리지 않고
        // 전체가 보이도록 contain. cover 로 두면 가로형 표지가 3:4 프레임에서 중앙만 크게 잘린다.
        style={{ objectFit: "contain" }}
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

export function BookGridCard({
  book,
  wishlisted,
}: {
  book: BookCardT;
  wishlisted: boolean;
}) {
  const { addBook, has } = useCart();
  const inCart = has(`book:${book.bookId}`);
  // 과목명 · 저자 — 한 줄 목록(정렬·검색·찜)에서도 과목이 보이도록.
  const metaLine = [bookSubjectLabel(book.subjectCode), book.author]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="group flex flex-col">
      <div className="relative">
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
        <WishlistHeart
          bookId={book.bookId}
          wishlisted={wishlisted}
          className="bg-background/80 absolute top-1.5 right-1.5 backdrop-blur-sm"
        />
        {book.labelText ? (
          <span
            className="absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
            style={{ backgroundColor: book.labelColor || "#2d5ba8" }}
          >
            {book.labelText}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-1 flex-col">
        <Link
          to={`/lecture/books/${book.bookId}`}
          className="line-clamp-2 text-sm leading-snug font-medium hover:underline"
        >
          {book.title}
        </Link>
        {metaLine ? (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {metaLine}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-1">
          <span className="flex items-baseline gap-1">
            {book.listPriceKrw && book.listPriceKrw > book.priceKrw ? (
              <span className="text-muted-foreground text-[11px] line-through">
                {book.listPriceKrw.toLocaleString("ko-KR")}
              </span>
            ) : null}
            <span className="text-sm font-bold tabular-nums">
              {book.priceKrw.toLocaleString("ko-KR")}원
            </span>
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

function BundleGridCard({ bundle }: { bundle: BundleCard }) {
  const { addBundle, has } = useCart();
  const inCart = has(`bundle:${bundle.bundleId}`);
  return (
    <div className="border-primary/30 from-primary/5 flex gap-3 rounded-xl border bg-gradient-to-br to-transparent p-3">
      <div className="bg-muted h-24 w-18 shrink-0 overflow-hidden rounded-md border">
        <BookCover
          coverPath={bundle.coverPath}
          title={bundle.title}
          className="size-full"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-primary text-[11px] font-semibold">
          세트 · {bundle.bookCount}권
        </span>
        <p className="line-clamp-2 text-sm leading-snug font-semibold">
          {bundle.title}
        </p>
        {bundle.memberTitles.length > 0 ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px]">
            {bundle.memberTitles.join(" · ")}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-1 pt-1.5">
          <span className="text-sm font-bold tabular-nums">
            {bundle.priceKrw.toLocaleString("ko-KR")}원
          </span>
          {inCart ? (
            <Button asChild size="sm" variant="outline" className="h-7 px-2">
              <Link to="/lecture/cart">
                <CheckIcon className="size-3.5" /> 담김
              </Link>
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => addBundle(bundle.bundleId)}
            >
              세트 담기
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
