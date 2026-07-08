// 도서 찜 토글 (feat-11 B2-1). RLS(book_wishlists_own)로 본인만 write.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/wishlist-toggle";

const schema = z.object({
  bookId: z.string().uuid(),
  wishlisted: z.enum(["1", "0"]), // 현재 상태 — 토글 후 반대로.
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "로그인이 필요합니다" }, { status: 401 });

  const fd = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return data({ error: "잘못된 요청" }, { status: 400 });

  const next = parsed.data.wishlisted !== "1"; // 현재 찜 상태의 반대
  if (next) {
    const { error } = await client
      .from("book_wishlists")
      .upsert(
        { user_id: user.id, book_id: parsed.data.bookId },
        { onConflict: "user_id,book_id" },
      );
    if (error) return data({ error: error.message }, { status: 500 });
  } else {
    const { error } = await client
      .from("book_wishlists")
      .delete()
      .eq("user_id", user.id)
      .eq("book_id", parsed.data.bookId);
    if (error) return data({ error: error.message }, { status: 500 });
  }
  return data({ ok: true, wishlisted: next });
}
