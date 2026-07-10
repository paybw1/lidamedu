// 디자인 판례 적재(Stage 2c) — cards.json 의 본문 카드(날짜 有) → cases insert.
//   상표 book import 필드 매핑 미러: case_title=summary_title=쟁점, summary_body_md="",
//   reasoning_md=본문, case_type=[사건명] 대괄호, comment_source="리담 디자인보호법 판례".
//   needsDate(날짜 미상 특허 2건) + 관련 인용은 Stage 3(API)로.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
if (!url || !url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod`);
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
const apply = process.argv.includes("--apply");

const { cards } = JSON.parse(readFileSync("tmp/design-cases/cards.json", "utf8"));
const topicNodes = JSON.parse(readFileSync("tmp/design-cases/topic-nodes.json", "utf8"));
const nodeByTopic = new Map(topicNodes.map((t) => [t.num, t.node_id]));

const stripGlyph = (p) => p.replace(/^\s*[^\[가-힣]*/u, "");
const caseTypeOf = (body) => { const m = /\[([^\]]*[가-힣]\([가-힣]\))\]\s*\)?\s*$/.exec(body.trim()) || /판결\s*\[([^\]]+)\]/.exec(body) || /\[([가-힣]+\([가-힣]\))\]/.exec(body); return m ? m[1] : null; };
const reasoningOf = (body, issue) => { let r = stripGlyph(body); if (issue) r = r.replace(new RegExp(`^\\s*\\[${issue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*`), ""); return r.trim(); };

const mains = cards.filter((c) => c.kind === "main" && !c.needsDate && c.caseNo && c.decidedAt);
let seq = 0;
const rows = [];
for (const c of cards) { // reading order for source_seq
  if (c.kind !== "main" || c.needsDate || !c.decidedAt) continue;
  seq += 1;
  const node = nodeByTopic.get(c.topicNum);
  rows.push({
    case_number: c.caseNo,
    court: c.court,
    decided_at: c.decidedAt,
    subject_laws: ["design"],
    primary_node_id: node,
    case_title: c.issue ?? c.caseNo,
    summary_title: c.issue ?? c.caseNo,
    summary_body_md: "",
    reasoning_md: reasoningOf(c.body, c.issue),
    case_type: caseTypeOf(c.body),
    source_seq: seq,
    comment_source: "리담 디자인보호법 판례",
  });
}

console.log(`적재 대상 본문 카드: ${rows.length} (needsDate 2·관련 ${cards.filter((c) => c.kind === "related").length} 제외)`);
if (!apply) {
  rows.slice(0, 5).forEach((r) => console.log(`[dry] ${r.case_number} ${r.court} ${r.decided_at} [${(r.case_title || "").slice(0, 40)}] type=${r.case_type} node=${r.primary_node_id?.slice(0, 8)}`));
  console.log("\n--apply 로 실제 적재.");
  process.exit(0);
}
const done = [];
for (const row of rows) {
  const { data, error } = await sb.from("cases").insert(row).select("case_id").single();
  if (error) { console.error("❌", row.case_number, error.message); continue; }
  done.push({ case_id: data.case_id, case_number: row.case_number, topic: row.source_seq });
}
writeFileSync("tmp/design-cases/inserted-cases.json", JSON.stringify(done, null, 1));
console.log(`✔ 적재 ${done.length}건 (inserted-cases.json 롤백용 저장)`);
