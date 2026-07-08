// 찜한 도서 목록(강의 플랫폼) — feat-11 B2-1.
import { HeartIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { listWishlistBooks } from "~/features/bookstore/queries.server";

import { BookGridCard } from "./bookstore-catalog";

import type { Route } from "./+types/wishlist";

export function meta() {
  return [{ title: "찜한 도서 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const books = await listWishlistBooks(client, user.id);
  return { books };
}

export default function Wishlist({ loaderData }: Route.ComponentProps) {
  const { books } = loaderData;
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <HeartIcon className="size-6 fill-rose-500 text-rose-500" /> 찜한 도서
      </h1>

      {books.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
          <HeartIcon className="text-muted-foreground/40 size-10" />
          <p className="mt-4 text-sm font-medium">찜한 도서가 없습니다</p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/lecture/books">도서 둘러보기</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {books.map((b) => (
            <BookGridCard key={b.bookId} book={b} wishlisted={true} />
          ))}
        </div>
      )}
    </div>
  );
}
