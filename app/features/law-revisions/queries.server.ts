// 법 개정 워크스페이스 서버 쿼리 (feat-7-004).
// 타입은 ./labels — 클라이언트 안전 import.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "database.types";

import type {
  ArticleChangeKind,
  LawRevisionListItem,
  RevisionArticleEntry,
} from "./labels";
import { isMaintenanceRevisionNumber } from "./labels";

export type {
  ArticleChangeKind,
  LawRevisionListItem,
  RevisionArticleEntry,
} from "./labels";
export { CHANGE_KIND_LABELS } from "./labels";

const LIST_COLUMNS =
  "law_revision_id, law_id, revision_number, revision_kind, promulgated_at, effective_date, reason_md, comparison_pdf, explanation_pdf, video_url, created_at, laws!inner(law_code, short_label, display_label)";

interface LawRevisionRow {
  law_revision_id: string;
  law_id: string;
  revision_number: string;
  revision_kind: string | null;
  promulgated_at: string | null;
  effective_date: string | null;
  reason_md: string | null;
  comparison_pdf: string | null;
  explanation_pdf: string | null;
  video_url: string | null;
  created_at: string;
  laws: { law_code: string; short_label: string | null; display_label: string };
}

export interface ListLawRevisionsOptions {
  lawCode?: string; // law_code 필터
}

