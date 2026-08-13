// 도해특허법 조회 — 요청 클라이언트(RLS: staff 전용 SELECT) 경유.
// 학생 요청이면 RLS 가 0행을 돌려 버튼이 자연히 숨는다(수험생 비노출).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { DohaeUnitSummary } from "./labels";

export async function listDohaeUnitsForArticle(
  client: SupabaseClient<Database>,
  articleId: string,
): Promise<DohaeUnitSummary[]> {
  const { data, error } = await client
    .from("dohae_unit_articles")
    .select(
      "dohae_units(unit_id, unit_key, kind, title, chapter_no, chapter_title, unit_no, ref_no)",
    )
    .eq("article_id", articleId);
  if (error) throw error;
  return (data ?? [])
    .map((r) => r.dohae_units)
    .filter((u): u is NonNullable<typeof u> => u !== null)
    .map((u) => ({
      unitId: u.unit_id,
      unitKey: u.unit_key,
      kind: u.kind as "topic" | "reference",
      title: u.title,
      chapterNo: u.chapter_no,
      chapterTitle: u.chapter_title,
      unitNo: u.unit_no,
      refNo: u.ref_no,
    }))
    .sort((a, b) => (a.unitNo ?? 900) - (b.unitNo ?? 900) || (a.refNo ?? "").localeCompare(b.refNo ?? ""));
}
