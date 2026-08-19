// feat-2-035 — 판례 도식(case_diagrams) 쿼리.
// RLS 가 권한 제어(학생=approved 만 / staff=전건) → 일반 supa-client 사용. service_role 불필요.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "~/../database.types";

import {
  parseBlocks,
  type CaseDiagramBlock,
  type FactsSourceKind,
} from "./lib/case-diagram";

type Client = SupabaseClient<Database>;

export type DiagramReviewStatus = "draft" | "approved" | "rejected";

export interface CaseDiagram {
  diagramId: string;
  caseId: string;
  factsMd: string;
  factsSourceKind: FactsSourceKind;
  factsSourceRef: string | null;
  blocks: CaseDiagramBlock[];
  reviewStatus: DiagramReviewStatus;
  generatedBy: "ai" | "staff";
  approvedAt: string | null;
  rejectedReason: string | null;
  updatedAt: string;
}

/** 목록 행 — 도식이 아직 없는 판례도 함께 보여야 해서 판례 기준으로 나열한다. */
export interface CaseDiagramListRow {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  court: string;
  decidedAt: string;
  /** 도식 미생성이면 null. */
  diagram: {
    diagramId: string;
    reviewStatus: DiagramReviewStatus;
    factsSourceKind: FactsSourceKind;
    hasFacts: boolean;
    blockCount: number;
  } | null;
}

const COLUMNS =
  "diagram_id, case_id, facts_md, facts_source_kind, facts_source_ref, blocks, review_status, generated_by, approved_at, rejected_reason, updated_at";

function mapDiagram(row: {
  diagram_id: string;
  case_id: string;
  facts_md: string;
  facts_source_kind: string;
  facts_source_ref: string | null;
  blocks: unknown;
  review_status: string;
  generated_by: string;
  approved_at: string | null;
  rejected_reason: string | null;
  updated_at: string;
}): CaseDiagram {
  return {
    diagramId: row.diagram_id,
    caseId: row.case_id,
    factsMd: row.facts_md,
    factsSourceKind: row.facts_source_kind as FactsSourceKind,
    factsSourceRef: row.facts_source_ref,
    blocks: parseBlocks(row.blocks),
    reviewStatus: row.review_status as DiagramReviewStatus,
    generatedBy: row.generated_by as "ai" | "staff",
    approvedAt: row.approved_at,
    rejectedReason: row.rejected_reason,
    updatedAt: row.updated_at,
  };
}

/** 단건 조회(판례 기준). 학생 호출이면 RLS 가 승인분만 돌려준다. */
export async function getCaseDiagramByCaseId(
  client: Client,
  caseId: string,
): Promise<CaseDiagram | null> {
  const { data, error } = await client
    .from("case_diagrams")
    .select(COLUMNS)
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDiagram(data) : null;
}

/**
 * staff 목록 — 대상 판례를 나열하고 도식 유무·상태를 붙인다.
 * 생성 범위(특허 2005~)는 화면이 아니라 호출부 인자로 넘긴다(스키마는 과목 무관).
 */
export async function listCaseDiagramTargets(
  client: Client,
  opts: {
    lawCode: string;
    decidedFrom: string;
    year?: number | null;
    status?: DiagramReviewStatus | "none" | null;
    limit?: number;
  },
): Promise<CaseDiagramListRow[]> {
  let query = client
    .from("cases")
    .select(
      `case_id, case_number, case_title, court, decided_at,
       case_diagrams ( diagram_id, review_status, facts_md, facts_source_kind, blocks, deleted_at )`,
    )
    .is("deleted_at", null)
    .contains("subject_laws", [opts.lawCode])
    .gte("decided_at", opts.decidedFrom)
    .order("decided_at", { ascending: false })
    .limit(opts.limit ?? 400);
  if (opts.year) {
    query = query
      .gte("decided_at", `${opts.year}-01-01`)
      .lt("decided_at", `${opts.year + 1}-01-01`);
  }
  const { data, error } = await query;
  if (error) throw error;

  const rows: CaseDiagramListRow[] = (data ?? []).map((r) => {
    const raw = (r.case_diagrams ?? []) as Array<{
      diagram_id: string;
      review_status: string;
      facts_md: string;
      facts_source_kind: string;
      blocks: unknown;
      deleted_at: string | null;
    }>;
    const live = raw.find((d) => d.deleted_at === null) ?? null;
    return {
      caseId: r.case_id,
      caseNumber: r.case_number,
      caseTitle: r.case_title,
      court: r.court,
      decidedAt: r.decided_at,
      diagram: live
        ? {
            diagramId: live.diagram_id,
            reviewStatus: live.review_status as DiagramReviewStatus,
            factsSourceKind: live.facts_source_kind as FactsSourceKind,
            hasFacts: live.facts_md.trim().length > 0,
            blockCount: parseBlocks(live.blocks).length,
          }
        : null,
    };
  });

  if (!opts.status) return rows;
  if (opts.status === "none") return rows.filter((r) => r.diagram === null);
  return rows.filter((r) => r.diagram?.reviewStatus === opts.status);
}

