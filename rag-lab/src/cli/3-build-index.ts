/**
 * 단계 ④ — 통합 인덱스 빌드.
 *
 *   data/db_export/*.jsonl  +  data/chunks/added/*.jsonl
 *     → index/chunks.jsonl          (모든 청크 metadata, idx 순서 == 벡터 row 순서)
 *     → index/vectors.bin           (Float32 N × dim, L2 정규화)
 *     → index/bm25.json             (BM25 모델)
 *     → index/manifest.json         (요약)
 *
 * 옵션:
 *   --dry-run            임베딩 API 호출 없이 비용 추정·BM25 만 빌드
 *   --limit=N            처음 N 청크만 (sanity check)
 *
 * 모든 청크는 `parseChunk()` 로 재검증한 뒤 인덱스에 들어간다.
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChunk, emptyStats, tallyChunk, type Chunk } from '../schema/chunk.js';
import { configFromEnv, embedDocuments } from '../lib/embed.js';
import { buildBm25, saveBm25 } from '../lib/bm25.js';
import { buildVectorStore, saveVectorStore } from '../lib/vectors.js';
import { estimateEmbedCost, fmtUsd } from '../lib/cost.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DB_EXPORT = join(ROOT, 'data', 'db_export');
const ADDED = join(ROOT, 'data', 'chunks', 'added');
const INDEX = join(ROOT, 'index');

type Args = { dryRun: boolean; limit?: number };
function parseArgs(argv: string[]): Args {
  const a: Args = { dryRun: false };
  for (const x of argv.slice(2)) {
    if (x === '--dry-run') a.dryRun = true;
    else if (x.startsWith('--limit=')) a.limit = parseInt(x.slice('--limit='.length), 10);
  }
  return a;
}

async function readJsonl(filepath: string): Promise<Chunk[]> {
  try {
    const text = await readFile(filepath, 'utf8');
    return text.split('\n').filter(Boolean).map((line) => parseChunk(JSON.parse(line)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

async function loadAllChunks(args: Args): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  // DB export
  for (const f of ['statute.jsonl', 'case.jsonl', 'problem.jsonl']) {
    const cs = await readJsonl(join(DB_EXPORT, f));
    process.stdout.write(`  [load] ${f}: ${cs.length}\n`);
    chunks.push(...cs);
  }
  // Added
  try {
    const files = (await readdir(ADDED)).filter((f) => f.endsWith('.jsonl'));
    for (const f of files) {
      const cs = await readJsonl(join(ADDED, f));
      process.stdout.write(`  [load] added/${f}: ${cs.length}\n`);
      chunks.push(...cs);
    }
  } catch { /* dir 없음 OK */ }

  // 청크 ID 중복 체크 — 안정 키이지만 데이터 사고로 충돌 가능
  const seen = new Set<string>();
  const unique: Chunk[] = [];
  let dupes = 0;
  for (const c of chunks) {
    if (seen.has(c.id)) { dupes += 1; continue; }
    seen.add(c.id);
    unique.push(c);
  }
  if (dupes) process.stdout.write(`  [load] dedup: dropped ${dupes} dupes\n`);

  if (args.limit) return unique.slice(0, args.limit);
  return unique;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const cfg = configFromEnv();
  // CLI flag 가 우선
  const effectiveDryRun = args.dryRun || cfg.dryRun;
  const t0 = Date.now();

  process.stdout.write('--- loading chunks ---\n');
  const chunks = await loadAllChunks(args);
  if (chunks.length === 0) {
    process.stderr.write('청크 0건 — 단계 ②/③ 실행 먼저.\n');
    process.exit(1);
  }

  const stats = emptyStats();
  for (const c of chunks) tallyChunk(stats, c);
  process.stdout.write(`\n--- chunks loaded: ${chunks.length} ---\n`);
  process.stdout.write(`by doc_type: ${JSON.stringify(stats.byDocType)}\n`);
  process.stdout.write(`by tier:     ${JSON.stringify(stats.byTier)}\n`);
  process.stdout.write(`by subject:  ${JSON.stringify(stats.bySubject)}\n`);
  process.stdout.write(`approx tokens (sum): ${stats.totalTokens.toLocaleString()}\n`);

  const est = estimateEmbedCost(stats.totalTokens);
  process.stdout.write(`\n[cost estimate] ${est.line}\n`);
  process.stdout.write(`(근사치. 실제는 Voyage tokenizer 기준이며 ±30% 마진 가능.)\n`);
  if (effectiveDryRun) {
    process.stdout.write('\n--- dry-run: 임베딩 API 호출 skip ---\n');
  }

  // ----- BM25 (로컬, 비용 0) -----
  process.stdout.write('\n--- building BM25 ---\n');
  const bm25 = buildBm25(chunks.map((c) => c.content));
  process.stdout.write(`  vocab: ${bm25.df.size} terms · avgdl: ${bm25.avgdl.toFixed(1)} tokens\n`);

  // ----- embeddings -----
  let vectors: Float32Array[];
  let usedTokens = 0;
  if (effectiveDryRun) {
    vectors = chunks.map(() => new Float32Array(cfg.dim));   // zero vectors
  } else {
    process.stdout.write('\n--- embedding via Voyage ---\n');
    const result = await embedDocuments(
      chunks.map((c) => c.content),
      cfg,
      (done, total, tokens) => {
        if (done % 200 === 0 || done === total) {
          const pct = ((done / total) * 100).toFixed(1);
          const cost = estimateEmbedCost(tokens);
          process.stdout.write(`  ${done}/${total} (${pct}%) · ${tokens.toLocaleString()} tok · ${fmtUsd(cost.usd)}\n`);
        }
      },
    );
    vectors = result.vectors;
    usedTokens = result.totalTokens;
  }

  const store = buildVectorStore(vectors, cfg.dim);
  process.stdout.write(`\n--- vector store: ${store.N} × ${store.dim} (${(store.matrix.byteLength / 1024 / 1024).toFixed(1)} MB) ---\n`);

  // ----- save -----
  await mkdir(INDEX, { recursive: true });
  // chunks metadata (벡터 row 순서와 동일)
  await writeFile(
    join(INDEX, 'chunks.jsonl'),
    chunks.map((c) => JSON.stringify(c)).join('\n') + '\n',
    'utf8',
  );
  // vectors
  saveVectorStore(store, join(INDEX, 'vectors.bin'));
  // bm25
  await writeFile(join(INDEX, 'bm25.json'), JSON.stringify(saveBm25(bm25)), 'utf8');
  // manifest
  const actualCost = effectiveDryRun ? 0 : estimateEmbedCost(usedTokens).usd;
  await writeFile(
    join(INDEX, 'manifest.json'),
    JSON.stringify({
      built_at: new Date().toISOString(),
      chunks: chunks.length,
      dim: cfg.dim,
      model: cfg.model,
      stats: {
        by_doc_type: stats.byDocType,
        by_tier: stats.byTier,
        by_subject: stats.bySubject,
        approx_tokens: stats.totalTokens,
      },
      embedding: {
        dry_run: effectiveDryRun,
        actual_tokens: usedTokens,
        estimated_cost_usd: actualCost,
      },
      bm25: {
        vocab: bm25.df.size,
        avgdl: bm25.avgdl,
      },
      duration_ms: Date.now() - t0,
    }, null, 2),
    'utf8',
  );

  process.stdout.write(`\n--- done in ${Date.now() - t0} ms ---\n`);
  process.stdout.write(`output: ${INDEX}\n`);
  if (!effectiveDryRun) {
    process.stdout.write(`actual Voyage tokens used: ${usedTokens.toLocaleString()} → ${fmtUsd(actualCost)}\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
