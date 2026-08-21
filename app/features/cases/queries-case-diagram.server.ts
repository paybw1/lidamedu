// feat-2-035 — 판례 도식(case_diagrams) 쿼리.
// RLS 가 권한 제어(학생=approved 만 / staff=전건) → 일반 supa-client 사용. service_role 불필요.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "~/../database.types";
import { fetchAllIn } from "~/core/lib/supa-batch.server";
import {
  articleNumberText,
  parseDisplay,
} from "~/features/laws/lib/identifier";

import {
  normalizeStatuteLabel,
  parseReferenceStatute,
  type StatuteRef,
} from "./lib/statute-label";

export type { StatuteRef };
import {
  parseBlocks,
  parseTimeline,
  type CaseDiagramBlock,
  type FactsSourceKind,
  type TimelineEvent,
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
  timeline: TimelineEvent[];
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
  "diagram_id, case_id, facts_md, facts_source_kind, facts_source_ref, blocks, timeline, review_status, generated_by, approved_at, rejected_reason, updated_at";

function mapDiagram(row: {
  diagram_id: string;
  case_id: string;
  facts_md: string;
  facts_source_kind: string;
  facts_source_ref: string | null;
  blocks: unknown;
  timeline: unknown;
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
    timeline: parseTimeline(row.timeline),
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
 * 도식의 법조문 표기("특허법 제29조 제2항")를 실제 조문 id 로 해석한다.
 * 학생이 조문 본문을 그 자리에서 펼쳐 볼 수 있게 하기 위한 것(원장 요청 2026-08-20).
 *
 * ★도식에는 조문을 FK 로 저장하지 않는다(설계 §3) — 표기 문자열이 권위이고,
 *   여기서 읽기 시점에만 해석한다. 해석 실패는 조용히 건너뛴다(그냥 텍스트 칩으로 남는다).
 * 항·호까지는 조문 단위 미리보기라 조(article) 단위로만 매칭한다.
 */
export async function resolveStatuteArticleIds(
  client: Client,
  statutes: string[],
): Promise<Record<string, StatuteRef>> {
  const unique = [...new Set(statutes.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return {};

  // 표기 → {lawCode, article_number}. 파싱 실패분은 버린다.
  // ★판결문 표기를 그대로 옮긴 문자열이라 "구 특허법 …", "… 제1항 본문" 처럼 쓰인다 —
  //   해석용으로만 정규화한다(원 표기는 화면에 그대로 남는다).
  const parsed = unique.flatMap((raw) => {
    const ident = parseDisplay(normalizeStatuteLabel(raw));
    if (!ident) return [];
    return [{ raw, lawCode: ident.lawCode, number: articleNumberText(ident) }];
  });
  if (parsed.length === 0) return {};

  const out: Record<string, StatuteRef> = {};
  const byLaw = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const list = byLaw.get(p.lawCode) ?? [];
    list.push(p);
    byLaw.set(p.lawCode, list);
  }

  for (const [lawCode, items] of byLaw) {
    const { data: law } = await client
      .from("laws")
      .select("law_id")
      .eq("law_code", lawCode)
      .maybeSingle();
    if (!law) continue;
    const numbers = [...new Set(items.map((i) => i.number))];
    const { data: rows } = await client
      .from("articles")
      .select("article_id, article_number")
      .eq("law_id", law.law_id)
      .eq("level", "article")
      .in("article_number", numbers);
    const byNumber = new Map(
      (rows ?? []).map((r) => [r.article_number, r.article_id]),
    );
    for (const i of items) {
      const id = byNumber.get(i.number);
      if (id) out[i.raw] = { kind: "article", id };
    }
  }

  await resolveReferenceStatutes(client, unique, out);
  return out;
}

/**
 * 5과목에서 해석되지 않은 표기를 참조 법령(reference_articles)에서 찾는다.
 * 실용신안법·공정거래법·헌법처럼 도식이 인용하지만 학습 과목이 아닌 법령들이다.
 * 학습화면이 없으므로 호출부는 팝업만 열어야 한다(kind = "reference").
 */
async function resolveReferenceStatutes(
  client: Client,
  labels: string[],
  out: Record<string, StatuteRef>,
): Promise<void> {
  const pending = labels.filter((l) => !out[l]);
  if (pending.length === 0) return;

  // 법령 15건 남짓이라 통째로 읽어 메모리에서 맞춘다(약칭 매칭 때문에 쿼리로는 번거롭다).
  const { data: laws } = await client
    .from("reference_laws")
    .select("ref_law_id, law_name, aliases");
  if (!laws || laws.length === 0) return;
  const byName = new Map<string, string>();
  for (const l of laws) {
    byName.set(l.law_name, l.ref_law_id);
    for (const a of l.aliases ?? []) byName.set(a, l.ref_law_id);
  }

  const wanted = new Map<string, { lawId: string; number: string }>();
  for (const raw of pending) {
    const parsed = parseReferenceStatute(raw);
    if (!parsed) continue;
    const lawId = byName.get(parsed.lawName);
    if (!lawId) continue;
    wanted.set(raw, { lawId, number: parsed.articleNumber });
  }
  if (wanted.size === 0) return;

  const lawIds = [...new Set([...wanted.values()].map((w) => w.lawId))];
  const numbers = [...new Set([...wanted.values()].map((w) => w.number))];
  const { data: rows } = await client
    .from("reference_articles")
    .select("ref_article_id, ref_law_id, article_number")
    .in("ref_law_id", lawIds)
    .in("article_number", numbers);
  const key = (lawId: string, number: string) => `${lawId}::${number}`;
  const found = new Map((rows ?? []).map((r) => [key(r.ref_law_id, r.article_number), r.ref_article_id]));
  for (const [raw, w] of wanted) {
    const id = found.get(key(w.lawId, w.number));
    if (id) out[raw] = { kind: "reference", id };
  }
}

/**
 * 주어진 판례들 중 "보이는 도식"이 있는 id 집합. 학생은 RLS 로 승인분만 잡힌다.
 * 목록 배지 전용 — CaseListItem 을 늘리지 않기 위해 분리했다(공용 select 라 파급이 크다).
 */
export async function listCaseIdsWithDiagram(
  client: Client,
  caseIds: string[],
): Promise<string[]> {
  if (caseIds.length === 0) return [];
  // ★id 를 통째로 .in() 에 넣으면 URL 이 길어져 PostgREST 가 400(Bad Request)을 던진다 —
  //   민법 판례 1,341건을 적재하자 /subjects/civil 이 통째로 500 이 됐다(2026-08-20).
  //   조각내어 조회한다(호출부가 목록 페이지를 주든 전량을 주든 안전하게).
  const rows = await fetchAllIn<{ case_id: string }>(caseIds, (slice) =>
    client
      .from("case_diagrams")
      .select("case_id")
      .in("case_id", slice)
      .is("deleted_at", null)
      .order("case_id"),
  );
  return rows.map((r) => r.case_id);
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

  // ★case_diagrams.case_id 가 unique 라 PostgREST 는 이 임베드를 배열이 아니라
  //   **객체(또는 null)** 로 내려준다. 배열로 가정하면 .find 가 없어 500 이 난다.
  //   임베드에는 deleted_at 필터가 안 걸리므로 여기서 살아있는 행만 남긴다.
  type EmbeddedDiagram = {
    diagram_id: string;
    review_status: string;
    facts_md: string;
    facts_source_kind: string;
    blocks: unknown;
    deleted_at: string | null;
  };
  const rows: CaseDiagramListRow[] = (data ?? []).map((r) => {
    const raw = r.case_diagrams as EmbeddedDiagram | EmbeddedDiagram[] | null;
    const candidates: EmbeddedDiagram[] = Array.isArray(raw)
      ? raw
      : raw
        ? [raw]
        : [];
    const live = candidates.find((d) => d.deleted_at === null) ?? null;
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
    timeline?: TimelineEvent[];
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
        timeline: args.timeline ?? [],
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
