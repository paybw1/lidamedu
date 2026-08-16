// 도해특허법 조회 — 요청 클라이언트(RLS: staff 전용 SELECT) 경유.
// 학생 요청이면 RLS 가 0행을 돌려 버튼이 자연히 숨는다(수험생 비노출).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { DohaeUnitSummary } from "./labels";

const UNIT_COLS =
  "dohae_units(unit_id, unit_key, kind, title, chapter_no, chapter_title, unit_no, ref_no)";

type UnitJoinRow = {
  dohae_units: {
    unit_id: string;
    unit_key: string;
    kind: string;
    title: string;
    chapter_no: number;
    chapter_title: string;
    unit_no: number | null;
    ref_no: string | null;
  } | null;
};

function toSummaries(rows: UnitJoinRow[]): DohaeUnitSummary[] {
  const byId = new Map<string, DohaeUnitSummary>();
  for (const r of rows) {
    const u = r.dohae_units;
    if (!u || byId.has(u.unit_id)) continue;
    byId.set(u.unit_id, {
      unitId: u.unit_id,
      unitKey: u.unit_key,
      kind: u.kind as "topic" | "reference",
      title: u.title,
      chapterNo: u.chapter_no,
      chapterTitle: u.chapter_title,
      unitNo: u.unit_no,
      refNo: u.ref_no,
    });
  }
  return [...byId.values()].sort(
    (a, b) =>
      (a.unitNo ?? 900) - (b.unitNo ?? 900) ||
      (a.refNo ?? "").localeCompare(b.refNo ?? ""),
  );
}

/**
 * 체계도 노드(서브트리)에 배치된 도해 유닛.
 * 노드 뷰어가 조문·판례·문제를 서브트리 기준으로 모으므로 도해도 같은 규칙을 쓴다
 * (정확일치로 두면 부모 노드에서 늘 0 이 된다).
 */
export async function listDohaeUnitsForNodes(
  client: SupabaseClient<Database>,
  nodeIds: string[],
): Promise<DohaeUnitSummary[]> {
  if (nodeIds.length === 0) return [];
  const { data, error } = await client
    .from("dohae_unit_nodes")
    .select(UNIT_COLS)
    .in("node_id", nodeIds);
  if (error) throw error;
  return toSummaries(data ?? []);
}

/**
 * 조문 → 유닛. 도해 진입은 체계도 노드로 옮겼으므로(사용자 결정 2026-08-16) 현재 화면에서는
 * 쓰이지 않는다. dohae_unit_articles 는 콘텐츠(조문 참조)라 그대로 두고, 조문 축 진입을
 * 되살릴 때를 위해 남긴다.
 */
export async function listDohaeUnitsForArticle(
  client: SupabaseClient<Database>,
  articleId: string,
): Promise<DohaeUnitSummary[]> {
  const { data, error } = await client
    .from("dohae_unit_articles")
    .select(UNIT_COLS)
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
