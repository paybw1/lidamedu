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
export interface DohaeUnitArticle {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
  importance: number;
  bodyJson: unknown;
  effectiveDate: string | null;
}

/** 조문 번호 자연 정렬 — "42의3" 이 "43" 보다 앞. */
function naturalKey(s: string | null): [number, number] {
  const m = (s ?? "").match(/^(\d+)(?:의(\d+))?/);
  if (!m) return [0, 0];
  return [Number(m[1]), m[2] ? Number(m[2]) : 0];
}

/**
 * 도해 유닛에 연결된 플랫폼 조문 + 현행 본문.
 * 팝업의 교재 조문 박스를 이 조문으로 갈아끼워, 하이라이트·포스트잇을 조문 축으로
 * 메인 화면과 공유하고 조문 개정·수정이 그대로 반영되게 한다(원장 지시 2026-08-17).
 */
export async function listDohaeUnitArticles(
  client: SupabaseClient<Database>,
  unitId: string,
): Promise<DohaeUnitArticle[]> {
  const { data: links, error } = await client
    .from("dohae_unit_articles")
    .select(
      "articles(article_id, article_number, display_label, importance, current_revision_id)",
    )
    .eq("unit_id", unitId);
  if (error) throw error;

  const byId = new Map<string, NonNullable<(typeof links)[number]["articles"]>>();
  for (const l of links ?? []) if (l.articles) byId.set(l.articles.article_id, l.articles);
  const rows = [...byId.values()];
  if (rows.length === 0) return [];

  const revIds = rows
    .map((a) => a.current_revision_id)
    .filter((x): x is string => x != null);
  const revMap = new Map<string, { body_json: unknown; effective_date: string | null }>();
  // ★.in() 에 id 를 몰아넣으면 URL 길이 초과(414) — 100개씩 끊는다(조문 최대 17개지만 규칙 유지).
  for (let i = 0; i < revIds.length; i += 100) {
    const { data: revs, error: revErr } = await client
      .from("article_revisions")
      .select("revision_id, body_json, effective_date")
      .in("revision_id", revIds.slice(i, i + 100));
    if (revErr) throw revErr;
    for (const r of revs ?? [])
      revMap.set(r.revision_id, { body_json: r.body_json, effective_date: r.effective_date });
  }

  return rows
    .map((a) => {
      const rev = a.current_revision_id ? revMap.get(a.current_revision_id) : null;
      return {
        articleId: a.article_id,
        articleNumber: a.article_number,
        displayLabel: a.display_label,
        importance: a.importance ?? 0,
        bodyJson: rev?.body_json ?? null,
        effectiveDate: rev?.effective_date ?? null,
      };
    })
    .sort((x, y) => {
      const xk = naturalKey(x.articleNumber);
      const yk = naturalKey(y.articleNumber);
      return xk[0] - yk[0] || xk[1] - yk[1];
    });
}

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
