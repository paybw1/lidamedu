// 도서 추록/정오표 서버 쿼리. RLS: 모든 사용자 read, staff write.
// 타입은 ./labels — 클라이언트 번들 안전 import.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { BookUpdateItem, BookUpdateKind } from "./labels";

export type { BookUpdateItem, BookUpdateKind } from "./labels";
export { BOOK_UPDATE_KIND_LABELS } from "./labels";

const LIST_COLUMNS =
  "update_id, book_title, publisher, edition, kind, title, description, published_at, url, pdf_url, subject_laws, importance, tags, created_at, updated_at";

interface BookUpdateRow {
  update_id: string;
  book_title: string;
  publisher: string | null;
  edition: string | null;
  kind: string;
  title: string;
  description: string | null;
  published_at: string | null;
  url: string | null;
  pdf_url: string | null;
  subject_laws: string[];
  importance: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

function isLawSubjectSlug(value: string): value is LawSubjectSlug {
  return (LAW_SUBJECT_SLUGS as readonly string[]).includes(value);
}

function isBookUpdateKind(value: string): value is BookUpdateKind {
  return value === "supplement" || value === "errata" || value === "other";
}

function rowToItem(row: BookUpdateRow): BookUpdateItem {
  return {
    updateId: row.update_id,
    bookTitle: row.book_title,
    publisher: row.publisher,
    edition: row.edition,
    kind: isBookUpdateKind(row.kind) ? row.kind : "other",
    title: row.title,
    description: row.description,
    publishedAt: row.published_at,
    url: row.url,
    pdfUrl: row.pdf_url,
    subjectLaws: row.subject_laws.filter(isLawSubjectSlug),
    importance: row.importance ?? 1,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListBookUpdatesOptions {
  query?: string;
  subject?: LawSubjectSlug;
  kind?: BookUpdateKind;
  importantOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface BookUpdateListPage {
  items: BookUpdateItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listBookUpdates(
  client: SupabaseClient<Database>,
  options: ListBookUpdatesOptions = {},
): Promise<BookUpdateListPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = client
    .from("book_updates")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);
  if (options.subject) q = q.contains("subject_laws", [options.subject]);
  if (options.kind) q = q.eq("kind", options.kind);
  if (options.importantOnly) q = q.gte("importance", 3);
  const trimmed = options.query?.trim();
  if (trimmed) {
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.or(
      `book_title.ilike.${pattern},title.ilike.${pattern},publisher.ilike.${pattern},description.ilike.${pattern}`,
    );
  }
  const { data, error, count } = await q
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return {
    items: (data ?? []).map((r) => rowToItem(r as BookUpdateRow)),
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---- 변경 ----
export interface UpsertBookUpdateInput {
  bookTitle: string;
  publisher?: string | null;
  edition?: string | null;
  kind: BookUpdateKind;
  title: string;
  description?: string | null;
  publishedAt?: string | null;
  url?: string | null;
  pdfUrl?: string | null;
  subjectLaws?: LawSubjectSlug[];
  importance?: number;
  tags?: string[];
}

export async function createBookUpdate(
  client: SupabaseClient<Database>,
  input: UpsertBookUpdateInput,
  authorId: string,
): Promise<{ ok: true; updateId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("book_updates")
    .insert({
      book_title: input.bookTitle,
      publisher: input.publisher ?? null,
      edition: input.edition ?? null,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      published_at: input.publishedAt ?? null,
      url: input.url ?? null,
      pdf_url: input.pdfUrl ?? null,
      subject_laws: input.subjectLaws ?? [],
      importance: input.importance ?? 1,
      tags: input.tags ?? [],
      created_by: authorId,
    })
    .select("update_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, updateId: data.update_id };
}

export async function updateBookUpdate(
  client: SupabaseClient<Database>,
  updateId: string,
  patch: Partial<UpsertBookUpdateInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.bookTitle !== undefined) update.book_title = patch.bookTitle;
  if (patch.publisher !== undefined) update.publisher = patch.publisher;
  if (patch.edition !== undefined) update.edition = patch.edition;
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.publishedAt !== undefined) update.published_at = patch.publishedAt;
  if (patch.url !== undefined) update.url = patch.url;
  if (patch.pdfUrl !== undefined) update.pdf_url = patch.pdfUrl;
  if (patch.subjectLaws !== undefined) update.subject_laws = patch.subjectLaws;
  if (patch.importance !== undefined) update.importance = patch.importance;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await client
    .from("book_updates")
    .update(update)
    .eq("update_id", updateId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteBookUpdate(
  client: SupabaseClient<Database>,
  updateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("book_updates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("update_id", updateId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
