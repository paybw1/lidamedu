// feat-9-001 임베딩 cron — content_chunks 의 dirty(embedded_at IS NULL) 청크에 임베딩을 채운다.
// 호출: Vercel cron 일1회(`0 17 * * *`, Hobby 플랜=일1회 제한 대응) + `?limit=200`.
//   한 번에 200개 처리. 그 이상 밀리면 다음 날 cron 이 이어 처리하거나
//   `scripts/diag/embed-pending-chunks.mjs --apply` 로 수동 드레인.
// 인증: CRON_SECRET (weekly-reports 등 기존 패턴 동일).
//
// 모드:
//  - VOYAGE_API_KEY 미설정 → dry-run. 청크 수만 보고. 운영 시 활성화.
//  - 키 있으면 Voyage `voyage-3-large` 호출(EMBEDDING_MODEL/EMBEDDING_DIMS 상수).
//
// 한 호출당 batch 처리(default 50). 더 많으면 다음 cron 이 이어 처리.

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
} from "~/features/ai-qna/lib/constants";
import {
  countDirtyChunks,
  listDirtyChunks,
  setChunkEmbedding,
} from "~/features/ai-qna/queries.server";

import type { Route } from "./+types/embed-chunks";

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  return false;
}

interface VoyageEmbedResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage?: { total_tokens?: number };
}

/**
 * Voyage AI Embeddings API 호출. dry-run 일 때는 빈 배열 반환.
 * @returns vectors[i] === inputs[i] 의 임베딩
 */
async function embedBatch(inputs: string[]): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return []; // dry-run

  const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: inputs,
      model: EMBEDDING_MODEL,
      input_type: "document", // document 색인용. 질의 시점엔 'query' 로 전환.
      output_dimension: EMBEDDING_DIMS,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Voyage embed failed ${resp.status}: ${txt.slice(0, 500)}`);
  }
  const json = (await resp.json()) as VoyageEmbedResponse;
  // index 순으로 정렬 후 반환.
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

async function run(request: Request) {
  if (!checkAuth(request)) {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
  );

  const dirty = await listDirtyChunks(adminClient, limit);
  const dryRun = !process.env.VOYAGE_API_KEY;
  if (dryRun) {
    const remain = await countDirtyChunks(adminClient);
    return data({
      ok: true,
      mode: "dry-run",
      reason: "VOYAGE_API_KEY not set",
      dirtyInBatch: dirty.length,
      dirtyTotal: remain,
      model: EMBEDDING_MODEL,
      dims: EMBEDDING_DIMS,
    });
  }
  if (dirty.length === 0) {
    return data({ ok: true, mode: "live", embedded: 0, dirtyTotal: 0 });
  }

  // Voyage 단일 호출에 dirty.length 개 입력. 응답 인덱스 기준으로 매핑.
  const vectors = await embedBatch(dirty.map((d) => d.bodyText));
  if (vectors.length !== dirty.length) {
    return data(
      {
        ok: false,
        error: `vector count mismatch: ${vectors.length} vs ${dirty.length}`,
      },
      { status: 500 },
    );
  }

  let embedded = 0;
  let failed = 0;
  for (let i = 0; i < dirty.length; i++) {
    try {
      await setChunkEmbedding(adminClient, dirty[i].chunkId, vectors[i]);
      embedded++;
    } catch (e) {
      failed++;
      // best-effort — 다음 청크 진행. 실패는 다음 cron 에서 dirty 로 남아 재시도.
      console.error(
        `setChunkEmbedding failed (chunk=${dirty[i].chunkId}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  const remain = await countDirtyChunks(adminClient);
  return data({
    ok: true,
    mode: "live",
    embedded,
    failed,
    dirtyTotal: remain,
    model: EMBEDDING_MODEL,
    dims: EMBEDDING_DIMS,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
