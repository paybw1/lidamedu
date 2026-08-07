// feat-11-008 P2 — 페이지관리(풀페이지 CMS) 서버 쿼리.
// 접근통제: custom_pages RLS(공개 읽기=use, staff=전체+쓰기) — 요청 클라이언트 사용.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

type Client = SupabaseClient<Database>;

export interface CustomPageRow {
  pageId: string;
  title: string;
  code: string;
  bodyHtml: string;
  status: "use" | "stopped";
  adminMemo: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRow(r: {
  page_id: string;
  title: string;
  code: string;
  body_html: string;
  status: string;
  admin_memo: string | null;
  created_at: string;
  updated_at: string;
}): CustomPageRow {
  return {
    pageId: r.page_id,
    title: r.title,
    code: r.code,
    bodyHtml: r.body_html,
    status: r.status === "use" ? "use" : "stopped",
    adminMemo: r.admin_memo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT =
  "page_id, title, code, body_html, status, admin_memo, created_at, updated_at";

export async function listCustomPages(
  client: Client,
  opts: { q?: string; status?: "use" | "stopped" | null; sort?: string },
): Promise<CustomPageRow[]> {
  let query = client.from("custom_pages").select(SELECT).is("deleted_at", null);
  if (opts.q) query = query.or(`title.ilike.%${opts.q}%,code.ilike.%${opts.q}%`);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.sort === "updated") query = query.order("updated_at", { ascending: false });
  else if (opts.sort === "title") query = query.order("title", { ascending: true });
  else query = query.order("created_at", { ascending: false });
  const { data, error } = await query.limit(200);
  if (error) throw error;
  return (data ?? []).map(toRow);
}

export async function getCustomPage(
  client: Client,
  pageId: string,
): Promise<CustomPageRow | null> {
  const { data } = await client
    .from("custom_pages")
    .select(SELECT)
    .eq("page_id", pageId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? toRow(data) : null;
}

/** 공개 라우트용 — 코드로 조회(대소문자 무시). RLS 가 비 staff 에게 use 만 노출. */
export async function getCustomPageByCode(
  client: Client,
  code: string,
): Promise<CustomPageRow | null> {
  const { data } = await client
    .from("custom_pages")
    .select(SELECT)
    .ilike("code", code)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? toRow(data) : null;
}

export async function customPageCodeExists(
  client: Client,
  code: string,
  excludePageId?: string,
): Promise<boolean> {
  let query = client
    .from("custom_pages")
    .select("page_id")
    .ilike("code", code)
    .is("deleted_at", null);
  if (excludePageId) query = query.neq("page_id", excludePageId);
  const { data } = await query.limit(1);
  return (data ?? []).length > 0;
}

/** 저장 전 현재 상태를 이력으로 남긴다(변경 전 스냅샷 — 요청서: 전후 값 이력). */
export async function snapshotCustomPage(
  client: Client,
  pageId: string,
  editedBy: string,
): Promise<void> {
  const page = await getCustomPage(client, pageId);
  if (!page) return;
  await client.from("custom_page_revisions").insert({
    page_id: pageId,
    title: page.title,
    body_html: page.bodyHtml,
    status: page.status,
    edited_by: editedBy,
  });
}
