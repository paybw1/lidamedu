// 도해특허법 조회 — 요청 클라이언트(RLS: staff 전용 SELECT) 경유.
// 학생 요청이면 RLS 가 0행을 돌려 버튼이 자연히 숨는다(수험생 비노출).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { DohaeBlock, DohaeUnitSummary } from "./labels";
import { diffTextNodes, type DohaeTextDiff } from "./lib/dohae-edit";

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
export interface DohaeRevision {
  revisionId: string;
  op: string;
  createdAt: string;
  /** 사람 이름. 시드·트리거 테스트 등 auth 없이 난 것은 null. */
  authorName: string | null;
  systemLabel: string | null;
  diffs: DohaeTextDiff[];
  /** 텍스트 외 필드(title 등)가 바뀐 경우 — 참고 표시용. */
  otherFields: string[];
}

/**
 * 유닛 편집 이력 — 원장(content_revisions)의 before/after 스냅샷에서 텍스트 차이를 뽑는다.
 * ★편집분은 재시드로 사라지므로 이 원장이 유일한 복구 원천이다(원장 판단 2026-08-17).
 * 작성자 이름은 profiles 를 별도 조회해야 한다 — 원장에 FK 가 없고, 타 사용자 profiles
 * 는 RLS 상 요청 클라이언트로 못 읽는다(메모: profiles-rls-staff-cross-read).
 */
export async function listDohaeRevisions(
  client: SupabaseClient<Database>,
  adminClient: SupabaseClient<Database>,
  unitId: string,
  limit = 50,
): Promise<DohaeRevision[]> {
  const { data, error } = await client
    .from("content_revisions")
    .select(
      "revision_id, op, created_at, created_by, created_by_label, changed_fields, before_snapshot, after_snapshot",
    )
    .eq("content_type", "dohae")
    .eq("content_id", unitId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profs } = await adminClient
      .from("profiles")
      .select("profile_id, name")
      .in("profile_id", authorIds);
    for (const p of profs ?? []) if (p.name) names.set(p.profile_id, p.name);
  }

  const blocksOf = (snap: unknown): DohaeBlock[] | null => {
    if (!snap || typeof snap !== "object") return null;
    const b = (snap as { blocks?: unknown }).blocks;
    return Array.isArray(b) ? (b as DohaeBlock[]) : null;
  };

  return rows.map((r) => ({
    revisionId: r.revision_id,
    op: r.op,
    createdAt: r.created_at,
    authorName: r.created_by ? (names.get(r.created_by) ?? null) : null,
    systemLabel: r.created_by_label,
    diffs: diffTextNodes(blocksOf(r.before_snapshot), blocksOf(r.after_snapshot)),
    otherFields: (r.changed_fields ?? []).filter((f) => f !== "blocks" && f !== "updated_at"),
  }));
}

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

/**
 * 조문 번호 → 조문 제목. 관련조문 참조를 "法 20Ⅵ [절차의 중단]" 으로 보여주는 데 쓴다.
 * ★메인 뷰어(article-viewer·systematic-node-viewer)가 만드는 titleMap 과 **같은 규칙**이어야
 *   양쪽 표기가 통일된다(원장 지적 2026-08-17). 아래 정규식을 바꾸면 그쪽도 같이 바꿀 것.
 * 참조는 법 전체 어디든 가리킬 수 있으므로 그 법의 조문을 전부 담는다.
 */
export async function getArticleTitleMap(
  client: SupabaseClient<Database>,
  lawCode: string,
): Promise<Record<string, string>> {
  const { data: law, error: lawErr } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (lawErr) throw lawErr;
  if (!law) return {};

  const out: Record<string, string> = {};
  // ★PostgREST 기본 상한 1000행 — 조문 수가 그보다 많은 법(민법)도 있어 페이징한다.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("articles")
      .select("article_number, display_label")
      .eq("law_id", law.law_id)
      .eq("level", "article")
      .is("deleted_at", null)
      .order("article_id")
      .range(from, from + 999);
    if (error) throw error;
    for (const a of data ?? []) {
      if (!a.article_number) continue;
      const m = a.display_label.match(/^제\d+조(?:의\d+)?\s+(.+)$/);
      out[a.article_number] = m ? m[1] : a.display_label;
    }
    if (!data || data.length < 1000) break;
  }
  return out;
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
