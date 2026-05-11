// 추출된 precedents.json → cases 테이블 시드 (특허법 only).
// service_role 키로 RLS 우회. 같은 case_number+subject_laws 가 이미 있으면 skip.
// upsert 가 아닌 skip 정책 — 손으로 보정한 데이터를 시드가 덮어쓰지 않도록.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const COURT_MAP = {
  대법원: "supreme",
  특허법원: "patent_court",
  서울고등법원: "high_court",
  광주고등법원: "high_court",
  부산고등법원: "high_court",
  대구고등법원: "high_court",
  대전고등법원: "high_court",
  서울중앙지방법원: "district_court",
  서울행정법원: "district_court",
};

function buildCaseTitle(p) {
  // case_title 은 색인·검색에서 한 줄 요약 라벨로 쓰임.
  // 우선순위: 첫 요지의 제목 → 사건유형 → 사건번호.
  const t = p.summaryItems?.[0]?.title?.trim();
  if (t) return t;
  if (p.caseType) return p.caseType;
  return p.caseNumber;
}

async function main() {
  const srcPath = resolve(
    process.argv[2] ?? "source/_converted/precedents.json",
  );
  const data = JSON.parse(readFileSync(srcPath, "utf-8"));
  console.log(`source: ${srcPath} (${data.length} entries)`);

  // 기존 특허법 case_number 미리 fetch — skip 판정.
  const { data: existingRows, error: exErr } = await supabase
    .from("cases")
    .select("case_number")
    .contains("subject_laws", ["patent"]);
  if (exErr) {
    console.error("기존 case 조회 실패:", exErr.message);
    process.exit(1);
  }
  const existing = new Set((existingRows ?? []).map((r) => r.case_number));
  console.log(`기존 특허법 cases: ${existing.size} 건`);

  let inserted = 0;
  let skipped = 0;
  let courtUnknown = 0;
  const rows = [];

  for (const p of data) {
    if (existing.has(p.caseNumber)) {
      skipped++;
      continue;
    }
    const court = COURT_MAP[p.court];
    if (!court) {
      courtUnknown++;
      console.warn(`알 수 없는 법원: ${p.court} (case ${p.caseNumber})`);
      continue;
    }

    const summary = p.summaryItems?.[0] ?? null;
    rows.push({
      subject_laws: ["patent"],
      court,
      decided_at: p.decisionDate,
      case_number: p.caseNumber,
      case_title: buildCaseTitle(p),
      case_type: p.caseType ?? null,
      is_en_banc: false,
      importance: 1,
      summary_title: summary?.title?.slice(0, 500) ?? null,
      summary_body_md: summary?.body ?? null,
      reasoning_md: p.reasoningMd ?? null,
      comment_body_md: p.noteMd ?? null,
      comment_source: p.noteMd ? "리담특허법 판례 [제9판]" : null,
      summary_items: p.summaryItems ?? [],
      exam_1st_years: p.exam1stYears ?? [],
      exam_2nd_years: p.exam2ndYears ?? [],
    });
  }

  console.log(
    `insert candidates: ${rows.length} (skip=${skipped}, court_unknown=${courtUnknown})`,
  );

  // batch insert (100건씩).
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("cases").insert(slice);
    if (error) {
      console.error(`batch ${i}~${i + slice.length} insert 실패:`, error.message);
      // 어떤 row 가 깨졌는지 식별 — 한 건씩 재시도.
      for (const row of slice) {
        const { error: e } = await supabase.from("cases").insert(row);
        if (e) {
          console.error(
            `  row ${row.case_number} 실패: ${e.message}`,
          );
        } else {
          inserted++;
        }
      }
    } else {
      inserted += slice.length;
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`inserted: ${inserted}`);
  console.log(`skipped (already in DB): ${skipped}`);
  console.log(`court_unknown: ${courtUnknown}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
