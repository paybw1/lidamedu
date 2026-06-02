// §3 마무리 — official_text_md 적재된 4건 케이스의 공식전문 청크만 임베드.
//
// 전체 dirty 가 아닌 우리 source_id 한정 — 비용·실행 시간 통제.
// 로컬 개발 머신에서 voyage-3-large 직접 호출. 운영은 /cron/embed-chunks 가 처리.

import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
} from "../../app/features/ai-qna/lib/constants";
import { setChunkEmbedding } from "../../app/features/ai-qna/queries.server";

const SUPA = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const VOYAGE = process.env.VOYAGE_API_KEY;
if (!VOYAGE) {
  process.stderr.write("VOYAGE_API_KEY 없음\n");
  process.exit(1);
}

const statePath = resolve(process.cwd(), "tmp/law-api-state.json");
if (!existsSync(statePath)) {
  process.stderr.write("tmp/law-api-state.json 없음\n");
  process.exit(1);
}
const state = JSON.parse(readFileSync(statePath, "utf-8")) as {
  processed?: Record<string, { caseId?: string }>;
};
const caseIds = [
  ...new Set(
    Object.values(state.processed ?? {})
      .map((s) => s?.caseId)
      .filter((v): v is string => typeof v === "string"),
  ),
];

process.stdout.write(`\n=== §3 embed (${caseIds.length} cases — 공식전문만) ===\n`);

const { data: dirty, error } = await SUPA
  .from("content_chunks")
  .select("chunk_id, body_text, token_count, heading_path")
  .eq("source_type", "case")
  .in("source_id", caseIds)
  .is("embedded_at", null);
if (error) throw error;
if (!dirty || dirty.length === 0) {
  process.stdout.write(`dirty 0건 — 이미 임베드됨\n`);
  process.exit(0);
}
process.stdout.write(`dirty ${dirty.length}건 → voyage 호출\n`);
for (const c of dirty) {
  const last = (c.heading_path ?? "").split("·").pop()?.trim() ?? "?";
  process.stdout.write(`  ${c.chunk_id.slice(0, 8)}…  ${last}  ${c.token_count} tok\n`);
}

const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${VOYAGE}`,
  },
  body: JSON.stringify({
    input: dirty.map((d) => d.body_text),
    model: EMBEDDING_MODEL,
    input_type: "document",
    output_dimension: EMBEDDING_DIMS,
  }),
});
if (!resp.ok) {
  const txt = await resp.text();
  process.stderr.write(`voyage ${resp.status}: ${txt.slice(0, 500)}\n`);
  process.exit(1);
}
const json = (await resp.json()) as {
  data: { embedding: number[]; index: number }[];
  usage?: { total_tokens?: number };
};
const vectors = [...json.data]
  .sort((a, b) => a.index - b.index)
  .map((d) => d.embedding);
process.stdout.write(
  `\nvoyage 응답: ${vectors.length} vectors, ${vectors[0]?.length ?? 0}-dim, usage=${json.usage?.total_tokens ?? "?"} tok\n`,
);

let ok = 0;
for (let i = 0; i < dirty.length; i++) {
  try {
    await setChunkEmbedding(SUPA as never, dirty[i].chunk_id, vectors[i]);
    ok++;
  } catch (e) {
    process.stderr.write(`  ✗ ${dirty[i].chunk_id.slice(0, 8)}…  ${e instanceof Error ? e.message : String(e)}\n`);
  }
}
process.stdout.write(`\n${ok}/${dirty.length} 임베드 저장 성공\n`);
