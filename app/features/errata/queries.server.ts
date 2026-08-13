// errata Phase 3 — 원장(content_revisions) 조회 헬퍼.
// diff 프리필의 권위는 원장 스냅샷이다(조사 3번) — 클라이언트 폼 상태로 diff 를 만들지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

export interface UnpublishedRevision {
  revisionId: string;
  contentType: string;
  op: string;
  changedFields: string[];
  createdAt: string;
}

// "방금 저장이 만든 revision 묶음"을 되찾는다.
// ★문제 저장은 problems + problem_choices 가 각각 revision 을 만들므로 복수 건이
//   정상이다(지시서 §3.3 — 단건만 반환하면 정답 정정이 누락된다). 한 저장의 묶음은
//   PostgREST 요청 단위로 쪼개져 수 초에 걸쳐 생기므로, 최신 행을 앵커로 30초 이내
//   행을 같은 묶음으로 간주한다(앱 시계 미개입 — created_at 끼리만 비교).
export async function getUnpublishedRevisions(
  client: SupabaseClient<Database>,
  contentTypes: string[],
  contentId: string,
): Promise<UnpublishedRevision[]> {
  const { data, error } = await client
    .from("content_revisions")
    .select("revision_id, content_type, op, changed_fields, created_at")
    .in("content_type", contentTypes)
    .eq("content_id", contentId)
    .eq("notice_status", "none")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const anchor = new Date(rows[0].created_at).getTime();
  return rows
    .filter((r) => anchor - new Date(r.created_at).getTime() < 30_000)
    .map((r) => ({
      revisionId: r.revision_id,
      contentType: r.content_type,
      op: r.op,
      changedFields: r.changed_fields ?? [],
      createdAt: r.created_at,
    }));
}
