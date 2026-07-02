// 최신판례 배치 — 지정 연도(기본 2026)에 선고된 판례를 과목별 '최신판례' 노드로 이동.
//   과목: patent / trademark / design. 각 과목의 case_only '최신판례' 최상위 노드로
//   primary_node_id 를 세팅(우선순위 primary_node_id > primary_article_id 라 최신판례에만 노출).
// 적용 전 현재 primary_node_id 를 .factbox/latest-cases-backup-<year>.json 에 백업(롤백용).
//
// 사용:
//   node scripts/jagwa/assign-latest-cases.mjs            # dry-run, 2026
//   node scripts/jagwa/assign-latest-cases.mjs --year=2026 --apply
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod`);
const sb = createClient(url, key);

const yearArg = process.argv.find((a) => a.startsWith("--year="));
const year = yearArg ? Number(yearArg.split("=")[1]) : 2026;
const apply = process.argv.includes("--apply");
const SUBJECTS = ["patent", "trademark", "design"];

async function latestNodeId(lawCode) {
  const { data, error } = await sb
    .from("systematic_nodes")
    .select("node_id, display_label")
    .eq("law_code", lawCode)
    .eq("case_only", true)
    .is("parent_id", null)
    .like("display_label", "%최신판례%")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.node_id ?? null;
}

const yStart = `${year}-01-01`;
const yEnd = `${year + 1}-01-01`;
const backup = [];
let totalMatched = 0;

for (const subj of SUBJECTS) {
  const nodeId = await latestNodeId(subj);
  if (!nodeId) {
    console.log(`[${subj}] 최신판례 노드 없음 — 건너뜀`);
    continue;
  }
  const { data: cases, error } = await sb
    .from("cases")
    .select("case_id, case_number, decided_at, primary_node_id")
    .contains("subject_laws", [subj])
    .is("deleted_at", null)
    .gte("decided_at", yStart)
    .lt("decided_at", yEnd);
  if (error) throw error;

  const toMove = (cases ?? []).filter((c) => c.primary_node_id !== nodeId);
  totalMatched += toMove.length;
  console.log(
    `[${subj}] ${year}년 선고 ${cases?.length ?? 0}건 중 이동 대상 ${toMove.length}건 → node ${nodeId}`,
  );
  for (const c of toMove) {
    console.log(`   ${c.case_number} (${c.decided_at}) prev=${c.primary_node_id ?? "∅"}`);
    backup.push({
      case_id: c.case_id,
      case_number: c.case_number,
      prev_primary_node_id: c.primary_node_id,
      new_primary_node_id: nodeId,
    });
  }

  if (apply && toMove.length > 0) {
    for (const c of toMove) {
      const { error: uErr } = await sb
        .from("cases")
        .update({ primary_node_id: nodeId })
        .eq("case_id", c.case_id);
      if (uErr) throw uErr;
    }
    console.log(`   ✔ ${toMove.length}건 적용`);
  }
}

if (apply) {
  const path = `scripts/jagwa/.factbox/latest-cases-backup-${year}.json`;
  writeFileSync(path, JSON.stringify(backup, null, 2));
  console.log(`\n적용 완료. 백업 → ${path} (롤백: prev_primary_node_id 로 되돌리기)`);
} else {
  console.log(`\n[dry-run] 총 ${totalMatched}건 이동 예정. 적용하려면 --apply`);
}
