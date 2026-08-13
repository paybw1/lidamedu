// errata Phase 4a §3.3 — 발행 후 교재별 시트 PDF 자동 재렌더 + Storage 업로드.
// ★렌더 실패는 발행을 롤백하지 않는다 — 발행은 이미 커밋된 사실이고 PDF 는 파생물.
//   호출부는 runAfterResponse 로 감싸고, 실패는 로그 + 어드민 수동 재렌더로 복구한다.
import adminClient from "~/core/lib/supa-admin-client.server";

import { buildErrataSheetData } from "./sheet-data.server";
import { renderErrataSheetPdf } from "./sheet-pdf.server";

const BUCKET = "errata";

export interface RegenerateResult {
  editionId: string;
  ok: boolean;
  itemCount?: number;
  error?: string;
}

// 발행된 revision 묶음이 갱신해야 할 edition 목록 (§3.3 — 한 발행이 복수 교재를 갱신).
export async function editionIdsForRevisions(
  revisionIds: string[],
): Promise<string[]> {
  if (revisionIds.length === 0) return [];
  const { data: revs, error } = await adminClient
    .from("content_revisions")
    .select("content_type, content_id")
    .in("revision_id", revisionIds);
  if (error) throw error;
  const keys = revs ?? [];
  if (keys.length === 0) return [];
  const contentIds = [...new Set(keys.map((r) => r.content_id))];
  const { data: maps, error: mapErr } = await adminClient
    .from("publication_content_map")
    .select("edition_id, content_type, content_id")
    .in("content_id", contentIds);
  if (mapErr) throw mapErr;
  const keySet = new Set(keys.map((k) => `${k.content_type}:${k.content_id}`));
  return [
    ...new Set(
      (maps ?? [])
        .filter((m) => keySet.has(`${m.content_type}:${m.content_id}`))
        .map((m) => m.edition_id),
    ),
  ];
}

export async function regenerateErrataSheet(
  editionId: string,
): Promise<RegenerateResult> {
  try {
    const data = await buildErrataSheetData(editionId);
    if (!data) return { editionId, ok: false, error: "edition 없음" };
    const pdf = await renderErrataSheetPdf(data);

    const path = `${editionId}.pdf`;
    const { error: upErr } = await adminClient.storage
      .from(BUCKET)
      .upload(path, pdf, {
        upsert: true, // 같은 경로 덮어쓰기 — 고정 URL (§3.5)
        contentType: "application/pdf",
        cacheControl: "60",
      });
    if (upErr) return { editionId, ok: false, error: upErr.message };

    const { data: pub } = adminClient.storage.from(BUCKET).getPublicUrl(path);
    const { error: colErr } = await adminClient
      .from("publication_editions")
      .update({
        errata_sheet_url: pub.publicUrl,
        errata_sheet_updated_at: new Date().toISOString(),
        errata_sheet_item_count: data.itemCount,
      })
      .eq("edition_id", editionId);
    if (colErr) return { editionId, ok: false, error: colErr.message };

    return { editionId, ok: true, itemCount: data.itemCount };
  } catch (e) {
    return {
      editionId,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function regenerateErrataSheets(
  editionIds: string[],
): Promise<RegenerateResult[]> {
  const results: RegenerateResult[] = [];
  for (const id of editionIds) {
    const r = await regenerateErrataSheet(id);
    if (!r.ok) {
      console.error(`[errata] 시트 재렌더 실패 edition=${id}: ${r.error}`);
    }
    results.push(r);
  }
  return results;
}

// 발행 훅 진입점 — revision 묶음 기준 영향 edition 전부 재렌더.
export async function regenerateForRevisions(
  revisionIds: string[],
): Promise<RegenerateResult[]> {
  try {
    const editionIds = await editionIdsForRevisions(revisionIds);
    return await regenerateErrataSheets(editionIds);
  } catch (e) {
    console.error(
      `[errata] 재렌더 대상 산출 실패: ${e instanceof Error ? e.message : String(e)}`,
    );
    return [];
  }
}
