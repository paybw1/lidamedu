import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  CaseCourt,
  CaseDetail,
  CaseListItem,
  CaseReference,
  CaseReferenceKind,
  SummaryItem,
} from "./labels";

import type { ExamProblemRef } from "~/features/problems/labels";
import { getExamProblemsByCase } from "~/features/problems/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type {
  CaseCourt,
  CaseListItem,
  CaseDetail,
  SummaryItem,
  CaseReference,
  CaseReferenceKind,
} from "./labels";
export { COURT_LABELS } from "./labels";

// list 쿼리에서 select 하는 컬럼 묶음 — DRY.
const LIST_COLUMNS =
  "case_id, court, decided_at, case_number, case_title, nickname, case_type, is_en_banc, importance, summary_title, summary_items, subject_laws, exam_2nd_years";

interface CaseListRow {
  case_id: string;
  court: CaseCourt;
  decided_at: string;
  case_number: string;
  case_title: string;
  nickname: string | null;
  case_type: string | null;
  is_en_banc: boolean;
  importance: number | null;
  summary_title: string | null;
  summary_items: unknown;
  subject_laws: string[];
  exam_2nd_years: number[] | null;
}

function extractFirstSummaryTitle(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (!first || typeof first !== "object") return null;
  const t = (first as Record<string, unknown>).title;
  if (typeof t !== "string") return null;
  const trimmed = t.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function rowToListItem(
  row: CaseListRow,
  examProblemsByCase?: Map<string, ExamProblemRef[]>,
): CaseListItem {
  return {
    caseId: row.case_id,
    court: row.court,
    decidedAt: row.decided_at,
    caseNumber: row.case_number,
    caseTitle: row.case_title,
    nickname: row.nickname,
    caseType: row.case_type,
    isEnBanc: row.is_en_banc,
    importance: row.importance ?? 1,
    summaryTitle: row.summary_title,
    summaryFirstTitle: extractFirstSummaryTitle(row.summary_items),
    subjectLaws: row.subject_laws ?? [],
    // feat-8-024: 1차 기출문제는 problem_case_links 기반 파생값.
    exam1stProblems: examProblemsByCase?.get(row.case_id) ?? [],
    exam2ndYears: row.exam_2nd_years ?? [],
  };
}

function parseSummaryItems(raw: unknown): SummaryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SummaryItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (typeof o.title !== "string" || typeof o.body !== "string") continue;
    out.push({ title: o.title, body: o.body });
  }
  return out;
}

export interface RecentCasesFilters {
  // 특정 과목만 (cases.subject_laws contains).
  subject?: LawSubjectSlug;
  // 중요도 임계값 (importance >= minImportance).
  minImportance?: number;
}

