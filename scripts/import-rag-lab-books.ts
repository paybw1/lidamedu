// v5-② — rag-lab 검증 청크(textbook/practice)를 production content_chunks 에 적재.
//
// 입력 : rag-lab/data/chunks/added/textbook.jsonl (2546) + practice.jsonl (2186)
// 출력 : study_books seed 3건 + content_chunks ~4732건 (embedding=NULL, dirty)
//
// 흐름 :
//   1) 두 JSONL 로드 → (book_title, kind) 로 책 그룹화
//   2) study_books upsert (UNIQUE (kind, title))
//   3) 책별로 chunk_index 0..N-1 재부여 (production source_type+source_id+chunk_index UNIQUE 제약)
//   4) content_chunks upsert (book_id 를 source_id 로)
//
// idempotent : 동일 (source_type, source_id, chunk_index) 충돌 시 body_text/heading_path/token_count 갱신.
// embedding 은 NULL 로 유지 — embed cron 이 자동 처리. content_hash 변경 시 dirty 마킹.

import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import adminClient from "../app/core/lib/supa-admin-client.server";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CHUNKS_DIR = join(REPO_ROOT, "rag-lab", "data", "chunks", "added");

// ── rag-lab JSONL 청크 형태 ────────────────────────────────────────────
interface RagLabChunk {
  id: string;
  content: string;
  doc_type: "textbook" | "practice";
  source_type: string;
  source: string;
  source_id: string;
  subject: string | null;
  chunk_index: number;
  meta: {
    doc_type: string;
    book_title: string;
    author: string | null;
    page_start: number | null;
    page_end: number | null;
    section_path: string | null;
    filepath: string;
  };
  authority_tier: number;
  token_count: number;
  content_hash: string;
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

async function loadJsonl(path: string): Promise<RagLabChunk[]> {
  const text = await readFile(path, "utf8");
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as RagLabChunk);
}

interface BookGroup {
  kind: "textbook" | "practice";
  title: string;
  filepath: string;
  chunks: RagLabChunk[];
}

function buildHeadingPath(book: BookGroup, chunk: RagLabChunk): string {
  const parts: string[] = [book.title];
  if (chunk.meta.section_path) parts.push(chunk.meta.section_path);
  if (chunk.meta.page_start != null) {
    const page =
      chunk.meta.page_end != null && chunk.meta.page_end !== chunk.meta.page_start
        ? `p.${chunk.meta.page_start}-${chunk.meta.page_end}`
        : `p.${chunk.meta.page_start}`;
    parts.push(page);
  }
  return parts.join(" · ");
}

async function upsertBook(group: BookGroup): Promise<string> {
  // UNIQUE (kind, title) → onConflict 로 idempotent.
  const { data, error } = await adminClient
    .from("study_books")
    .upsert(
      {
        kind: group.kind,
        title: group.title,
        subject: "patent",                      // 본 라운드는 모두 특허
        author: null,
        edition: null,
        file_path: group.filepath,
      },
      { onConflict: "kind,title" },
    )
    .select("book_id")
    .single();
  if (error || !data) throw error ?? new Error("upsertBook failed");
  return data.book_id;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function insertChunks(
  bookId: string,
  group: BookGroup,
  batchSize = 100,
): Promise<{ inserted: number; updated: number }> {
  // 책 내부에서 chunk_index 0..N-1 재부여 (rag-lab JSONL 의 chunk_index 는 파일 전체 기준)
  const rows = group.chunks.map((c, i) => ({
    source_type: group.kind,                  // 'textbook' | 'practice'
    source_id: bookId,
    chunk_index: i,
    law_code: "patent",
    heading_path: buildHeadingPath(group, c),
    body_text: c.content,
    token_count: c.token_count,
    content_hash: sha256(c.content),
    embedding: null,
    embedded_at: null,
    authority_tier: 2 as const,
  }));

  // UNIQUE (source_type, source_id, chunk_index) 으로 upsert.
  // 같은 hash 면 dirty 유지 X (UPDATE 안 함). 다른 hash 면 갱신 + embedded_at=NULL 로 dirty 마킹.
  // 단순화: 항상 upsert (hash 비교는 후속 cron 이 자체적으로 skip 가능 — embed-chunks 는 embedded_at IS NULL 만 처리)
  let inserted = 0;
  const MAX_RETRY = 4;
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    let lastErr: unknown = null;
    let ok = false;
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      try {
        const { error } = await adminClient
          .from("content_chunks")
          .upsert(slice, { onConflict: "source_type,source_id,chunk_index" });
        if (error) throw error;
        ok = true;
        break;
      } catch (e) {
        lastErr = e;
        const wait = 1000 * (2 ** attempt);
        process.stderr.write(
          `  retry ${attempt + 1}/${MAX_RETRY} after ${wait}ms (batch ${i}): ${e instanceof Error ? e.message.slice(0, 100) : String(e).slice(0, 100)}\n`,
        );
        await sleep(wait);
      }
    }
    if (!ok) {
      throw lastErr ?? new Error(`upsert failed after ${MAX_RETRY} retries at batch ${i}`);
    }
    inserted += slice.length;
    process.stdout.write(`  upserted ${Math.min(i + batchSize, rows.length)}/${rows.length}\n`);
    // 살짝 호흡 — Supabase API rate limit 회피
    if (i + batchSize < rows.length) await sleep(50);
  }
  return { inserted, updated: 0 };
}

