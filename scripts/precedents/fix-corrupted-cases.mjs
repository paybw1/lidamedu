// 1회성 정정 스크립트.
// 파서 버그(전원합의체 등 헤더 누락)로 누락 판례의 본문이 인접 판례에 잘못
// 흡수됐던 것을, 파서 수정 후 재생성한 precedents.json 의 올바른 본문으로 되돌린다.
//
// 활성 특허법 cases 전수를 precedents.json 과 대조해 본문이 다른 행을 자동
// 검출한다. 판례 편집 UI 는 그동안 진입점이 없어 운영자 수동 보정이 불가능했으므로
// (본문 필드는 admin-case-edit 외엔 편집 경로 없음) 본문 불일치 = 파서 버그 흔적.
//
//   확인(미반영): node scripts/precedents/fix-corrupted-cases.mjs
//   실제 반영    : node scripts/precedents/fix-corrupted-cases.mjs --apply
//
// 갱신 필드: summary_title · summary_body_md · summary_items · reasoning_md ·
//            comment_body_md · comment_source.  (본문만)
// exam_1st_years / exam_2nd_years 는 건드리지 않는다 — exam_1st_years 는
// feat-8-024 에서 의도적으로 비웠고(1차 기출은 problem_case_links 로 산출),
// exam_2nd_years 도 그대로 둔다.
// court·decided_at·case_number·case_type·is_en_banc·importance·case_title 도
// 건드리지 않는다(헤더는 정상 파싱됐고 일부는 운영자 조정값).

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

// 본문 비교용 정규화 — summaryItems 는 [title,body] 쌍 배열로 (jsonb 키순서 무시).
const canonItems = (items) =>
  JSON.stringify((items ?? []).map((s) => [s?.title ?? "", s?.body ?? ""]));
const str = (s) => s ?? "";
const len = (s) => (s ?? "").length;

// seed-to-db.mjs 의 매핑과 동일 — 본문 6개 필드만.
function correctedBody(p) {
  const summary = p.summaryItems?.[0] ?? null;
  return {
    summary_title: summary?.title?.slice(0, 500) ?? null,
    summary_body_md: summary?.body ?? null,
    summary_items: p.summaryItems ?? [],
    reasoning_md: p.reasoningMd ?? null,
    comment_body_md: p.noteMd ?? null,
    comment_source: p.noteMd ? "리담특허법 판례 [제9판]" : null,
  };
}

async function main() {
  console.log(
    APPLY
      ? "=== APPLY — cases 본문 정정 반영 ===\n"
      : "=== DRY-RUN — 미반영 (반영하려면 --apply) ===\n",
  );

  const { data: rows, error } = await supabase
    .from("cases")
    .select(
      "case_id, case_number, summary_items, summary_body_md, reasoning_md, comment_body_md",
    )
    .contains("subject_laws", ["patent"])
    .is("deleted_at", null);
  if (error) {
    console.error("cases 조회 실패:", error.message);
    process.exit(1);
  }
  console.log(`활성 특허법 cases: ${rows.length}건`);

  let mismatched = 0;
  let updated = 0;
  let failed = 0;
  let noJson = 0;

  for (const row of rows) {
    const p = byNum.get(row.case_number);
    if (!p) {
      noJson++;
      continue;
    }
    const c = correctedBody(p);
    const diffItems =
      canonItems(row.summary_items) !== canonItems(c.summary_items);
    const diffReason = str(row.reasoning_md) !== str(c.reasoning_md);
    const diffComment = str(row.comment_body_md) !== str(c.comment_body_md);
    if (!diffItems && !diffReason && !diffComment) continue;

    mismatched++;
    const tags = [
      diffItems
        ? `요지 ${len(row.summary_body_md)}→${len(c.summary_body_md)}자`
        : null,
      diffReason
        ? `이유 ${len(row.reasoning_md)}→${len(c.reasoning_md)}자`
        : null,
      diffComment
        ? `비고 ${len(row.comment_body_md)}→${len(c.comment_body_md)}자`
        : null,
    ].filter(Boolean);
    console.log(`  ${row.case_number}: ${tags.join(", ")}`);

    if (APPLY) {
      const { error: upErr } = await supabase
        .from("cases")
        .update(c)
        .eq("case_id", row.case_id);
      if (upErr) {
        console.error(`    └ 갱신 실패: ${upErr.message}`);
        failed++;
      } else {
        updated++;
      }
    }
  }

  console.log(`\n=== ${APPLY ? "완료" : "DRY-RUN 요약"} ===`);
  console.log(
    `본문 불일치 ${mismatched}건` +
      (APPLY ? ` · 갱신 ${updated}건 · 실패 ${failed}` : "") +
      (noJson ? ` · precedents.json 에 없음 ${noJson}건` : ""),
  );
  if (!APPLY && mismatched > 0) {
    console.log(
      "\n실제 반영: node scripts/precedents/fix-corrupted-cases.mjs --apply",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
