// 밀린(embedded_at NULL) content_chunks 백로그를 Voyage 로 임베딩.
// embed-chunks.tsx cron 로직 미러. dry-run 기본, --apply 로 실행.
// 배치는 개수(≤50)와 추정 토큰(≤90k — Voyage 배치 한도 120k 여유분) 양쪽으로 제한,
// 전량 드레인까지 외부 루프(1000행 페이지 제한 대응).
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
loadEnv();
const APPLY = process.argv.includes("--apply");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const apiKey = process.env.VOYAGE_API_KEY;
if (!apiKey) { console.error("VOYAGE_API_KEY 미설정"); process.exit(1); }

const MODEL = "voyage-3-large", DIMS = 1024, BATCH = 50, BATCH_TOKENS = 90_000;

// 대략 토큰 추정 (한글 1자≈1.4) — 배치 한도 판단용
function estTokens(s) {
  let n = 0;
  for (const ch of s) n += ch >= "가" && ch <= "힯" ? 1.4 : /\s/.test(ch) ? 0 : 0.4;
  return Math.max(1, Math.round(n));
}

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

const { count: dirtyTotal } = await supabase.from("content_chunks")
  .select("*", { count: "exact", head: true }).is("embedded_at", null);
console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"}  / dirty chunks: ${dirtyTotal}`);
if (!APPLY) { console.log("\n(dry-run — --apply 로 실행)"); process.exit(0); }

let done = 0, failed = 0;
for (;;) {
  const { data: dirty, error } = await supabase.from("content_chunks")
    .select("chunk_id, source_type, body_text").is("embedded_at", null)
    .order("created_at", { ascending: true }).limit(1000);
  if (error) throw error;
  if (dirty.length === 0) break;

  let i = 0;
  while (i < dirty.length) {
    // 토큰·개수 이중 제한 배치
    const slice = [];
    let tok = 0;
    while (i < dirty.length && slice.length < BATCH) {
      const t = estTokens(dirty[i].body_text);
      if (slice.length > 0 && tok + t > BATCH_TOKENS) break;
      tok += t;
      slice.push(dirty[i]);
      i++;
    }
    const vecs = await embedBatch(slice.map((d) => d.body_text));
    if (vecs.length !== slice.length) { console.error(`batch vector mismatch`); failed += slice.length; continue; }
    for (let j = 0; j < slice.length; j++) {
      const literal = `[${vecs[j].join(",")}]`;
      const { error: uerr } = await supabase.from("content_chunks")
        .update({ embedding: literal, embedded_at: new Date().toISOString() }).eq("chunk_id", slice[j].chunk_id);
      if (uerr) { failed++; console.error(`update fail ${slice[j].chunk_id}: ${uerr.message}`); } else done++;
    }
    console.log(`  누적 ${done + failed}/${dirtyTotal} (이번 배치 ${slice.length}, ~${tok}tok)`);
  }
  if (failed > 0 && done === 0) break; // 전량 실패 루프 방지
}
const { count } = await supabase.from("content_chunks").select("*", { count: "exact", head: true }).is("embedded_at", null);
console.log(`\n완료: embedded=${done}, failed=${failed}, 남은 dirty=${count}`);
