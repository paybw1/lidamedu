// feat-9-001 RAG 인프라 — content_chunks CRUD + dirty 큐 + 임베딩 저장.
// RLS: read 는 인증 사용자, write 는 service_role (cron / 백필 스크립트). 따라서 write 헬퍼는
// supa-admin-client 를 받는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { ChunkInput, ChunkSourceType } from "./lib/chunker";

export type { ChunkInput, ChunkSourceType } from "./lib/chunker";

// ── upsert ───────────────────────────────────────────────────────────────

/**
 * 청크 일괄 upsert. (source_type, source_id, chunk_index) 유니크.
 * body_text 가 동일(content_hash 같음)하면 row 만 갱신하고 embedded_at 은 유지 — 재임베딩 skip.
 * body_text 가 다르면 dirty(embedded_at = null) 로 마킹.
 */
export async function upsertChunks(
  adminClient: SupabaseClient<Database>,
  chunks: ReadonlyArray<ChunkInput>,
): Promise<{ inserted: number; updatedDirty: number; unchanged: number }> {
  if (chunks.length === 0)
    return { inserted: 0, updatedDirty: 0, unchanged: 0 };

  // 기존 row 의 content_hash 조회.
  const keys = chunks.map((c) => ({
    source_type: c.sourceType,
    source_id: c.sourceId,
    chunk_index: c.chunkIndex,
  }));

  // Supabase JS 는 composite IN 직접 지원 안 함 — source_id 단위로 묶어 조회 후 client 측 매칭.
  const sourceIds = [...new Set(chunks.map((c) => c.sourceId))];
  const { data: existing, error: exErr } = await adminClient
    .from("content_chunks")
    .select("source_type, source_id, chunk_index, content_hash")
    .in("source_id", sourceIds);
  if (exErr) throw exErr;

  const existingKey = new Map<string, string>();
  for (const r of existing ?? []) {
    existingKey.set(
      `${r.source_type}|${r.source_id}|${r.chunk_index}`,
      r.content_hash,
    );
  }

  let inserted = 0;
  let updatedDirty = 0;
  let unchanged = 0;

  const rowsToUpsert: Database["public"]["Tables"]["content_chunks"]["Insert"][] =
    [];

  for (const c of chunks) {
    const key = `${c.sourceType}|${c.sourceId}|${c.chunkIndex}`;
    const prevHash = existingKey.get(key);
    if (prevHash === c.contentHash) {
      unchanged++;
      continue;
    }
    rowsToUpsert.push({
      source_type: c.sourceType,
      source_id: c.sourceId,
      chunk_index: c.chunkIndex,
      law_code: c.lawCode,
      heading_path: c.headingPath,
      body_text: c.bodyText,
      token_count: c.tokenCount,
      content_hash: c.contentHash,
      embedded_at: null, // dirty — 다음 cron 에서 임베딩
    });
    if (prevHash === undefined) inserted++;
    else updatedDirty++;
  }

  if (rowsToUpsert.length === 0)
    return { inserted, updatedDirty, unchanged };

  const { error } = await adminClient.from("content_chunks").upsert(
    rowsToUpsert as never, // upsert 타입 union 폭주 회피 (Insert 타입과 동일)
    { onConflict: "source_type,source_id,chunk_index" },
  );
  if (error) throw error;
  keys; // 미사용 marker — 향후 selective re-fetch 용.
  return { inserted, updatedDirty, unchanged };
}

// ── dirty 마킹 / 삭제 ────────────────────────────────────────────────────

/**
 * source 단위 청크들을 dirty 처리 (embedded_at = null). 콘텐츠 변경 hook 에서 호출.
 * 다음 cron 이 재임베딩.
 */
export async function markChunksDirtyForSource(
  adminClient: SupabaseClient<Database>,
  sourceType: ChunkSourceType,
  sourceIds: ReadonlyArray<string>,
): Promise<number> {
  if (sourceIds.length === 0) return 0;
  const { error, count } = await adminClient
    .from("content_chunks")
    .update({ embedded_at: null }, { count: "exact" })
    .eq("source_type", sourceType)
    .in("source_id", sourceIds);
  if (error) throw error;
  return count ?? 0;
}

/** source 삭제 시 해당 청크 전부 제거. */
export async function deleteChunksForSource(
  adminClient: SupabaseClient<Database>,
  sourceType: ChunkSourceType,
  sourceId: string,
): Promise<number> {
  const { error, count } = await adminClient
    .from("content_chunks")
    .delete({ count: "exact" })
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);
  if (error) throw error;
  return count ?? 0;
}

// ── 임베딩 대기 큐 ───────────────────────────────────────────────────────

export interface DirtyChunkRow {
  chunkId: string;
  sourceType: ChunkSourceType;
  sourceId: string;
  chunkIndex: number;
  bodyText: string;
  tokenCount: number;
}

export async function listDirtyChunks(
  adminClient: SupabaseClient<Database>,
  limit = 50,
): Promise<DirtyChunkRow[]> {
  const { data, error } = await adminClient
    .from("content_chunks")
    .select("chunk_id, source_type, source_id, chunk_index, body_text, token_count")
    .is("embedded_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    chunkId: r.chunk_id,
    sourceType: r.source_type as ChunkSourceType,
    sourceId: r.source_id,
    chunkIndex: r.chunk_index,
    bodyText: r.body_text,
    tokenCount: r.token_count,
  }));
}

/**
 * 임베딩 벡터를 청크 row 에 저장. pgvector 는 PostgREST 에서 문자열 직렬화 — `[v1,v2,...]` 형태.
 */
export async function setChunkEmbedding(
  adminClient: SupabaseClient<Database>,
  chunkId: string,
  vector: ReadonlyArray<number>,
): Promise<void> {
  const literal = `[${vector.join(",")}]`;
  const { error } = await adminClient
    .from("content_chunks")
    .update({
      embedding: literal,
      embedded_at: new Date().toISOString(),
    })
    .eq("chunk_id", chunkId);
  if (error) throw error;
}

export async function countDirtyChunks(
  adminClient: SupabaseClient<Database>,
): Promise<number> {
  const { count, error } = await adminClient
    .from("content_chunks")
    .select("chunk_id", { count: "exact", head: true })
    .is("embedded_at", null);
  if (error) throw error;
  return count ?? 0;
}
