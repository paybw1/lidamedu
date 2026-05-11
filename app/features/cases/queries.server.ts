import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type {
  CaseCourt,
  CaseListItem,
  CaseDetail,
  SummaryItem,
} from "./labels";
export { COURT_LABELS } from "./labels";

import type {
  CaseCourt,
  CaseListItem,
  CaseDetail,
  SummaryItem,
} from "./labels";

// list 쿼리에서 select 하는 컬럼 묶음 — DRY.
const LIST_COLUMNS =
  "case_id, court, decided_at, case_number, case_title, case_type, is_en_banc, importance, summary_title, subject_laws, exam_1st_years, exam_2nd_years";

interface CaseListRow {
  case_id: string;
  court: CaseCourt;
  decided_at: string;
  case_number: string;
  case_title: string;
  case_type: string | null;
  is_en_banc: boolean;
  importance: number | null;
  summary_title: string | null;
  subject_laws: string[];
  exam_1st_years: number[] | null;
  exam_2nd_years: number[] | null;
}

function rowToListItem(row: CaseListRow): CaseListItem {
  return {
    caseId: row.case_id,
    court: row.court,
    decidedAt: row.decided_at,
    caseNumber: row.case_number,
    caseTitle: row.case_title,
    caseType: row.case_type,
    isEnBanc: row.is_en_banc,
    importance: row.importance ?? 1,
    summaryTitle: row.summary_title,
    subjectLaws: row.subject_laws ?? [],
    exam1stYears: row.exam_1st_years ?? [],
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
  let q = client
    .from("cases")
    .select(LIST_COLUMNS)
    .is("deleted_at", null);
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
  // 페이지네이션 (1-based)
  page?: number;
  pageSize?: number;
}

export interface CaseListPage {
  items: CaseListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listCasesBySubject(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  options: ListCasesBySubjectOptions = {},
): Promise<CaseListPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, options.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = client
    .from("cases")
    .select(LIST_COLUMNS, { count: "exact" })
    .contains("subject_laws", [lawCode])
    .is("deleted_at", null);

  const trimmed = options.query?.trim();
  if (trimmed) {
    // pg_trgm + ilike 다중 컬럼. tsvector FTS 는 고도화 시점에 도입 (feat-4-A-208 P1+)
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.or(
      `case_number.ilike.${pattern},case_title.ilike.${pattern},case_type.ilike.${pattern},summary_title.ilike.${pattern},summary_body_md.ilike.${pattern},reasoning_md.ilike.${pattern}`,
    );
  }
  if (options.court && options.court !== "all") {
    q = q.eq("court", options.court);
  }
  switch (options.examFilter) {
    case "exam_1st":
      // exam_1st_years[]  != '{}'  — 1개 이상.
      q = q.not("exam_1st_years", "eq", "{}");
      break;
    case "exam_2nd":
      q = q.not("exam_2nd_years", "eq", "{}");
      break;
    case "exam_both":
      q = q.not("exam_1st_years", "eq", "{}").not("exam_2nd_years", "eq", "{}");
      break;
    default:
      break;
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

  const { data, error, count } = await q.range(from, to);
  if (error) throw error;
  return {
    items: (data ?? []).map((r) => rowToListItem(r as CaseListRow)),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getCaseById(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<CaseDetail | null> {
  const { data, error } = await client
    .from("cases")
    .select(
      "case_id, court, decided_at, case_number, case_title, case_type, is_en_banc, importance, summary_title, subject_laws, exam_1st_years, exam_2nd_years, summary_body_md, summary_items, reasoning_md, full_text_pdf, comment_source, comment_body_md",
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
