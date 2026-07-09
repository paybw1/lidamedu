// PDF 도서 다운로드 (feat-11 B2 S2) — 소유(결제완료) 검증 + 다운로드 횟수 제한 + signed URL.
// GET /api/lecture/book-download?bookId=... → 검증 통과 시 signed URL 로 302.
import { data, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";

import type { Route } from "./+types/book-download";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const bookId = new URL(request.url).searchParams.get("bookId");
  if (!bookId) throw data("bookId 누락", { status: 400 });

  const { data: book } = await adminClient
    .from("books")
    .select("book_id, title, book_type, pdf_path, download_limit")
    .eq("book_id", bookId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!book || book.book_type !== "pdf" || !book.pdf_path)
    throw data("다운로드할 수 없는 도서입니다", { status: 404 });

  // 소유 검증 — 결제완료(paid) 주문에 이 도서 항목이 있어야 함.
  const { data: owned } = await adminClient
    .from("order_items")
    .select("order_item_id, orders!inner(user_id, status)")
    .eq("book_id", bookId)
    .eq("orders.user_id", user.id)
    .eq("orders.status", "paid")
    .limit(1);
  const orderItem = (owned ?? [])[0];
  if (!orderItem) throw data("구매한 회원만 다운로드할 수 있습니다", { status: 403 });

  // 다운로드 횟수 제한(0 = 무제한).
  if (book.download_limit && book.download_limit > 0) {
    const { count } = await adminClient
      .from("book_downloads")
      .select("download_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("book_id", bookId);
    if ((count ?? 0) >= book.download_limit)
      throw data(
        `다운로드 횟수(${book.download_limit}회)를 모두 사용했습니다.`,
        { status: 403 },
      );
  }

  // signed URL 발급(비공개 버킷, 5분).
  const { data: signed, error } = await adminClient.storage
    .from("book-files")
    .createSignedUrl(book.pdf_path, 300, {
      download: `${book.title}.pdf`,
    });
  if (error || !signed?.signedUrl)
    throw data("다운로드 링크 생성 실패", { status: 500 });

  // 다운로드 기록(횟수 집계).
  await adminClient.from("book_downloads").insert({
    user_id: user.id,
    book_id: bookId,
    order_item_id: orderItem.order_item_id,
  });

  throw redirect(signed.signedUrl);
}
