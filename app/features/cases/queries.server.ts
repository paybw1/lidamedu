import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type {
  CaseCourt,
  CaseListItem,
  CaseDetail,
} from "./labels";
export { COURT_LABELS } from "./labels";

import type { CaseCourt, CaseListItem, CaseDetail } from "./labels";

interface CaseListRow {
  case_id: string;
  court: CaseCourt;
  decided_at: string;
  case_number: string;
  case_title: string;
  is_en_banc: boolean;
  importance: number | null;
  summary_title: string | null;
  subject_laws: string[];
}

function rowToListItem(row: CaseListRow): CaseListItem {
  return {
    caseId: row.case_id,
    court: row.court,
    decidedAt: row.decided_at,
    caseNumber: row.case_number,
    caseTitle: row.case_title,
    isEnBanc: row.is_en_banc,
    importance: row.importance ?? 1,
    summaryTitle: row.summary_title,
    subjectLaws: row.subject_laws ?? [],
  };
}

export async function listCasesBySubject(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  query?: string,
): Promise<CaseListItem[]> {
  let q = client
    .from("cases")
    .select(
      "case_id, court, decided_at, case_number, case_title, is_en_banc, importance, summary_title, subject_laws",
    )
    .contains("subject_laws", [lawCode])
    .is("deleted_at", null);

  const trimmed = query?.trim();
  if (trimmed) {
    // pg_trgm + ilike 다중 컬럼. tsvector FTS 는 고도화 시점에 도입 (feat-4-A-208 P1+)
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.or(
      `case_number.ilike.${pattern},case_title.ilike.${pattern},summary_title.ilike.${pattern},summary_body_md.ilike.${pattern},reasoning_md.ilike.${pattern}`,
    );
  }

  const { data, error } = await q.order("decided_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToListItem);
}

export async function getCaseById(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<CaseDetail | null> {
  const { data, error } = await client
    .from("cases")
    .select(
      "case_id, court, decided_at, case_number, case_title, is_en_banc, importance, summary_title, subject_laws, summary_body_md, reasoning_md, full_text_pdf, comment_source, comment_body_md",
    )
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    ...rowToListItem(data),
    summaryBodyMd: data.summary_body_md,
    reasoningMd: data.reasoning_md,
    fullTextPdf: data.full_text_pdf,
    commentSource: data.comment_source,
    commentBodyMd: data.comment_body_md,
  };
}