/** 판례 메타 + 도식 — 편집 화면 loader. */
export async function getCaseDiagramEditContext(
  client: Client,
  caseId: string,
): Promise<{
  kase: {
    caseId: string;
    caseNumber: string;
    caseTitle: string;
    court: string;
    decidedAt: string;
    officialTextMd: string | null;
    summaryItems: Array<{ title: string; body: string }>;
  };
  diagram: CaseDiagram | null;
} | null> {
  const { data, error } = await client
    .from("cases")
    .select(
      "case_id, case_number, case_title, court, decided_at, official_text_md, summary_items",
    )
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const rawItems = Array.isArray(data.summary_items) ? data.summary_items : [];
  const summaryItems = rawItems.flatMap((it) => {
    if (!it || typeof it !== "object") return [];
    const r = it as Record<string, unknown>;
    const title = typeof r.title === "string" ? r.title : "";
    const body = typeof r.body === "string" ? r.body : "";
    return title || body ? [{ title, body }] : [];
  });

  return {
    kase: {
      caseId: data.case_id,
      caseNumber: data.case_number,
      caseTitle: data.case_title,
      court: data.court,
      decidedAt: data.decided_at,
      officialTextMd: data.official_text_md,
      summaryItems,
    },
    diagram: await getCaseDiagramByCaseId(client, caseId),
  };
}

/**
 * 도식 저장(upsert). case_id unique 라 판례당 1건으로 수렴한다.
 * ★내용이 바뀌면 승인 상태를 draft 로 되돌린다 — 승인된 도식이 몰래 바뀌면 안 된다.
 */
export async function upsertCaseDiagram(
  client: Client,
  args: {
    caseId: string;
    factsMd: string;
    factsSourceKind: FactsSourceKind;
    factsSourceRef: string | null;
    blocks: CaseDiagramBlock[];
    generatedBy: "ai" | "staff";
    userId: string;
  },
): Promise<string> {
  const { data, error } = await client
    .from("case_diagrams")
    .upsert(
      {
        case_id: args.caseId,
        facts_md: args.factsMd,
        facts_source_kind: args.factsSourceKind,
        facts_source_ref: args.factsSourceRef,
        blocks: args.blocks,
        generated_by: args.generatedBy,
        review_status: "draft",
        approved_at: null,
        approved_by: null,
        rejected_reason: null,
        created_by: args.userId,
        deleted_at: null,
      },
      { onConflict: "case_id" },
    )
    .select("diagram_id")
    .single();
  if (error) throw error;
  return data.diagram_id;
}

/** 쟁점 블록만 교체 — AI 초안(쟁점~결론)이 사실관계를 건드리지 않게 분리. */
export async function replaceCaseDiagramBlocks(
  client: Client,
  args: { caseId: string; blocks: CaseDiagramBlock[]; userId: string },
): Promise<string> {
  const existing = await getCaseDiagramByCaseId(client, args.caseId);
  if (!existing) {
    return upsertCaseDiagram(client, {
      caseId: args.caseId,
      factsMd: "",
      factsSourceKind: "none",
      factsSourceRef: null,
      blocks: args.blocks,
      generatedBy: "ai",
      userId: args.userId,
    });
  }
  const { error } = await client
    .from("case_diagrams")
    .update({
      blocks: args.blocks,
      generated_by: "ai",
      review_status: "draft",
      approved_at: null,
      approved_by: null,
      rejected_reason: null,
    })
    .eq("diagram_id", existing.diagramId);
  if (error) throw error;
  return existing.diagramId;
}

export async function approveCaseDiagram(
  client: Client,
  args: { diagramId: string; userId: string },
): Promise<void> {
  const { error } = await client
    .from("case_diagrams")
    .update({
      review_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: args.userId,
      rejected_reason: null,
    })
    .eq("diagram_id", args.diagramId);
  if (error) throw error;
}

export async function rejectCaseDiagram(
  client: Client,
  args: { diagramId: string; reason: string },
): Promise<void> {
  const { error } = await client
    .from("case_diagrams")
    .update({
      review_status: "rejected",
      approved_at: null,
      approved_by: null,
      rejected_reason: args.reason,
    })
    .eq("diagram_id", args.diagramId);
  if (error) throw error;
}

/** soft delete — 학습 데이터는 아니지만 복구 여지를 남긴다(원장 검수분이 날아가면 재생성 비용). */
export async function softDeleteCaseDiagram(
  client: Client,
  diagramId: string,
): Promise<void> {
  const { error } = await client
    .from("case_diagrams")
    .update({ deleted_at: new Date().toISOString() })
    .eq("diagram_id", diagramId);
  if (error) throw error;
}
