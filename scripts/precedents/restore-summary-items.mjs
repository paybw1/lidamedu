// 1회성 복원 스크립트.
// 판례 편집 폼의 다항목 요지 collapse 버그(저장 시 summary_items 가 1개로
// 합쳐짐) 로 뒷 요지 항목이 삭제된 cases 를, precedents.json 의 누락 tail
// 항목으로 복원한다.
//
// DB 항목 수 < precedents.json 항목 수인 case 만 대상.
// DB 의 기존 항목(운영자가 편집했을 수 있음)은 보존하고, 빠진 뒷 항목만 append.
//
//   확인(미반영): node scripts/precedents/restore-summary-items.mjs
//   실제 반영    : node scripts/precedents/restore-summary-items.mjs --apply

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv();
const APPLY = process.argv.includes("--apply");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const data = JSON.parse(
  readFileSync(resolve("source/_converted/precedents.json"), "utf-8"),
);
const byNum = new Map();
for (const p of data) if (!byNum.has(p.caseNumber)) byNum.set(p.caseNumber, p);

async function main() {
  console.log(
    APPLY
      ? "=== APPLY — 요지 항목 복원 반영 ===\n"
      : "=== DRY-RUN — 미반영 (반영하려면 --apply) ===\n",
  );

  const { data: rows, error } = await supabase
    .from("cases")
    .select("case_id, case_number, summary_items")
    .contains("subject_laws", ["patent"])
    .is("deleted_at", null);
  if (error) {
    console.error("cases 조회 실패:", error.message);
    process.exit(1);
  }

  let target = 0;
  let restored = 0;
  let failed = 0;

  for (const row of rows) {
    const p = byNum.get(row.case_number);
    if (!p) continue;
    const dbItems = Array.isArray(row.summary_items) ? row.summary_items : [];
    const fullItems = Array.isArray(p.summaryItems) ? p.summaryItems : [];
    // 항목 손실(collapse 버그) — DB 가 원본보다 적을 때만 대상.
    if (dbItems.length >= fullItems.length) continue;

    target++;
    // DB 기존 항목 보존 + precedents.json 의 뒷 항목 append.
    const merged = [...dbItems, ...fullItems.slice(dbItems.length)];
    console.log(
      `  ${row.case_number}: 요지 ${dbItems.length} → ${merged.length}개 ` +
        `(뒤 ${merged.length - dbItems.length}개 복원)`,
    );

    if (APPLY) {
      const { error: upErr } = await supabase
        .from("cases")
        .update({
          summary_items: merged,
          summary_title: merged[0]?.title ?? null,
          summary_body_md: merged[0]?.body ?? null,
        })
        .eq("case_id", row.case_id);
      if (upErr) {
        console.error(`    └ 복원 실패: ${upErr.message}`);
        failed++;
      } else {
        restored++;
      }
    }
  }

  console.log(`\n=== ${APPLY ? "완료" : "DRY-RUN 요약"} ===`);
  console.log(
    `복원 대상 ${target}건` +
      (APPLY ? ` · 복원 ${restored}건 · 실패 ${failed}` : ""),
  );
  if (!APPLY && target > 0) {
    console.log(
      "\n실제 반영: node scripts/precedents/restore-summary-items.mjs --apply",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
