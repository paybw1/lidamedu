// Staff 가 그은 underline 중 label 텍스트가 case 본문 어디에도 없는 highlight 점검.
// 본문이 크게 편집돼 forward-search 로 재배치 불가한 경우 staff 가 admin 에서
// 다시 그어야 한다. 화면이 그 작업을 위한 진입점 + 옛 highlight 정리 도구.
//
// 검사 단순화: 본문의 모든 field (summary_items / summary_body_md / reasoning_md /
// comment_body_md) 를 strip(<u>) 후 단순 concat. label 이 그 텍스트 어디든
// substring 으로 등장하면 matched 로 본다. recompute 스크립트의 textContent flow
// 시뮬레이션보다 관대(false matched 가능) 하지만 unmatched 후보를 staff 가 보고
// 판단하는 데는 충분.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

const STAFF_USER_ID = "8dbc9c0e-a32d-456e-bf53-bf89160669e0";

export interface OrphanHighlight {
  highlightId: string;
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  fieldPath: string;
  label: string;
  startOffset: number;
  endOffset: number;
}

function stripU(s: string | null | undefined): string {
  return (s ?? "").replace(/<\/?u>/g, "");
}

interface SummaryItem {
  title?: string;
  body?: string;
  commentMd?: string;
  comment_md?: string;
}

export async function getOrphanHighlights(
  client: SupabaseClient<Database>,
  lawCode: string,
): Promise<OrphanHighlight[]> {
  const { data: cases, error: ce } = await client
    .from("cases")
    .select(
      "case_id, case_number, case_title, summary_items, summary_body_md, reasoning_md, comment_body_md",
    )
    .contains("subject_laws", [lawCode])
    .is("deleted_at", null);
  if (ce) throw ce;
  if (!cases) return [];

  // case 별 본문 단일 string — label substring 검사용.
  const textByCase = new Map<string, string>();
  for (const c of cases) {
    let text = "";
    const items = Array.isArray(c.summary_items)
      ? (c.summary_items as SummaryItem[])
      : [];
    for (const it of items) {
      text += stripU(it?.title);
      text += stripU(it?.body);
      text += stripU(it?.commentMd ?? it?.comment_md);
    }
    text += stripU(c.summary_body_md);
    text += stripU(c.reasoning_md);
    text += stripU(c.comment_body_md);
    textByCase.set(c.case_id, text);
  }
  const caseMetaById = new Map(
    cases.map(
      (c) =>
        [
          c.case_id,
          { caseNumber: c.case_number, caseTitle: c.case_title ?? "" },
        ] as const,
    ),
  );

  const caseIds = cases.map((c) => c.case_id);
  const orphans: OrphanHighlight[] = [];
  for (let i = 0; i < caseIds.length; i += 500) {
    const slice = caseIds.slice(i, i + 500);
    if (slice.length === 0) continue;
    const { data: hls, error: he } = await client
      .from("user_highlights")
      .select(
        "highlight_id, target_id, field_path, start_offset, end_offset, label",
      )
      .eq("user_id", STAFF_USER_ID)
      .eq("target_type", "case")
      .eq("color", "underline")
      .is("deleted_at", null)
      .in("target_id", slice);
    if (he) throw he;
    if (!hls) continue;
    for (const h of hls) {
      const text = textByCase.get(h.target_id) ?? "";
      const label = h.label ?? "";
      if (!label) continue;
      if (text.includes(label)) continue;
      const meta = caseMetaById.get(h.target_id);
      orphans.push({
        highlightId: h.highlight_id,
        caseId: h.target_id,
        caseNumber: meta?.caseNumber ?? "",
        caseTitle: meta?.caseTitle ?? "",
        fieldPath: h.field_path,
        label,
        startOffset: h.start_offset,
        endOffset: h.end_offset,
      });
    }
  }
  orphans.sort((a, b) => {
    const cn = a.caseNumber.localeCompare(b.caseNumber, "ko", { numeric: true });
    if (cn !== 0) return cn;
    return a.startOffset - b.startOffset;
  });
  return orphans;
}
