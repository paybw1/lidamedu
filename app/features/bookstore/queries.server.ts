// 도서몰(강의 플랫폼) 학생용 쿼리 — feat-11 B1.
// 도서는 public RLS(on_sale/paused/closed)로 요청 클라이언트 사용. 재고(v_book_stock)는
// 하부 book_stock_moves 가 staff-only RLS 라 adminClient 로 읽는다(읽기 전용 집계).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

type Client = SupabaseClient<Database>;

export type BookSort = "new" | "price_asc" | "price_desc" | "title";

/** 사용자가 찜한 도서 id 집합(카드 하트 초기 상태용). 비로그인 시 빈 Set. */
export async function getWishlistBookIds(
  client: Client,
  userId: string | null,
): Promise<Set<string>> {
  if (!userId) return new Set();
  const { data } = await client
    .from("book_wishlists")
    .select("book_id")
    .eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.book_id));
}

export interface BookCard {
  bookId: string;
  title: string;
  author: string | null;
  publisher: string | null;
  priceKrw: number;
  listPriceKrw: number | null; // 정가(있으면 취소선)
  coverPath: string | null;
  labelText: string | null;
  labelColor: string | null;
  stock: number | null; // null = 재고 미집계
  soldOut: boolean;
}

// 표지 우선순위: 외부 URL(cover_path) → 업로드 파일(cover_file_path).
function pickCover(coverPath: string | null, coverFilePath: string | null) {
  return coverPath || coverFilePath || null;
}

async function stockMap(bookIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (bookIds.length === 0) return map;
  const { data } = await adminClient
    .from("v_book_stock")
    .select("book_id, stock")
    .in("book_id", bookIds);
  for (const r of data ?? []) {
    if (r.book_id) map.set(r.book_id, Number(r.stock ?? 0));
  }
  return map;
}

