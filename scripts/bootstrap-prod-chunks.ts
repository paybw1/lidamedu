// v4-post — production content_chunks 부트스트랩.
//
// 실행 :
//   npx tsx scripts/bootstrap-prod-chunks.ts [--limit-articles=N] [--limit-cases=N] [--limit-problems=N]
//
// 흐름 :
//   1) patent articles/cases/problems 전부 조회 (subject_laws='patent' / law_code='patent' / subject_type='law')
//   2) reindexArticles/Cases/Problems 배치 호출 → content_chunks upsert (hash 동일이면 unchanged, 다르면 dirty 마킹)
//   3) listDirtyChunks → Voyage 임베딩 → setChunkEmbedding 반복 (~50/batch)
//   4) 최종 분포 보고 (source_type 별 chunks / embedded)
//
// 비용 : Voyage voyage-3-large input ~1.5M tokens ≈ $0.27 (200M 무료 한도 내 → 실청구 $0).
// 소요 : 청킹 1~2분 + 임베딩 ~5분 (rate limit 풀린 후).
//
// 의도적 제외 : Anthropic 호출 없음. embed-chunks cron 로직만 차용.

import "dotenv/config";

import adminClient from "../app/core/lib/supa-admin-client.server";
import {
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
} from "../app/features/ai-qna/lib/constants";
import {
  countDirtyChunks,
  listDirtyChunks,
  setChunkEmbedding,
} from "../app/features/ai-qna/queries.server";
import {
  reindexArticles,
  reindexCases,
  reindexProblems,
} from "../app/features/ai-qna/lib/source-chunker.server";

interface Args {
  limitArticles?: number;
  limitCases?: number;
  limitProblems?: number;
  skipChunking: boolean;
  skipEmbedding: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { skipChunking: false, skipEmbedding: false };
  for (const x of argv.slice(2)) {
    if (x === "--skip-chunking") a.skipChunking = true;
    else if (x === "--skip-embedding") a.skipEmbedding = true;
    else if (x.startsWith("--limit-articles=")) a.limitArticles = parseInt(x.slice("--limit-articles=".length), 10);
    else if (x.startsWith("--limit-cases=")) a.limitCases = parseInt(x.slice("--limit-cases=".length), 10);
    else if (x.startsWith("--limit-problems=")) a.limitProblems = parseInt(x.slice("--limit-problems=".length), 10);
  }
  return a;
}

interface VoyageEmbedResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { total_tokens?: number };
}

async function embedBatch(inputs: string[]): Promise<{ vectors: number[][]; tokens: number }> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY not set");

  const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      input: inputs,
      model: EMBEDDING_MODEL,
      input_type: "document",
      output_dimension: EMBEDDING_DIMS,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Voyage ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const json = (await resp.json()) as VoyageEmbedResponse;
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return {
    vectors: sorted.map((d) => d.embedding),
    tokens: json.usage?.total_tokens ?? 0,
  };
}

