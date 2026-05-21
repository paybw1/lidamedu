// precedents_with_underline.json 의 본문(<u> strip) ↔ DB cases 본문 매칭 점검.
// case_number 기준으로 join, summary_items / reasoning_md / comment_body_md 각각 비교.
//
// 출력:
//   - DB 에 있는 case 수, JSON 에 있는 case 수, 매칭 case 수, 누락(한쪽만 있음) 수
//   - 본문 동일 / 다름 통계 (각 필드별)
//   - 다른 case 의 sample (앞 5건) — 본문 시작 200자 비교
//
// 어디까지 안전한가:
//   - 글자 시퀀스가 100% 동일하면 그대로 underline 마커만 추가하는 patch 안전
//   - 일부 case 가 다르면(공백/구두점/엔티티 차이) 별도 매핑 규칙 또는 추가 정규화 필요
//
// 사용: node scripts/precedents/diff-underline-vs-db.mjs

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

const stripU = (s) => (s == null ? null : String(s).replace(/<\/?u>/g, ""));
// 공백·줄바꿈 변동을 무시한 비교용 normalizer (visual whitespace 차이만 무시).
const normForCompare = (s) =>
  s == null ? "" : String(s).replace(/\s+/g, " ").trim();

async function main() {
  const srcPath = resolve(
    process.argv[2] ?? "source/_converted/precedents_with_underline.json",
  );
  const data = JSON.parse(readFileSync(srcPath, "utf-8"));
  console.log(`source: ${srcPath} (${data.length} entries)`);

  const { data: dbRows, error } = await supabase
    .from("cases")
    .select(
      "case_id, case_number, court, decided_at, summary_body_md, summary_items, reasoning_md, comment_body_md",
    )
    .contains("subject_laws", ["patent"]);
  if (error) {
    console.error("cases 조회 실패:", error.message);
    process.exit(1);
  }
  console.log(`DB patent cases: ${dbRows.length}`);

  // case_number 기준 (DB 에는 중복 case_number 도 가능)
  const dbByNum = new Map();
  for (const r of dbRows) {
    const arr = dbByNum.get(r.case_number) ?? [];
    arr.push(r);
    dbByNum.set(r.case_number, arr);
  }
  const jsonByNum = new Map();
  for (const p of data) {
    const arr = jsonByNum.get(p.caseNumber) ?? [];
    arr.push(p);
    jsonByNum.set(p.caseNumber, arr);
  }

  let matched = 0;
  let onlyInDb = 0;
  let onlyInJson = 0;
  let dupInDb = 0;
  let dupInJson = 0;
  let bodySameStrict = 0; // <u> strip 한 raw 와 DB 글자 그대로 일치
  let bodySameLoose = 0; // 공백 정규화 후 일치
  let bodyDiffer = 0;
  let bodyEmpty = 0;
  const diffSamples = [];

  for (const [num, jsonArr] of jsonByNum) {
    const dbArr = dbByNum.get(num);
    if (!dbArr) {
      onlyInJson++;
      continue;
    }
    if (jsonArr.length > 1) dupInJson++;
    if (dbArr.length > 1) dupInDb++;
    matched++;
    // 본문 비교: summary_items 합본 + reasoning + comment
    const j = jsonArr[0];
    const d = dbArr[0];
    const jBody = (() => {
      const parts = [];
      for (const it of j.summaryItems ?? []) {
        parts.push(`${it.title ?? ""}: ${it.body ?? ""}`);
      }
      if (j.reasoningMd) parts.push(j.reasoningMd);
      if (j.noteMd) parts.push(j.noteMd);
      return stripU(parts.join("\n"));
    })();
    const dBody = (() => {
      const parts = [];
      for (const it of d.summary_items ?? []) {
        parts.push(`${it.title ?? ""}: ${it.body ?? ""}`);
      }
      if (d.reasoning_md) parts.push(d.reasoning_md);
      if (d.comment_body_md) parts.push(d.comment_body_md);
      return parts.join("\n");
    })();
    if (!jBody.trim() && !dBody.trim()) {
      bodyEmpty++;
      continue;
    }
    if (jBody === dBody) {
      bodySameStrict++;
      continue;
    }
    if (normForCompare(jBody) === normForCompare(dBody)) {
      bodySameLoose++;
      continue;
    }
    bodyDiffer++;
    if (diffSamples.length < 5) {
      diffSamples.push({
        num,
        court: d.court,
        decided_at: d.decided_at,
        jLen: jBody.length,
        dLen: dBody.length,
        jHead: jBody.slice(0, 220),
        dHead: dBody.slice(0, 220),
      });
    }
  }
  for (const num of dbByNum.keys()) {
    if (!jsonByNum.has(num)) onlyInDb++;
  }

  console.log("\n=== 매칭 통계 ===");
  console.log(`matched (case_number 동일):   ${matched}`);
  console.log(`only in JSON (DB 미존재):     ${onlyInJson}`);
  console.log(`only in DB (JSON 미존재):     ${onlyInDb}`);
  console.log(`dup case_number in JSON:      ${dupInJson}`);
  console.log(`dup case_number in DB:        ${dupInDb}`);
  console.log("\n--- 본문 비교 (matched 안에서) ---");
  console.log(`strict same (글자 완전 일치): ${bodySameStrict}`);
  console.log(`loose same (공백 정규화 후):  ${bodySameLoose}`);
  console.log(`differ (실제 다름):           ${bodyDiffer}`);
  console.log(`both empty:                   ${bodyEmpty}`);

  if (diffSamples.length) {
    console.log("\n=== differ samples (first 5) ===");
    for (const s of diffSamples) {
      console.log(
        `\n${s.num} (${s.court} ${s.decided_at}) jLen=${s.jLen} dLen=${s.dLen}`,
      );
      console.log("  JSON:", JSON.stringify(s.jHead));
      console.log("  DB  :", JSON.stringify(s.dHead));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
