// feat-9-010 ④ — 아카이브 qna_threads → content_chunks(source_type='qna') 적재.
// 임베딩은 채우지 않음(embedded_at NULL) → scripts/diag/embed-pending-chunks.mjs --apply 로 드레인.
// 멱등: (source_type, source_id, chunk_index) upsert + content_hash 동일 시 embedded_at 보존.
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT_LABEL = { patent: "특허법", trademark: "상표법", design: "디자인보호법" };
// chunker.ts 와 동일 정규화·해시 (backfill-content-chunks.mjs 와 같은 계약)
const normalizeBody = (s) =>
  s.replace(/<\/?u>/g, "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const sha256Hex = (s) => createHash("sha256").update(s, "utf-8").digest("hex");
function estimateTokens(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  let count = 0;
  for (const ch of trimmed) {
    if (ch >= "가" && ch <= "힯") count += 1.4;
    else if (/\s/.test(ch)) count += 0.0;
    else count += 0.4;
  }
  count += trimmed.split(/\s+/).length * 0.2;
  return Math.max(1, Math.round(count));
}

// 아카이브 스레드 전량 (멀티턴 메시지 포함)
const threads = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("qna_threads")
    .select("thread_id, subject, title, question_md, answer_md, created_at")
    .eq("archive_source", "cafe-archive")
    .is("deleted_at", null)
    .range(from, from + 999);
  if (error) throw error;
  threads.push(...data);
  if (data.length < 1000) break;
}
const followups = new Map(); // thread_id → [{role, body}]
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("qna_messages")
    .select("thread_id, role, body_md, created_at")
    .in("role", ["student", "instructor"])
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .range(from, from + 999);
  if (error) throw error;
  for (const m of data) {
    if (!followups.has(m.thread_id)) followups.set(m.thread_id, []);
    followups.get(m.thread_id).push(m);
  }
  if (data.length < 1000) break;
}
console.log(`아카이브 스레드 ${threads.length}건`);

const MAX_BODY = 4000; // chars — 초과 시 답변을 이어서 청크 분할
const rows = [];
for (const t of threads) {
  const date = (t.created_at ?? "").slice(0, 10);
  const heading = `강사 Q&A · ${SUBJECT_LABEL[t.subject] ?? t.subject} · ${(t.title ?? "").slice(0, 60)}${date ? ` (${date})` : ""}`;
  let full = `[강사 Q&A] ${t.title}\n질문: ${t.question_md}\n답변: ${t.answer_md ?? ""}`;
  for (const m of followups.get(t.thread_id) ?? [])
    full += `\n${m.role === "student" ? "추가질문" : "재답변"}: ${m.body_md}`;
  full = normalizeBody(full);
  // 분할 — 문단 경계 우선
  const parts = [];
  let rest = full;
  while (rest.length > MAX_BODY) {
    let cut = rest.lastIndexOf("\n", MAX_BODY);
    if (cut < MAX_BODY * 0.5) cut = MAX_BODY;
    parts.push(rest.slice(0, cut));
    rest = `[강사 Q&A] ${t.title} (이어서)\n` + rest.slice(cut).trimStart();
  }
  parts.push(rest);
  parts.forEach((body, i) => {
    rows.push({
      source_type: "qna",
      source_id: t.thread_id,
      chunk_index: i,
      law_code: t.subject,
      heading_path: heading,
      body_text: body,
      token_count: estimateTokens(body),
      content_hash: sha256Hex(body),
      authority_tier: 1,
    });
  });
}
console.log(`청크 ${rows.length}개 (분할 발생 ${rows.length - threads.length})`);
const totalTokens = rows.reduce((a, r) => a + r.token_count, 0);
console.log(`추정 토큰 합계 ${Math.round(totalTokens / 1000)}k`);

if (!APPLY) {
  console.log("\n[dry-run] 샘플:");
  console.log(JSON.stringify({ ...rows[0], body_text: rows[0].body_text.slice(0, 200) }, null, 1));
  console.log("\n--apply 로 실행하세요.");
  process.exit(0);
}

// 기존 qna 청크의 content_hash 로드 — 동일하면 skip(임베딩 보존)
const existing = new Map();
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("content_chunks")
    .select("source_id, chunk_index, content_hash")
    .eq("source_type", "qna")
    .range(from, from + 999);
  if (error) throw error;
  for (const r of data) existing.set(`${r.source_id}|${r.chunk_index}`, r.content_hash);
  if (data.length < 1000) break;
}
const todo = rows.filter((r) => existing.get(`${r.source_id}|${r.chunk_index}`) !== r.content_hash);
console.log(`기존 동일 ${rows.length - todo.length} skip → upsert ${todo.length}`);

let n = 0;
for (let i = 0; i < todo.length; i += 500) {
  const batch = todo.slice(i, i + 500).map((r) => ({ ...r, embedded_at: null }));
  const { error } = await sb
    .from("content_chunks")
    .upsert(batch, { onConflict: "source_type,source_id,chunk_index" });
  if (error) throw error;
  n += batch.length;
  console.log(`  ${n}/${todo.length}`);
}
console.log(`완료 — ${n}개 upsert (embedded_at NULL → 임베딩 드레인 필요)`);
