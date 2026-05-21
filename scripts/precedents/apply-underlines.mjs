// precedents_with_underline.json 의 본문(<u> 마커 포함)을 cases 테이블로 patch.
//
// 정책:
//   - case_number 기준 매칭. JSON 안에 같은 case_number 가 여러 번 등장하면 첫 번째만 사용.
//   - DB 에도 같은 case_number 가 여러 row 있으면 모두 동일 본문으로 갱신.
//   - 갱신 컬럼: summary_title / summary_body_md / reasoning_md / comment_body_md / summary_items
//     · 그 외(importance, nickname, exam_*, case_type, court 등)는 건드리지 않는다.
//   - JSON 에만 있고 DB 미존재인 case 는 insert 하지 않는다 (별도 검토 후 작업).
//   - --dry-run (기본): 변경될 row 수만 보고. --apply 가 있을 때만 실제 UPDATE.
//
// 사용:
//   node scripts/precedents/apply-underlines.mjs           # dry-run
//   node scripts/precedents/apply-underlines.mjs --apply   # 실행

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv();

const APPLY = process.argv.includes("--apply");
const srcPath = resolve(
  process.argv.find((a) => a.endsWith(".json")) ??
    "source/_converted/precedents_with_underline.json",
);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stripU = (s) => (s == null ? "" : String(s).replace(/<\/?u>/g, ""));

function summaryFromJson(p) {
  const first = p.summaryItems?.[0] ?? null;
  return {
    summary_title: first?.title?.slice(0, 500) ?? null,
    summary_body_md: first?.body ?? null,
    reasoning_md: p.reasoningMd ?? null,
    comment_body_md: p.noteMd ?? null,
    summary_items: p.summaryItems ?? [],
  };
}

function rowSnapshotEqual(a, b) {
  const keys = [
    "summary_title",
    "summary_body_md",
    "reasoning_md",
    "comment_body_md",
  ];
  for (const k of keys) {
    if ((a[k] ?? null) !== (b[k] ?? null)) return false;
  }
  // summary_items 는 JSON.stringify 로 비교 (구조 동일 시 같은 문자열).
  return JSON.stringify(a.summary_items ?? []) === JSON.stringify(b.summary_items ?? []);
}

async function main() {
  const data = JSON.parse(readFileSync(srcPath, "utf-8"));
  console.log(`source: ${srcPath} (${data.length} entries)`);
  console.log(`mode  : ${APPLY ? "APPLY" : "DRY-RUN"}`);

  const { data: dbRows, error } = await supabase
    .from("cases")
    .select(
      "case_id, case_number, summary_title, summary_body_md, reasoning_md, comment_body_md, summary_items",
    )
    .contains("subject_laws", ["patent"]);
  if (error) {
    console.error("cases 조회 실패:", error.message);
    process.exit(1);
  }
  console.log(`DB patent cases: ${dbRows.length}`);

  const jsonFirst = new Map();
  for (const p of data) {
    if (!jsonFirst.has(p.caseNumber)) jsonFirst.set(p.caseNumber, p);
  }

  let updateRows = 0;
  let unchangedRows = 0;
  let missingInJson = 0;
  let addedUlChars = 0;

  // 갱신 묶음 — case_id 별 patch
  const patches = [];

  for (const r of dbRows) {
    const p = jsonFirst.get(r.case_number);
    if (!p) {
      missingInJson++;
      continue;
    }
    const next = summaryFromJson(p);
    if (rowSnapshotEqual(r, next)) {
      unchangedRows++;
      continue;
    }
    updateRows++;
    addedUlChars +=
      (next.summary_body_md ?? "").length -
      stripU(next.summary_body_md ?? "").length +
      (next.reasoning_md ?? "").length -
      stripU(next.reasoning_md ?? "").length +
      (next.comment_body_md ?? "").length -
      stripU(next.comment_body_md ?? "").length;
    patches.push({ case_id: r.case_id, ...next });
  }

  console.log(`\n=== 갱신 대상 ===`);
  console.log(`rows to update    : ${updateRows}`);
  console.log(`rows unchanged    : ${unchangedRows}`);
  console.log(`rows missing JSON : ${missingInJson} (변경 없음, 그대로 둠)`);
  console.log(
    `<u> chars added   : ${addedUlChars} (마커 문자 수 — 실제 표시 영역의 양쪽 <u></u>)`,
  );

  if (!APPLY) {
    console.log("\n(dry-run — 실제 변경 안 함. --apply 로 실행)");
    return;
  }

  console.log("\nUPDATE 시작…");
  let ok = 0;
  let fail = 0;
  // 한 row 씩 update — supabase-js 의 update().eq() 단건. 404건이라 부담 없음.
  for (const p of patches) {
    const { case_id, ...patch } = p;
    const { error: e } = await supabase
      .from("cases")
      .update(patch)
      .eq("case_id", case_id);
    if (e) {
      fail++;
      console.error(`  ${case_id} 실패: ${e.message}`);
    } else {
      ok++;
    }
  }
  console.log(`\n=== 완료 ===  ok=${ok}, fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