export async function listBookstoreBooks(
  client: Client,
  opts: { q?: string; sort?: BookSort } = {},
): Promise<BookCard[]> {
  let query = client
    .from("books")
    .select(
      "book_id, title, author, publisher, price_krw, list_price_krw, cover_path, cover_file_path, label_text, label_color",
    )
    .eq("sale_status", "on_sale")
    .eq("course_only", false) // 과정전용은 목록 미노출
    .eq("listed", true) // 노출여부 off 는 목록 미노출(상세는 접근 가능)
    .is("deleted_at", null);
  const q = opts.q?.trim();
  if (q) query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`);
  switch (opts.sort) {
    case "price_asc":
      query = query.order("price_krw", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price_krw", { ascending: false });
      break;
    case "title":
      query = query.order("title", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }
  const { data, error } = await query.limit(200);
  if (error) throw error;
  const rows = data ?? [];
  const stocks = await stockMap(rows.map((r) => r.book_id));
  return rows.map((r) => {
    const stock = stocks.has(r.book_id) ? stocks.get(r.book_id)! : null;
    return {
      bookId: r.book_id,
      title: r.title,
      author: r.author,
      publisher: r.publisher,
      priceKrw: r.price_krw,
      listPriceKrw: r.list_price_krw,
      coverPath: pickCover(r.cover_path, r.cover_file_path),
      labelText: r.label_text,
      labelColor: r.label_color,
      stock,
      soldOut: stock !== null && stock <= 0,
    };
  });
}

/** 찜한 도서 목록(찜한 순서 최신). 판매중 도서만. */
export async function listWishlistBooks(
  client: Client,
  userId: string | null,
): Promise<BookCard[]> {
  if (!userId) return [];
  const { data: w } = await client
    .from("book_wishlists")
    .select("book_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const ids = (w ?? []).map((r) => r.book_id);
  if (ids.length === 0) return [];
  const { data: books } = await client
    .from("books")
    .select(
      "book_id, title, author, publisher, price_krw, list_price_krw, cover_path, cover_file_path, label_text, label_color",
    )
    .in("book_id", ids)
    .eq("sale_status", "on_sale")
    .is("deleted_at", null);
  const stocks = await stockMap(ids);
  const byId = new Map((books ?? []).map((b) => [b.book_id, b]));
  const out: BookCard[] = [];
  for (const id of ids) {
    const b = byId.get(id);
    if (!b) continue; // 판매종료/삭제 도서는 목록에서 제외
    const stock = stocks.has(id) ? stocks.get(id)! : null;
    out.push({
      bookId: b.book_id,
      title: b.title,
      author: b.author,
      publisher: b.publisher,
      priceKrw: b.price_krw,
      listPriceKrw: b.list_price_krw,
      coverPath: pickCover(b.cover_path, b.cover_file_path),
      labelText: b.label_text,
      labelColor: b.label_color,
      stock,
      soldOut: stock !== null && stock <= 0,
    });
  }
  return out;
}

// ── B2-3 세트·번들 ──────────────────────────────────────────────────────────
export interface BundleCard {
  bundleId: string;
  title: string;
  description: string | null;
  priceKrw: number;
  coverPath: string | null;
  bookCount: number;
  memberTitles: string[];
}

export async function listBundles(client: Client): Promise<BundleCard[]> {
  const { data, error } = await client
    .from("book_bundles")
    .select("bundle_id, title, description, price_krw, cover_path")
    .eq("sale_status", "on_sale")
    .is("deleted_at", null)
    .order("display_order", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.bundle_id);
  const { data: items } = await client
    .from("book_bundle_items")
    .select("bundle_id, book_id, books(title)")
    .in("bundle_id", ids);
  const membersBy = new Map<string, string[]>();
  for (const it of items ?? []) {
    const title = (it.books as { title: string } | null)?.title;
    if (!title) continue;
    const arr = membersBy.get(it.bundle_id) ?? [];
    arr.push(title);
    membersBy.set(it.bundle_id, arr);
  }
  return rows.map((r) => ({
    bundleId: r.bundle_id,
    title: r.title,
    description: r.description,
    priceKrw: r.price_krw,
    coverPath: r.cover_path,
    bookCount: (membersBy.get(r.bundle_id) ?? []).length,
    memberTitles: membersBy.get(r.bundle_id) ?? [],
  }));
}

export interface BookDetail extends BookCard {
  description: string | null;
  isbn: string | null;
  shortIntro: string | null;
  authorBio: string | null;
  toc: string | null;
  publishedOn: string | null;
  previewUrl: string | null;
  eventPhrase: string | null;
  courseOnly: boolean;
  // B2-2 미리보기(look-inside) 샘플 페이지 이미지.
  previewPages: Array<{ previewId: string; imageUrl: string }>;
  // 강의↔교재 크로스셀 — 이 교재가 연결된 판매중 강의 상품.
  relatedCourses: Array<{
    planId: string;
    code: string;
    name: string;
    priceKrw: number;
  }>;
}

export async function getBookDetail(
  client: Client,
  bookId: string,
): Promise<BookDetail | null> {
  const { data: b, error } = await client
    .from("books")
    .select(
      "book_id, title, author, publisher, price_krw, list_price_krw, cover_path, cover_file_path, label_text, label_color, description, isbn, short_intro, author_bio, toc, published_on, preview_url, event_phrase, course_only, sale_status",
    )
    .eq("book_id", bookId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  // 상세는 판매중이면 접근 가능(과정전용·목록 미노출도 직접 링크로 접근 가능).
  if (!b || b.sale_status !== "on_sale") return null;

  const stocks = await stockMap([bookId]);
  const stock = stocks.has(bookId) ? stocks.get(bookId)! : null;

  // B2-2 미리보기 페이지(공개 RLS).
  const { data: previews } = await client
    .from("book_preview_pages")
    .select("preview_id, image_url")
    .eq("book_id", bookId)
    .order("sort_order", { ascending: true });
  const previewPages = (previews ?? []).map((p) => ({
    previewId: p.preview_id,
    imageUrl: p.image_url,
  }));

  // 크로스셀 — plan_book_links → 판매중 course/tpass 상품.
  const { data: links } = await client
    .from("plan_book_links")
    .select("plan_id")
    .eq("book_id", bookId);
  const planIds = [...new Set((links ?? []).map((l) => l.plan_id))];
  const relatedCourses: BookDetail["relatedCourses"] = [];
  if (planIds.length > 0) {
    const { data: plans } = await client
      .from("subscription_plans")
      .select("plan_id, code, name, price_krw, product_kind, is_active")
      .in("plan_id", planIds)
      .eq("is_active", true);
    for (const p of plans ?? []) {
      if (p.product_kind === "course" || p.product_kind === "tpass") {
        relatedCourses.push({
          planId: p.plan_id,
          code: p.code,
          name: p.name,
          priceKrw: p.price_krw,
        });
      }
    }
  }

  return {
    bookId: b.book_id,
    title: b.title,
    author: b.author,
    publisher: b.publisher,
    priceKrw: b.price_krw,
    listPriceKrw: b.list_price_krw,
    coverPath: pickCover(b.cover_path, b.cover_file_path),
    labelText: b.label_text,
    labelColor: b.label_color,
    stock,
    soldOut: stock !== null && stock <= 0,
    description: b.description,
    isbn: b.isbn,
    shortIntro: b.short_intro,
    authorBio: b.author_bio,
    toc: b.toc,
    publishedOn: b.published_on,
    previewUrl: b.preview_url,
    eventPhrase: b.event_phrase,
    courseOnly: b.course_only,
    previewPages,
    relatedCourses,
  };
}
