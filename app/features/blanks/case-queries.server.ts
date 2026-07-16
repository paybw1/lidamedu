// feat-2-029 S2 — 판례 빈칸 세트 조회. article blanks(queries.server.ts) 미러.
//   blanks 원소 = CaseBlankItem. target 으로 요지/판시이유/평석 구분(결정 #1).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export type CaseBlankTarget = "summary" | "reasoning" | "comment";

export interface CaseBlankItem {
  idx: number;
  target: CaseBlankTarget;
  // target='summary' 일 때 summary_items 항 번호(0-based).
  itemIndex?: number;
  answer: string;
  beforeContext?: string;
  afterContext?: string;
  // 근거 OX(display_no) — 자동후보 추적/표시용.
  sourceOx?: string;
  // 결정적 좌표(있으면 우선). 조문 빈칸과 동일 규칙.
  blockIndex?: number;
  cumOffset?: number;
}

export interface CaseBlankSet {
  setId: string;
  caseId: string;
  ownerId: string | null;
  ownerName: string | null;
  version: string;
  displayName: string | null;
  importance: number;
  blanks: CaseBlankItem[];
}

type RawRow = {
  set_id: string;
  case_id: string;
  owner_id: string | null;
  version: string;
  display_name: string | null;
  importance: number;
  blanks: unknown;
  profiles: { name: string | null } | null;
};

function rowToCaseSet(row: RawRow): CaseBlankSet {
  return {
    setId: row.set_id,
    caseId: row.case_id,
    ownerId: row.owner_id,
    ownerName: row.profiles?.name ?? null,
    version: row.version,
    displayName: row.display_name,
    importance: row.importance,
    blanks: Array.isArray(row.blanks) ? (row.blanks as CaseBlankItem[]) : [],
  };
}

// 한 판례의 모든 owner 빈칸 세트(강사별 다중).
export async function listCaseBlankSetsByCase(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<CaseBlankSet[]> {
  const { data, error } = await client
    .from("case_blank_sets")
    .select(
      "set_id, case_id, owner_id, version, display_name, importance, blanks, profiles!owner_id(name)",
    )
    .eq("case_id", caseId)
    .order("version")
    .order("display_name");
  if (error) throw error;
  return ((data ?? []) as unknown as RawRow[]).map(rowToCaseSet);
}

// preferred owner 우선, 없으면 첫 세트.
export async function getCaseBlankSet(
  client: SupabaseClient<Database>,
  caseId: string,
  preferredOwnerId?: string,
): Promise<CaseBlankSet | null> {
  const all = await listCaseBlankSetsByCase(client, caseId);
  if (all.length === 0) return null;
  if (preferredOwnerId) {
    const m = all.find((s) => s.ownerId === preferredOwnerId);
    if (m) return m;
  }
  return all[0];
}