async function chunkAll(args: Args): Promise<void> {
  // patent articles
  process.stdout.write("[chunk] patent articles…\n");
  let { data: arts } = await adminClient
    .from("articles")
    .select("article_id, laws!inner(law_code)")
    .eq("laws.law_code", "patent")
    .eq("level", "article")
    .is("deleted_at", null)
    .not("current_revision_id", "is", null);
  if (args.limitArticles) arts = arts?.slice(0, args.limitArticles) ?? null;
  const artIds = (arts ?? []).map((a) => a.article_id);
  process.stdout.write(`  fetched ${artIds.length} article ids → reindex…\n`);
  // 배치 100개씩 reindex
  for (let i = 0; i < artIds.length; i += 100) {
    await reindexArticles(artIds.slice(i, i + 100));
    process.stdout.write(`  articles ${Math.min(i + 100, artIds.length)}/${artIds.length}\n`);
  }

  // patent cases (subject_laws array)
  process.stdout.write("[chunk] patent cases…\n");
  let { data: cases } = await adminClient
    .from("cases")
    .select("case_id, subject_laws")
    .contains("subject_laws", ["patent"])
    .is("deleted_at", null);
  if (args.limitCases) cases = cases?.slice(0, args.limitCases) ?? null;
  const caseIds = (cases ?? []).map((c) => c.case_id);
  process.stdout.write(`  fetched ${caseIds.length} case ids → reindex…\n`);
  for (let i = 0; i < caseIds.length; i += 100) {
    await reindexCases(caseIds.slice(i, i + 100));
    process.stdout.write(`  cases ${Math.min(i + 100, caseIds.length)}/${caseIds.length}\n`);
  }

  // patent problems
  process.stdout.write("[chunk] patent problems…\n");
  let { data: probs } = await adminClient
    .from("problems")
    .select("problem_id, laws!inner(law_code)")
    .eq("laws.law_code", "patent")
    .eq("subject_type", "law")
    .is("deleted_at", null);
  if (args.limitProblems) probs = probs?.slice(0, args.limitProblems) ?? null;
  const probIds = (probs ?? []).map((p) => p.problem_id);
  process.stdout.write(`  fetched ${probIds.length} problem ids → reindex…\n`);
  for (let i = 0; i < probIds.length; i += 100) {
    await reindexProblems(probIds.slice(i, i + 100));
    process.stdout.write(`  problems ${Math.min(i + 100, probIds.length)}/${probIds.length}\n`);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function embedAll(): Promise<{ embedded: number; tokens: number; failed: number }> {
  const BATCH = 50;
  let totalEmbedded = 0;
  let totalTokens = 0;
  let totalFailed = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const dirty = await listDirtyChunks(adminClient, BATCH);
    if (dirty.length === 0) break;
    let vectors: number[][] = [];
    let tokens = 0;
    try {
      const r = await embedBatch(dirty.map((d) => d.bodyText));
      vectors = r.vectors;
      tokens = r.tokens;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`  embedBatch error: ${msg.slice(0, 200)}\n`);
      // rate limit 추정 — 30초 대기 후 재시도
      if (msg.includes("429") || msg.includes("rate")) {
        await sleep(30000);
        continue;
      }
      totalFailed += dirty.length;
      break;
    }
    for (let i = 0; i < dirty.length; i++) {
      try {
        await setChunkEmbedding(adminClient, dirty[i]!.chunkId, vectors[i]!);
        totalEmbedded++;
      } catch (e) {
        totalFailed++;
      }
    }
    totalTokens += tokens;
    const remain = await countDirtyChunks(adminClient);
    process.stdout.write(`  embedded +${dirty.length}  remaining=${remain}  tokens=${totalTokens.toLocaleString()}\n`);
    await sleep(120);
  }
  return { embedded: totalEmbedded, tokens: totalTokens, failed: totalFailed };
}

async function reportDistribution(): Promise<void> {
  const { data } = await adminClient
    .from("content_chunks")
    .select("source_type, embedding")
    .limit(20000);
  if (!data) return;
  const stats: Record<string, { chunks: number; embedded: number }> = {};
  for (const r of data) {
    const t = r.source_type;
    if (!stats[t]) stats[t] = { chunks: 0, embedded: 0 };
    stats[t].chunks += 1;
    if (r.embedding != null) stats[t].embedded += 1;
  }
  process.stdout.write("\n=== content_chunks distribution ===\n");
  for (const [t, s] of Object.entries(stats)) {
    process.stdout.write(`  ${t.padEnd(10)} chunks=${s.chunks}  embedded=${s.embedded}\n`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const t0 = Date.now();

  if (!args.skipChunking) {
    await chunkAll(args);
  } else {
    process.stdout.write("[chunk] skipped\n");
  }

  if (!args.skipEmbedding) {
    process.stdout.write("\n[embed] dirty chunks → Voyage…\n");
    const r = await embedAll();
    process.stdout.write(`[embed] done — embedded=${r.embedded} failed=${r.failed} tokens=${r.tokens.toLocaleString()}\n`);
  } else {
    process.stdout.write("[embed] skipped\n");
  }

  await reportDistribution();
  process.stdout.write(`\n--- bootstrap done in ${Date.now() - t0} ms ---\n`);
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
