// v7-A — patent article 298개 재청킹 (serializeBodyJson 적용 후).
// content_chunks 의 body_text 가 raw JSON → 평문으로 갱신, content_hash 변경 → embedded_at NULL 로 자동 dirty 마킹.
// 후속 : bootstrap-prod-chunks.ts --skip-chunking 으로 재임베딩.

import "dotenv/config";

import adminClient from "../app/core/lib/supa-admin-client.server";
import { reindexArticles } from "../app/features/ai-qna/lib/source-chunker.server";

async function main(): Promise<void> {
  process.stdout.write("=== v7-A reindex patent articles ===\n");
  const { data: arts } = await adminClient
    .from("articles")
    .select("article_id, laws!inner(law_code)")
    .eq("laws.law_code", "patent")
    .eq("level", "article")
    .is("deleted_at", null)
    .not("current_revision_id", "is", null);
  const ids = (arts ?? []).map((a) => a.article_id);
  process.stdout.write(`patent articles: ${ids.length}\n`);

  for (let i = 0; i < ids.length; i += 100) {
    await reindexArticles(ids.slice(i, i + 100));
    process.stdout.write(`  reindexed ${Math.min(i + 100, ids.length)}/${ids.length}\n`);
  }

  // dirty 확인
  const { count } = await adminClient
    .from("content_chunks")
    .select("chunk_id", { count: "exact", head: true })
    .eq("source_type", "article")
    .is("embedded_at", null);
  process.stdout.write(`\ndirty article chunks: ${count}\n`);
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
