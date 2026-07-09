// feat-12 강의 플랫폼 랜딩 — 서버 쿼리(공개 조회 + 운영자 CRUD).
// 공개 조회는 요청 클라이언트(RLS: published 만). 운영자 목록/CRUD 도 요청 클라이언트로
// (RLS staff 정책이 쓰기 백스톱). 목록에서 미게시 포함은 staff 세션이라 RLS 가 허용.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { BannerRow, NewsRow, ScheduleRow } from "./labels";

type Client = SupabaseClient<Database>;

// ── 현장강의 일정 ──────────────────────────────────────────────────────────
// 개강일 오름차순(날짜 없으면 뒤), 그다음 display_order. 지난 개강은 제외(today 기준).
export async function listSchedules(
  client: Client,
  opts: { includeUnpublished?: boolean; todayISO?: string; limit?: number } = {},
): Promise<ScheduleRow[]> {
  let q = client
    .from("lecture_schedules")
    .select("*")
    .is("deleted_at", null)
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("display_order", { ascending: true });
  if (!opts.includeUnpublished) q = q.eq("published", true);
  const { data } = await q;
  let rows = data ?? [];
  // 지난 개강 제외(공개 화면). 운영자 목록은 전부 표시.
  if (!opts.includeUnpublished && opts.todayISO) {
    const today = opts.todayISO.slice(0, 10);
    rows = rows.filter((r) => !r.start_date || r.start_date >= today);
  }
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

export async function getSchedule(
  client: Client,
  id: string,
): Promise<ScheduleRow | null> {
  const { data } = await client
    .from("lecture_schedules")
    .select("*")
    .eq("schedule_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data ?? null;
}

// ── 리담소식 ────────────────────────────────────────────────────────────────
export async function listNews(
  client: Client,
  opts: { includeUnpublished?: boolean; kind?: string | null; limit?: number } = {},
): Promise<NewsRow[]> {
  let q = client
    .from("lecture_news")
    .select("*")
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false });
  if (!opts.includeUnpublished) q = q.eq("published", true);
  if (opts.kind) q = q.eq("kind", opts.kind);
  const { data } = await q;
  const rows = data ?? [];
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

export async function getNews(
  client: Client,
  id: string,
): Promise<NewsRow | null> {
  const { data } = await client
    .from("lecture_news")
    .select("*")
    .eq("news_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data ?? null;
}

// ── 배너 ──────────────────────────────────────────────────────────────────
export async function listBanners(
  client: Client,
  opts: { includeUnpublished?: boolean } = {},
): Promise<BannerRow[]> {
  let q = client
    .from("landing_banners")
    .select("*")
    .is("deleted_at", null)
    .order("display_order", { ascending: true });
  if (!opts.includeUnpublished) q = q.eq("published", true);
  const { data } = await q;
  return data ?? [];
}

export async function getBanner(
  client: Client,
  id: string,
): Promise<BannerRow | null> {
  const { data } = await client
    .from("landing_banners")
    .select("*")
    .eq("banner_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data ?? null;
}

// ── 공용 soft-delete / reorder ──────────────────────────────────────────────
type LandingTable =
  | "lecture_schedules"
  | "lecture_news"
  | "landing_banners";
const PK: Record<LandingTable, string> = {
  lecture_schedules: "schedule_id",
  lecture_news: "news_id",
  landing_banners: "banner_id",
};

export async function softDeleteRow(
  client: Client,
  table: LandingTable,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq(PK[table], id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// 인접 항목과 display_order 교환(운영자 목록 ↑/↓). schedules·banners·news 공용.
export async function reorderRow(
  client: Client,
  table: LandingTable,
  id: string,
  direction: "up" | "down",
): Promise<{ ok: boolean; error?: string }> {
  const pk = PK[table];
  const { data, error } = await client
    .from(table)
    .select("*")
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  const list = ((data ?? []) as unknown as Array<Record<string, unknown>>)
    .slice()
    .sort(
      (a, b) =>
        Number(a.display_order) - Number(b.display_order) ||
        String(a[pk]).localeCompare(String(b[pk])),
    );
  const idx = list.findIndex((r) => r[pk] === id);
  if (idx === -1) return { ok: false, error: "not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true };
  const a = list[idx];
  const b = list[swapIdx];
  let aOrder = Number(b.display_order);
  let bOrder = Number(a.display_order);
  if (aOrder === bOrder) {
    aOrder = swapIdx;
    bOrder = idx;
  }
  const upd = (order: number, rowId: string) =>
    client
      .from(table)
      .update({ display_order: order } as never)
      .eq(pk, rowId);
  const [r1, r2] = await Promise.all([
    upd(aOrder, String(a[pk])),
    upd(bOrder, String(b[pk])),
  ]);
  if (r1.error || r2.error)
    return { ok: false, error: (r1.error ?? r2.error)?.message };
  return { ok: true };
}
