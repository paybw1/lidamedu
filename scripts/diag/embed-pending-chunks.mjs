// 밀린(embedded_at NULL) content_chunks 백로그를 Voyage 로 임베딩.
// embed-chunks.tsx cron 로직 미러. dry-run 기본, --apply 로 실행.
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
loadEnv();
const APPLY = process.argv.includes("--apply");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const apiKey = process.env.VOYAGE_API_KEY;
if (!apiKey) { console.error("VOYAGE_API_KEY 미설정"); process.exit(1); }

const MODEL = "voyage-3-large", DIMS = 1024, BATCH = 50;

async function embedBatch(inputs) {
  const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ input: inputs, model: MODEL, input_type: "document", output_dimension: DIMS }),
  });
  if (!resp.ok) throw new Error(`Voyage ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const json = await resp.json();
  return [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// dirty 전량 fetch
const { data: dirty, error } = await supabase.from("content_chunks")
  .select("chunk_id, source_type, body_text").is("embedded_at", null).order("created_at", { ascending: true });
if (error) throw error;
console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"}  / dirty chunks: ${dirty.length}`);
const byType = {};
for (const d of dirty) byType[d.source_type] = (byType[d.source_type] || 0) + 1;
console.log("by source_type:", byType);
if (!APPLY) { console.log("\n(dry-run — --apply 로 실행)"); process.exit(0); }

let done = 0, failed = 0;
for (let i = 0; i < dirty.length; i += BATCH) {
  const slice = dirty.slice(i, i + BATCH);
  const vecs = await embedBatch(slice.map((d) => d.body_text));
  if (vecs.length !== slice.length) { console.error(`batch ${i} vector mismatch`); failed += slice.length; continue; }
  for (let j = 0; j < slice.length; j++) {
    const literal = `[${vecs[j].join(",")}]`;
    const { error: uerr } = await supabase.from("content_chunks")
      .update({ embedding: literal, embedded_at: new Date().toISOString() }).eq("chunk_id", slice[j].chunk_id);
    if (uerr) { failed++; console.error(`update fail ${slice[j].chunk_id}: ${uerr.message}`); } else done++;
  }
  console.log(`  ${Math.min(i + BATCH, dirty.length)}/${dirty.length} 처리`);
}
const { count } = await supabase.from("content_chunks").select("*", { count: "exact", head: true }).is("embedded_at", null);
console.log(`\n완료: embedded=${done}, failed=${failed}, 남은 dirty=${count}`);