export async function listLawRevisionsForAdmin(
  client: SupabaseClient<Database>,
  options: ListLawRevisionsOptions = {},
): Promise<LawRevisionListItem[]> {
  let q = client.from("law_revisions").select(LIST_COLUMNS);
  if (options.lawCode) q = q.eq("laws.law_code", options.lawCode);
  const { data, error } = await q
    .order("effective_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as LawRevisionRow[];
  if (rows.length === 0) return [];

  // 영향 조문 수.
  const ids = rows.map((r) => r.law_revision_id);
  const { data: arRows } = await client
    .from("article_revisions")
    .select("law_revision_id")
    .in("law_revision_id", ids);
  const countByRevision = new Map<string, number>();
  for (const r of arRows ?? []) {
    if (!r.law_revision_id) continue;
    countByRevision.set(
      r.law_revision_id,
      (countByRevision.get(r.law_revision_id) ?? 0) + 1,
    );
  }

  return rows.map((r) => ({
    lawRevisionId: r.law_revision_id,
    lawId: r.law_id,
    lawCode: r.laws.law_code,
    lawName: r.laws.short_label ?? r.laws.display_label,
    revisionNumber: r.revision_number,
    revisionKind: asKind(r.revision_kind),
    promulgatedAt: r.promulgated_at,
    effectiveDate: r.effective_date,
    reasonMd: r.reason_md,
    comparisonPdf: r.comparison_pdf,
    explanationPdf: r.explanation_pdf,
    videoUrl: r.video_url,
    articleCount: countByRevision.get(r.law_revision_id) ?? 0,
    createdAt: r.created_at,
    isMaintenance: isMaintenanceRevisionNumber(r.revision_number),
  }));
}

function asKind(value: string | null): import("./labels").LawRevisionKind {
  if (value === "decree" || value === "rule") return value;
  return "act";
}

export async function getLawRevisionById(
  client: SupabaseClient<Database>,
  lawRevisionId: string,
): Promise<LawRevisionListItem | null> {
  const { data, error } = await client
    .from("law_revisions")
    .select(LIST_COLUMNS)
    .eq("law_revision_id", lawRevisionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { count } = await client
    .from("article_revisions")
    .select("revision_id", { count: "exact", head: true })
    .eq("law_revision_id", lawRevisionId);
  const r = data as LawRevisionRow;
  return {
    lawRevisionId: r.law_revision_id,
    lawId: r.law_id,
    lawCode: r.laws.law_code,
    lawName: r.laws.short_label ?? r.laws.display_label,
    revisionNumber: r.revision_number,
    revisionKind: asKind(r.revision_kind),
    promulgatedAt: r.promulgated_at,
    effectiveDate: r.effective_date,
    reasonMd: r.reason_md,
    comparisonPdf: r.comparison_pdf,
    explanationPdf: r.explanation_pdf,
    videoUrl: r.video_url,
    articleCount: count ?? 0,
    createdAt: r.created_at,
    isMaintenance: isMaintenanceRevisionNumber(r.revision_number),
  };
}

// 한 개정에 포함된 article_revisions + 각 article 의 현재 시행 body 동시 fetch (비교용).
export async function listRevisionArticles(
  client: SupabaseClient<Database>,
  lawRevisionId: string,
): Promise<RevisionArticleEntry[]> {
  // articles 와 article_revisions 사이 FK 2개(article_id_fkey / current_revision_fk) 가
  // 있어 PostgREST 자동 매핑이 모호 — embed FK 명시.
  const { data, error } = await client
    .from("article_revisions")
    .select(
      "revision_id, article_id, body_json, change_kind, created_at, articles!article_revisions_article_id_fkey!inner(article_id, article_number, display_label, current_revision_id, path)",
    )
    .eq("law_revision_id", lawRevisionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // 현재 시행 본문 fetch.
  const curIds = rows
    .map((r) => r.articles?.current_revision_id)
    .filter((x): x is string => x != null && x !== "");
  const currentBodyById = new Map<string, unknown>();
  if (curIds.length > 0) {
    const { data: revs } = await client
      .from("article_revisions")
      .select("revision_id, body_json")
      .in("revision_id", curIds);
    for (const r of revs ?? []) currentBodyById.set(r.revision_id, r.body_json);
  }

  return rows.map((r) => {
    const a = r.articles!;
    return {
      revisionId: r.revision_id,
      articleId: r.article_id,
      articleNumber: a.article_number,
      displayLabel: a.display_label,
      bodyJson: r.body_json,
      changeKind: r.change_kind as ArticleChangeKind,
      currentBodyJson: a.current_revision_id
        ? currentBodyById.get(a.current_revision_id) ?? null
        : null,
      currentRevisionId: a.current_revision_id ?? null,
      path: a.path != null ? String(a.path) : null,
    };
  });
}

// ---- 변경 ----
export interface CreateLawRevisionInput {
  lawId: string;
  revisionNumber: string;
  reasonMd?: string | null;
}

export async function createLawRevision(
  client: SupabaseClient<Database>,
  input: CreateLawRevisionInput,
): Promise<{ ok: true; lawRevisionId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("law_revisions")
    .insert({
      law_id: input.lawId,
      revision_number: input.revisionNumber,
      reason_md: input.reasonMd ?? null,
      // promulgated_at / effective_date 는 "조문에 반영" 시점에 set.
    })
    .select("law_revision_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, lawRevisionId: data.law_revision_id };
}

export interface UpdateLawRevisionInput {
  revisionNumber?: string;
  reasonMd?: string | null;
  videoUrl?: string | null;
  revisionKind?: import("./labels").LawRevisionKind;
  promulgatedAt?: string | null;
  effectiveDate?: string | null;
}

export async function updateLawRevisionMeta(
  client: SupabaseClient<Database>,
  lawRevisionId: string,
  patch: UpdateLawRevisionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.revisionNumber !== undefined)
    update.revision_number = patch.revisionNumber;
  if (patch.reasonMd !== undefined) update.reason_md = patch.reasonMd;
  if (patch.videoUrl !== undefined) update.video_url = patch.videoUrl;
  if (patch.revisionKind !== undefined)
    update.revision_kind = patch.revisionKind;
  if (patch.promulgatedAt !== undefined)
    update.promulgated_at = patch.promulgatedAt;
  if (patch.effectiveDate !== undefined)
    update.effective_date = patch.effectiveDate;
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await client
    .from("law_revisions")
    .update(update)
    .eq("law_revision_id", lawRevisionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 개정 삭제 — 시행 중 스냅샷이 있으면 날짜 가드 트리거가 막는다(미반영·미래만 삭제 가능).
export async function deleteDraftLawRevision(
  client: SupabaseClient<Database>,
  lawRevisionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 안전 가드 — 이 개정의 스냅샷이 어떤 조문의 현재 시행 본문(current_revision_id)이면
  // 삭제 시 그 조문 본문이 유실/롤백된다 → 거부. (내부 정정 스냅샷 오삭제 방지)
  const { data: held } = await client
    .from("article_revisions")
    .select(
      "revision_id, articles!article_revisions_article_id_fkey!inner(display_label, current_revision_id)",
    )
    .eq("law_revision_id", lawRevisionId);
  const current = (held ?? []).filter(
    (ar) => ar.articles?.current_revision_id === ar.revision_id,
  );
  if (current.length > 0) {
    const labels = current
      .slice(0, 3)
      .map((ar) => ar.articles?.display_label)
      .filter(Boolean)
      .join(", ");
    return {
      ok: false,
      error: `이 개정은 현재 시행 중인 조문 본문 스냅샷을 보유하고 있어 삭제할 수 없습니다 (${labels}${current.length > 3 ? ` 외 ${current.length - 3}건` : ""}).`,
    };
  }
  // 우선 article_revisions 모두 삭제.
  const { error: arErr } = await client
    .from("article_revisions")
    .delete()
    .eq("law_revision_id", lawRevisionId);
  if (arErr) return { ok: false, error: arErr.message };
  const { error } = await client
    .from("law_revisions")
    .delete()
    .eq("law_revision_id", lawRevisionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 조문 추가 — 현재 본문을 복사해 draft article_revision 생성.
export async function addArticleToDraft(
  client: SupabaseClient<Database>,
  lawRevisionId: string,
  articleId: string,
  changeKind: ArticleChangeKind,
  authorId: string,
): Promise<{ ok: true; revisionId: string } | { ok: false; error: string }> {
  // 중복 가드.
  const { data: existing } = await client
    .from("article_revisions")
    .select("revision_id")
    .eq("law_revision_id", lawRevisionId)
    .eq("article_id", articleId)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "이미 이 개정에 포함된 조문입니다." };
  }

  // 현재 시행 본문 복사 (없으면 빈 blocks).
  const { data: art } = await client
    .from("articles")
    .select("current_revision_id")
    .eq("article_id", articleId)
    .maybeSingle();
  let body: Json = { blocks: [] } as unknown as Json;
  if (art?.current_revision_id) {
    const { data: cur } = await client
      .from("article_revisions")
      .select("body_json")
      .eq("revision_id", art.current_revision_id)
      .maybeSingle();
    if (cur?.body_json !== undefined) body = cur.body_json as Json;
  }

  const { data, error } = await client
    .from("article_revisions")
    .insert({
      article_id: articleId,
      law_revision_id: lawRevisionId,
      body_json: body,
      change_kind: changeKind,
      created_by: authorId,
      // effective_date 는 "조문에 반영" 시점에 set (NULL 허용).
    })
    .select("revision_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, revisionId: data.revision_id };
}

export async function updateDraftArticle(
  client: SupabaseClient<Database>,
  revisionId: string,
  patch: { bodyJson?: unknown; changeKind?: ArticleChangeKind },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.bodyJson !== undefined) update.body_json = patch.bodyJson as Json;
  if (patch.changeKind !== undefined) update.change_kind = patch.changeKind;
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await client
    .from("article_revisions")
    .update(update)
    .eq("revision_id", revisionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeArticleFromDraft(
  client: SupabaseClient<Database>,
  revisionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("article_revisions")
    .delete()
    .eq("revision_id", revisionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 조문에 반영 — transactional RPC. 시행일 스탬프 + 직전본 마감 + 시행 도래분 현행 스왑.
export async function applyLawRevision(
  client: SupabaseClient<Database>,
  lawRevisionId: string,
  promulgatedAt: string,
  effectiveDate: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.rpc("apply_law_revision", {
    p_law_revision_id: lawRevisionId,
    p_promulgated_at: promulgatedAt,
    p_effective_date: effectiveDate,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 조문번호로 article_id 조회 (조문 추가용).
export async function findArticleByNumber(
  client: SupabaseClient<Database>,
  lawId: string,
  articleNumber: string,
): Promise<{ articleId: string; displayLabel: string } | null> {
  const { data } = await client
    .from("articles")
    .select("article_id, display_label")
    .eq("law_id", lawId)
    .eq("article_number", articleNumber)
    .eq("level", "article")
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return { articleId: data.article_id, displayLabel: data.display_label };
}