async function main(): Promise<void> {
  process.stdout.write("=== v5-② rag-lab books → production ===\n\n");

  // 1) JSONL 로드
  const textbookChunks = await loadJsonl(join(CHUNKS_DIR, "textbook.jsonl"));
  const practiceChunks = await loadJsonl(join(CHUNKS_DIR, "practice.jsonl"));
  process.stdout.write(`textbook.jsonl: ${textbookChunks.length}\n`);
  process.stdout.write(`practice.jsonl: ${practiceChunks.length}\n\n`);

  // 2) (kind, book_title) 로 그룹화
  const groups = new Map<string, BookGroup>();
  const addAll = (chunks: RagLabChunk[], kind: "textbook" | "practice") => {
    for (const c of chunks) {
      const key = `${kind}::${c.meta.book_title}`;
      let g = groups.get(key);
      if (!g) {
        g = { kind, title: c.meta.book_title, filepath: c.meta.filepath, chunks: [] };
        groups.set(key, g);
      }
      g.chunks.push(c);
    }
  };
  addAll(textbookChunks, "textbook");
  addAll(practiceChunks, "practice");

  process.stdout.write(`grouped into ${groups.size} books:\n`);
  for (const g of groups.values()) {
    process.stdout.write(`  [${g.kind}] ${g.title}  (${g.chunks.length} chunks)\n`);
  }

  // 3) study_books upsert + content_chunks insert
  let totalInserted = 0;
  for (const group of groups.values()) {
    process.stdout.write(`\n[${group.kind}] ${group.title} → upsert book…\n`);
    const bookId = await upsertBook(group);
    process.stdout.write(`  book_id: ${bookId}\n`);

    const res = await insertChunks(bookId, group);
    totalInserted += res.inserted;
  }

  // 4) 최종 분포 보고
  const { data: dist } = await adminClient
    .from("content_chunks")
    .select("source_type, authority_tier, embedding")
    .limit(20000);
  const stats: Record<string, { chunks: number; embedded: number }> = {};
  for (const r of dist ?? []) {
    const k = `${r.source_type}/t${r.authority_tier}`;
    if (!stats[k]) stats[k] = { chunks: 0, embedded: 0 };
    stats[k].chunks++;
    if (r.embedding != null) stats[k].embedded++;
  }
  process.stdout.write(`\n=== content_chunks final distribution ===\n`);
  for (const [k, s] of Object.entries(stats)) {
    process.stdout.write(`  ${k.padEnd(15)} chunks=${s.chunks}  embedded=${s.embedded}\n`);
  }
  process.stdout.write(`\ntotal upserted: ${totalInserted}\n`);
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
