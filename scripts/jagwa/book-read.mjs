// 기본서(리담특허법) 통독·검색 도구 — 모범답안 작성 전 '절 단위 통독'을 위한 것.
// 검색으로 나온 조각만 보고 답안을 쓰지 말고, 해당 절을 chunk_index 순서대로 읽을 것(CLAUDE.md Non-negotiable 11).
//
//   node scripts/jagwa/book-read.mjs --find 간접침해          # 키워드가 있는 chunk 목록(요약)
//   node scripts/jagwa/book-read.mjs 1690 1702               # 구간 통독(중복 청크는 접어서 출력)
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SRC = "f84eebc7-773a-467c-9e37-7579d485ce8e"; // 리담특허법 제25판
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const argv = process.argv.slice(2);
const findIdx = argv.indexOf("--find");

if (findIdx >= 0) {
  const kw = argv[findIdx + 1];
  const { data, error } = await supa
    .from("content_chunks")
    .select("chunk_index, body_text")
    .eq("source_id", SRC)
    .ilike("body_text", `%${kw}%`)
    .order("chunk_index")
    .limit(60);
  if (error) throw new Error(error.message);
  for (const r of data) console.log(`[${r.chunk_index}] ${r.body_text.replace(/\s+/g, " ").slice(0, 150)}`);
  console.log(`총 ${data.length}건 — 답안 작성 전 해당 절을 구간 통독할 것`);
} else {
  const [from, to] = argv.map(Number);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    console.log("사용법: --find <키워드>  또는  <from> <to>");
    process.exit(0);
  }
  const { data, error } = await supa
    .from("content_chunks")
    .select("chunk_index, body_text")
    .eq("source_id", SRC)
    .gte("chunk_index", from)
    .lte("chunk_index", to)
    .order("chunk_index");
  if (error) throw new Error(error.message);
  const seen = new Set(); // 인접 청크는 앞부분이 겹치므로 중복 출력 방지
  for (const r of data) {
    const key = r.body_text.trim().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`\n===== [${r.chunk_index}]\n${r.body_text.trim()}`);
  }
}