// 최근 판례 (대시보드 위젯 + /latest/cases). decided_at 내림차순.
export async function listRecentCases(
  client: SupabaseClient<Database>,
  limit = 5,
  filters: RecentCasesFilters = {},
): Promise<CaseListItem[]> {
  let q = client.from("cases").select(LIST_COLUMNS).is("deleted_at", null);
  if (filters.subject) q = q.contains("subject_laws", [filters.subject]);
  if (filters.minImportance != null)
    q = q.gte("importance", filters.minImportance);
  const { data, error } = await q
    .order("decided_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => rowToListItem(r as CaseListRow));
}

export type CaseSubjectSort = "decided_desc" | "decided_asc" | "case_no";
export type CaseExamFilter = "any" | "exam_1st" | "exam_2nd" | "exam_both";
export type CaseCourtFilter = "all" | CaseCourt;

export interface ListCasesBySubjectOptions {
  query?: string;
  sort?: CaseSubjectSort;
  court?: CaseCourtFilter;
  examFilter?: CaseExamFilter; // 기출 유형
  // 판례 트리 필터 — 활성 시 이 case_id 들로만 제한. 빈 배열은 결과 0건.
  // undefined 또는 null = 트리 필터 비활성.
  filterCaseIds?: readonly string[] | null;
}

// 과목 판례 목록 — 페이지네이션 없이 전체 반환. total 은 KPI 표시용 카운트.
export interface CaseListPage {
  items: CaseListItem[];
  total: number;
}

// 과목 판례를 한 번에 가져오는 안전 상한 행수 (페이지네이션 제거 — feat-4-A-208).
// 초과 시 list 는 상한까지만, total(count)은 실제 건수라 누락이 드러난다.
const CASE_LIST_MAX = 2000;

export async function listCasesBySubject(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  options: ListCasesBySubjectOptions = {},
): Promise<CaseListPage> {
  const examProblemsByCase = await getExamProblemsByCase(client);

  // case_id 제한 — 트리 필터, 그리고 exam_1st/exam_both 면 기출-연결 판례로 한정.
  let restrictIds: string[] | null = options.filterCaseIds
    ? [...options.filterCaseIds]
    : null;
  if (options.examFilter === "exam_1st" || options.examFilter === "exam_both") {
    restrictIds =
      restrictIds === null
        ? [...examProblemsByCase.keys()]
        : restrictIds.filter((id) => examProblemsByCase.has(id));
  }
  if (restrictIds !== null && restrictIds.length === 0) {
    return { items: [], total: 0 };
  }

  let q = client
    .from("cases")
    .select(LIST_COLUMNS, { count: "exact" })
    .contains("subject_laws", [lawCode])
    .is("deleted_at", null);

  if (restrictIds !== null) {
    q = q.in("case_id", restrictIds);
  }

  const trimmed = options.query?.trim();
  if (trimmed) {
    // pg_trgm + ilike 다중 컬럼 — 사건번호·사건명·닉네임·유형·요지·판시이유·코멘트 본문.
    // tsvector FTS 는 고도화 시점에 도입 (feat-4-A-208 P1+).
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.or(
      `case_number.ilike.${pattern},case_title.ilike.${pattern},nickname.ilike.${pattern},case_type.ilike.${pattern},summary_title.ilike.${pattern},summary_body_md.ilike.${pattern},reasoning_md.ilike.${pattern},comment_body_md.ilike.${pattern}`,
    );
  }
  if (options.court && options.court !== "all") {
    q = q.eq("court", options.court);
  }
  // 1차 기출(exam_1st/exam_both)은 위 restrictIds 로 이미 한정됨.
  // 2차 기출은 종전대로 exam_2nd_years 컬럼 기반.
  if (options.examFilter === "exam_2nd" || options.examFilter === "exam_both") {
    q = q.not("exam_2nd_years", "eq", "{}");
  }

  switch (options.sort ?? "decided_desc") {
    case "decided_asc":
      q = q.order("decided_at", { ascending: true });
      break;
    case "case_no":
      q = q.order("case_number", { ascending: true });
      break;
    default:
      q = q.order("decided_at", { ascending: false });
  }

  const { data, error, count } = await q.range(0, CASE_LIST_MAX - 1);
  if (error) throw error;
  return {
    items: (data ?? []).map((r) =>
      rowToListItem(r as CaseListRow, examProblemsByCase),
    ),
    total: count ?? 0,
  };
}

// 조문별 case 개수 — 판례 트리 진입 (feat-4-A-210) 의 leaf 카운트.
// article_case_links 의 article_id 별 distinct case 개수. 같은 case 가 같은 article 에
// 여러 relation_type 으로 들어있어도 1개로 카운트한다.
export async function getCaseCountsByArticle(
  client: SupabaseClient<Database>,
  lawId: string,
): Promise<Record<string, number>> {
  const PAGE = 1000;
  const seenPair = new Set<string>(); // `${articleId}::${caseId}` — 중복 relation_type 제거.
  const counts: Record<string, number> = {};
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from("article_case_links")
      .select(
        "article_id, case_id, articles!inner(law_id, deleted_at), cases!inner(deleted_at)",
      )
      .eq("articles.law_id", lawId)
      .is("articles.deleted_at", null)
      .is("cases.deleted_at", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const key = `${r.article_id}::${r.case_id}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      counts[r.article_id] = (counts[r.article_id] ?? 0) + 1;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return counts;
}

// 트리 노드 클릭 필터링 — 주어진 조문들과 연결된 판례 ID 셋.
// 빈 배열을 받으면 빈 배열을 반환 (filter caller 가 0건으로 처리).
export async function getCaseIdsByArticleIds(
  client: SupabaseClient<Database>,
  articleIds: readonly string[],
): Promise<string[]> {
  if (articleIds.length === 0) return [];
  const out = new Set<string>();
  const CHUNK = 200; // IN 절 크기 상한.
  const PAGE = 1000;
  for (let i = 0; i < articleIds.length; i += CHUNK) {
    const slice = articleIds.slice(i, i + CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from("article_case_links")
        .select("case_id")
        .in("article_id", slice)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) out.add(r.case_id);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  return [...out];
}

// feat-4-A-214 관련논문/기사 링크.
// case 한 건에 연결된 외부 자료 (논문/기사/기타). 읽기는 공개, 쓰기는 staff.
// 타입은 ./labels 에 정의 — 클라이언트 번들 안전 import.

export async function listCaseReferences(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<CaseReference[]> {
  const { data, error } = await client
    .from("case_references")
    .select(
      "reference_id, case_id, kind, title, authors, source, published_at, url, pdf_url, note, ord, created_at, updated_at",
    )
    .eq("case_id", caseId)
    .order("ord", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    referenceId: r.reference_id,
    caseId: r.case_id,
    kind: r.kind as CaseReferenceKind,
    title: r.title,
    authors: r.authors,
    source: r.source,
    publishedAt: r.published_at,
    url: r.url,
    pdfUrl: r.pdf_url,
    note: r.note,
    ord: r.ord,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export interface UpsertCaseReferenceInput {
  caseId: string;
  kind: CaseReferenceKind;
  title: string;
  authors?: string | null;
  source?: string | null;
  publishedAt?: string | null;
  url?: string | null;
  pdfUrl?: string | null;
  note?: string | null;
  ord?: number;
}

export async function createCaseReference(
  client: SupabaseClient<Database>,
  input: UpsertCaseReferenceInput,
  authorId: string,
): Promise<{ ok: true; referenceId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("case_references")
    .insert({
      case_id: input.caseId,
      kind: input.kind,
      title: input.title,
      authors: input.authors ?? null,
      source: input.source ?? null,
      published_at: input.publishedAt ?? null,
      url: input.url ?? null,
      pdf_url: input.pdfUrl ?? null,
      note: input.note ?? null,
      ord: input.ord ?? 0,
      created_by: authorId,
    })
    .select("reference_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, referenceId: data.reference_id };
}

export async function updateCaseReference(
  client: SupabaseClient<Database>,
  referenceId: string,
  patch: Partial<Omit<UpsertCaseReferenceInput, "caseId">>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.authors !== undefined) update.authors = patch.authors;
  if (patch.source !== undefined) update.source = patch.source;
  if (patch.publishedAt !== undefined) update.published_at = patch.publishedAt;
  if (patch.url !== undefined) update.url = patch.url;
  if (patch.pdfUrl !== undefined) update.pdf_url = patch.pdfUrl;
  if (patch.note !== undefined) update.note = patch.note;
  if (patch.ord !== undefined) update.ord = patch.ord;
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await client
    .from("case_references")
    .update(update)
    .eq("reference_id", referenceId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCaseReference(
  client: SupabaseClient<Database>,
  referenceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("case_references")
    .delete()
    .eq("reference_id", referenceId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getCaseById(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<CaseDetail | null> {
  const { data, error } = await client
    .from("cases")
    .select(
      "case_id, court, decided_at, case_number, case_title, nickname, case_type, is_en_banc, importance, summary_title, subject_laws, exam_1st_years, exam_2nd_years, summary_body_md, summary_items, reasoning_md, full_text_pdf, comment_source, comment_body_md",
    )
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    ...rowToListItem(data as CaseListRow),
    summaryBodyMd: data.summary_body_md,
    summaryItems: parseSummaryItems(data.summary_items),
    reasoningMd: data.reasoning_md,
    fullTextPdf: data.full_text_pdf,
    commentSource: data.comment_source,
    commentBodyMd: data.comment_body_md,
  };
}

// soft-deleted case 에 진입한 경우 — 같은 사건번호로 재등록된 활성 row 가 있으면
// 그 case_id 를 반환해 case-viewer 가 redirect 할 수 있게 한다.
// 활성 row 가 없으면 deleted case 자체의 정보를 반환 (친절 404 안내용).
export async function findActiveCaseByDeletedId(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<{
  replacementCaseId: string | null;
  deletedCaseNumber: string | null;
}> {
  const { data: deletedRow } = await client
    .from("cases")
    .select("case_number, deleted_at")
    .eq("case_id", caseId)
    .maybeSingle();
  if (!deletedRow || !deletedRow.deleted_at) {
    // case 가 아예 없거나(잘못된 UUID) deleted 가 아님(다른 원인 — 권한 등) → fallback 없음.
    return {
      replacementCaseId: null,
      deletedCaseNumber: deletedRow?.case_number ?? null,
    };
  }
  const { data: activeRow } = await client
    .from("cases")
    .select("case_id")
    .eq("case_number", deletedRow.case_number)
    .is("deleted_at", null)
    .maybeSingle();
  return {
    replacementCaseId: activeRow?.case_id ?? null,
    deletedCaseNumber: deletedRow.case_number,
  };
}
