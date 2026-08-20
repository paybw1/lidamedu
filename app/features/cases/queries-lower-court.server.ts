// feat-2-035 — 하급심 판결문(case_lower_courts) 쿼리.
// RLS 가 staff 전용이라 학생 호출은 자동으로 빈 결과가 된다 — 화면에서 역할을 다시 거르지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "~/../database.types";

type Client = SupabaseClient<Database>;

export const LOWER_STATUSES = [
  "loaded",
  "not_in_api",
  "summary_only",
  "no_ref",
] as const;

export type LowerCourtStatus = (typeof LOWER_STATUSES)[number];

export const LOWER_STATUS_LABEL: Record<LowerCourtStatus, string> = {
  loaded: "적재됨",
  not_in_api: "미수록 — 판결문만 구하면 됨",
  summary_only: "요지만 — 판결문만 구하면 됨",
  no_ref: "원심 미상 — 원심 확인부터",
};

/** 수기 확보가 필요한 상태인지. 목록 기본 필터. */
export function needsManualWork(status: LowerCourtStatus): boolean {
  return status !== "loaded";
}

export interface LowerCourtRow {
  caseId: string;
  status: LowerCourtStatus;
  sourceKind: "lower_auto" | "lower_self" | "lower_manual" | null;
  sourceRef: string | null;
  lowerCaseNumber: string | null;
  lowerCourt: string | null;
  charCount: number;
}

export interface LowerCourtListItem extends LowerCourtRow {
  caseNumber: string;
  caseTitle: string;
  decidedAt: string;
  subjectLaws: string[];
}

/** 판례 뷰어용 — 본문 포함 단건. staff 가 아니면 RLS 로 null. */
export async function getLowerCourtByCaseId(
  client: Client,
  caseId: string,
): Promise<(LowerCourtRow & { bodyText: string }) | null> {
  const { data, error } = await client
    .from("case_lower_courts")
    .select(
      "case_id, status, source_kind, source_ref, lower_case_number, lower_court, char_count, body_text",
    )
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    caseId: data.case_id,
    status: data.status as LowerCourtStatus,
    sourceKind: data.source_kind as LowerCourtRow["sourceKind"],
    sourceRef: data.source_ref,
    lowerCaseNumber: data.lower_case_number,
    lowerCourt: data.lower_court,
    charCount: data.char_count,
    bodyText: data.body_text,
  };
}

/**
 * 운영 목록 — 본문은 싣지 않는다(264건 × 평균 15KB = 응답이 수 MB).
 * 상태별 카운트는 필터와 무관하게 전체 기준으로 낸다(진척도를 읽기 위함).
 */
export async function listLowerCourtTargets(
  client: Client,
  opts: { status?: LowerCourtStatus | "manual" | null; q?: string } = {},
): Promise<{
  rows: LowerCourtListItem[];
  counts: Record<LowerCourtStatus, number> & { total: number };
}> {
  const { data, error } = await client
    .from("case_lower_courts")
    .select(
      `case_id, status, source_kind, source_ref, lower_case_number, lower_court, char_count,
       cases:case_id ( case_number, case_title, decided_at, subject_laws )`,
    )
    .is("deleted_at", null);
  if (error) throw error;

  // ★case_id 가 unique 라 PostgREST 는 cases 임베드를 객체로 내려준다(배열 아님).
  type EmbeddedCase = {
    case_number: string;
    case_title: string;
    decided_at: string;
    subject_laws: string[];
  };
  const all: LowerCourtListItem[] = (data ?? []).flatMap((r) => {
    const raw = r.cases as EmbeddedCase | EmbeddedCase[] | null;
    const kase = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    if (!kase) return [];
    return [
      {
        caseId: r.case_id,
        status: r.status as LowerCourtStatus,
        sourceKind: r.source_kind as LowerCourtRow["sourceKind"],
        sourceRef: r.source_ref,
        lowerCaseNumber: r.lower_case_number,
        lowerCourt: r.lower_court,
        charCount: r.char_count,
        caseNumber: kase.case_number,
        caseTitle: kase.case_title,
        decidedAt: kase.decided_at,
        subjectLaws: kase.subject_laws,
      },
    ];
  });
  all.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));

  const counts = {
    total: all.length,
    loaded: 0,
    not_in_api: 0,
    summary_only: 0,
    no_ref: 0,
  };
  for (const r of all) counts[r.status] += 1;

  const q = (opts.q ?? "").trim();
  const rows = all
    .filter((r) => {
      if (!opts.status) return true;
      if (opts.status === "manual") return needsManualWork(r.status);
      return r.status === opts.status;
    })
    .filter(
      (r) =>
        !q ||
        r.caseNumber.includes(q) ||
        r.caseTitle.includes(q) ||
        (r.lowerCaseNumber ?? "").includes(q),
    );

  return { rows, counts };
}
