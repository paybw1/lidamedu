// 도서 재입고 알림 신청/취소 (feat-11 B2-4). RLS(book_restock_own)로 본인만 write.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/restock-alert";

const schema = z.object({
  bookId: z.string().uuid(),
  requested: z.enum(["1", "0"]), // 현재 신청 상태 — 토글 후 반대로.
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

  const next = parsed.data.requested !== "1";
  if (next) {
    // notified_at 초기화(재신청) — 재입고 시 다시 알림 대상.
    const { error } = await client.from("book_restock_alerts").upsert(
      { user_id: user.id, book_id: parsed.data.bookId, notified_at: null },
      { onConflict: "user_id,book_id" },
    );
    if (error) return data({ error: error.message }, { status: 500 });
  } else {
    const { error } = await client
      .from("book_restock_alerts")
      .delete()
      .eq("user_id", user.id)
      .eq("book_id", parsed.data.bookId);
    if (error) return data({ error: error.message }, { status: 500 });
  }
  return data({ ok: true, requested: next });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
