// 2026-09-16 오류신고 후속 — 상표 ⑤번 선지 해설에 교재 비교표가 한 줄로 뭉개진 10건을
// 검수 큐(/admin/review)에 적재한다. 원본 HWPX 재추출 대상(hwpx-table-merge-cells 메모).
//   node scripts/audit/publish-trademark-choice-table-findings.mjs [--dry]
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { publishAuditFindings } from "../lib/audit-findings.mjs";

const CHOICE_IDS = [
  "6b002c3b-d626-46ca-ae67-550fe257ab18", "cc91ce55-383c-4cdd-809f-4f5adbe928e2",
  "e736b7eb-7da3-47d2-bce1-ffb3011e1fbe", "606b0105-54bf-4df3-b84d-1633952b15ce",
  "30fdccab-ee98-4ff2-ab3b-5fa4f0c3b3d1", "74128cb0-00df-4aa1-8b85-76ce8bb61123",
  "fae3a05e-338d-4f1e-80f8-0ce53dfa2e1c", "56f4b3aa-50eb-4f1c-8fd2-f2021d949d8c",
  "e31f4270-f4f0-4566-bfe5-89dd3db4e982", "1d0bd775-ad2d-424e-b679-916c02bda9a2",
];
const dry = process.argv.includes("--dry");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await sb
  .from("problem_choices")
  .select("choice_id, choice_index, problem_id, problems!inner(display_no)")
  .in("choice_id", CHOICE_IDS);
if (error) throw error;
const findings = (data ?? []).map((c) => ({
  entityType: "problem",
  entityId: c.problem_id,
  ruleKey: "choice_table_collapsed",
  severity: "warn",
  message: `⑤ 선지 해설(P-${c.problems.display_no})에 교재 비교표가 한 줄로 뭉개져 붙어 있음 — HWPX 원본에서 표를 재추출해 복원 필요(빈칸 추론 금지)`,
}));
console.log(`대상 ${findings.length}건`);
for (const f of findings) console.log(" -", f.entityId, f.message.slice(0, 40));
if (dry) process.exit(0);
const res = await publishAuditFindings(sb, { source: "trademark-choice-tables-20260916", findings });
console.log("적재:", res);
