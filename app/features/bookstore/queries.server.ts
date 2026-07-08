// 도서몰(강의 플랫폼) 학생용 쿼리 — feat-11 B1.
// 도서는 public RLS(on_sale/paused/closed)로 요청 클라이언트 사용. 재고(v_book_stock)는
// 하부 book_stock_moves 가 staff-only RLS 라 adminClient 로 읽는다(읽기 전용 집계).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

type Client = SupabaseClient<Database>;

export type BookSort = "new" | "price_asc" | "price_desc" | "title";

export interface BookCard {
  bookId: string;
  title: string;
  author: string | null;
  publisher: string | null;
  priceKrw: number;
  coverPath: string | null;
  stock: number | null; // null = 재고 미집계
  soldOut: boolean;
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
    .select("book_id, title, author, publisher, price_krw, cover_path")
    .eq("sale_status", "on_sale")
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
      coverPath: r.cover_path,
      stock,
      soldOut: stock !== null && stock <= 0,
    };
  });
}

export interface BookDetail extends BookCard {
  description: string | null;
  isbn: string | null;
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
      "book_id, title, author, publisher, price_krw, cover_path, description, isbn, sale_status",
    )
    .eq("book_id", bookId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!b || b.sale_status !== "on_sale") return null;

  const stocks = await stockMap([bookId]);
  const stock = stocks.has(bookId) ? stocks.get(bookId)! : null;

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
    coverPath: b.cover_path,
    stock,
    soldOut: stock !== null && stock <= 0,
    description: b.description,
    isbn: b.isbn,
    relatedCourses,
  };
}
