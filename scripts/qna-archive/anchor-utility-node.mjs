// 실용신안법 아카이브 질문 → 체계도 노드 "09 실용신안법" 앵커 (원장 지시 2026-07-08).
// 조문 체계가 특허법과 달라 조문 매핑에서 제외했던 21건 — target_type='node' 로 전환.
// dry-run 기본, --apply.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sha1 = (s) => createHash("sha1").update(s).digest("hex");

// "09 실용신안법" 노드 — 라벨로 재조회(하드코딩 검증)
const { data: nodes } = await sb
  .from("systematic_nodes")
  .select("node_id, display_label, law_code")
  .eq("law_code", "patent")
  .ilike("display_label", "%실용신안%");
if (!nodes || nodes.length !== 1) throw new Error(`실용신안 노드 확인 실패: ${JSON.stringify(nodes)}`);
const NODE_ID = nodes[0].node_id;
console.log(`노드: ${nodes[0].display_label} (${NODE_ID})`);

const { entries } = JSON.parse(
  readFileSync(resolve(process.cwd(), "source/_converted/qna-archive-enriched.json"), "utf8"),
);
const utility = entries.filter(
  (e) => e.subjectRaw === "실용신안법" || /실용신안법/.test(e.sourceFile ?? ""),
);
const keys = [...new Set(utility.map((e) => sha1(`${e.subject}|${e.question}|${e.answer}`)))];
console.log(`실용신안 항목 ${utility.length}건 (archive_key ${keys.length}개)`);

const { data: threads, error } = await sb
  .from("qna_threads")
  .select("thread_id, title, target_type, display_no")
  .in("archive_key", keys)
  .is("deleted_at", null);
if (error) throw error;
const targets = threads.filter((t) => t.target_type === "study_method");
console.log(`DB 매칭 ${threads.length}건, 그중 study_method(전환 대상) ${targets.length}건`);
for (const t of targets) console.log(`  Q-${t.display_no}  ${t.title.slice(0, 50)}`);

if (!APPLY) { console.log("--apply 로 반영"); process.exit(0); }
for (const t of targets) {
  const { error: upErr } = await sb
    .from("qna_threads")
    .update({
      target_type: "node",
      target_id: NODE_ID,
      node_id: NODE_ID,
      updated_at: new Date().toISOString(),
    })
    .eq("thread_id", t.thread_id);
  if (upErr) throw upErr;
}
console.log("반영 완료:", targets.length);
