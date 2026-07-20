// feat-11-006 S2 — 콜러스 콘텐츠 라이브러리 → video_contents 동기화. 서버 전용.
//   ★upsert-only(삭제 없음): API 에 없는 콘텐츠(수동 등록·다른 카테고리)는 보존.
//   ★소유권 분리: 콜러스 권위 필드(duration/encoding/원본파일명)는 매 동기화 갱신,
//     운영자 소유 필드(title·강의그룹·진도율·사용상태·활성)는 최초 insert 시에만 설정
//     (운영자가 회차명/그룹을 손봤어도 동기화가 덮지 않는다).
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import { fetchAllKollusContents } from "./kollus-content-api.server";

type VideoContentInsert =
  Database["public"]["Tables"]["video_contents"]["Insert"];

export interface KollusSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function syncKollusContents(
  actorId: string | null,
): Promise<KollusSyncResult> {
  const result: KollusSyncResult = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const contents = await fetchAllKollusContents();
  result.fetched = contents.length;
  if (contents.length === 0) return result;

  // 기존 콜러스 콘텐츠 키 → content_id (삭제된 것 포함 재확인용 deleted_at 무시하지 않음:
  //   soft-delete 된 콘텐츠 키가 다시 오면 갱신 대상으로 되살리지 않고 skip 처리).
  const { data: existing } = await adminClient
    .from("video_contents")
    .select("content_id, content_key, deleted_at")
    .eq("drm_provider", "kollus");
  const byKey = new Map(
    (existing ?? []).map((r) => [r.content_key, r]),
  );

  const nowIso = new Date().toISOString();
  const toInsert: VideoContentInsert[] = [];

  for (const c of contents) {
    const found = byKey.get(c.contentKey);
    if (found) {
      if (found.deleted_at) {
        result.skipped++; // 운영자가 지운 콘텐츠는 동기화로 되살리지 않음
        continue;
      }
      // 콜러스 권위 필드만 갱신.
      const { error } = await adminClient
        .from("video_contents")
        .update({
          duration_seconds: c.durationSeconds,
          encoding_status: c.encodingStatus,
          original_filename: c.originalFileName,
          synced_at: nowIso,
        })
        .eq("content_id", found.content_id);
      if (error) result.errors.push(`${c.contentKey}: ${error.message}`);
      else result.updated++;
    } else {
      toInsert.push({
        drm_provider: "kollus",
        content_key: c.contentKey,
        title: c.title,
        original_filename: c.originalFileName,
        duration_seconds: c.durationSeconds,
        encoding_status: c.encodingStatus,
        use_status: "in_use",
        is_active: true,
        synced_at: nowIso,
        created_by: actorId,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error, count } = await adminClient
      .from("video_contents")
      .insert(toInsert, { count: "exact" });
    if (error) result.errors.push(`insert: ${error.message}`);
    else result.inserted = count ?? toInsert.length;
  }

  return result;
}
