// 자동 매핑: problems 의 body_md + explanation_md 에서 사건번호 패턴 추출 → cases 와 매칭.
// 특허법 problems → 특허법 cases 만. relation_type='cited'.

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { parseLawArg } from "./lib-args.mjs";

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

// 한국 사건번호: "{2자리 또는 4자리}{한글 1~2자}{1~5자리 수}".
// 예: 2017후523, 98후744, 2001허3453, 2025허11487.
// 보수적으로 2~4 자리 연도 + 1~2 한글 + 1~5 숫자.
const RE_CASE_NO = /(?<![\dㄱ-ㅎ가-힣])(\d{2,4})\s*([가-힣]{1,2})\s*(\d{1,5})(?!\d)/g;

function extractCaseNumbers(text) {
  const out = new Set();
  if (!text) return out;
  for (const m of text.matchAll(RE_CASE_NO)) {
    const year = m[1];
    const kind = m[2];
    const seq = m[3];
    // 한글이 "후"/"허"/"마"/"카"/"카허"/"감"/"두" 등 사건번호에 등장하는 글자. "조","항","호" 같은 조문 단위는 사건번호 아님.
    // 조문 단위 단어를 화이트리스트로 거른다.
    if (["조", "항", "호", "목", "편", "장", "절", "관"].includes(kind))
      continue;
    out.add(`${year}${kind}${seq}`);
  }
  return out;
}

async function runForLaw(lawCode) {
  console.log(`\n=== ${lawCode} ===`);
  // 0) law_id.
  const { data: lawRow } = await supabase
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!lawRow) {
    console.log(`  law row 없음 — skip`);
    return;
  }
  // 1) 해당 과목 cases case_number → case_id map.
  const { data: caseRows } = await supabase
    .from("cases")
    .select("case_id, case_number")
    .contains("subject_laws", [lawCode])
    .is("deleted_at", null);
  const caseByNumber = new Map();
  for (const r of caseRows ?? []) caseByNumber.set(r.case_number, r.case_id);
  console.log(`  cases: ${caseByNumber.size}`);
  if (caseByNumber.size === 0) return;
  const problems = [];
  const PAGE = 500;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("problems")
      .select("problem_id, body_md, explanation_md")
      .eq("law_id", lawRow.law_id)
      .is("deleted_at", null)
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("problems fetch 실패:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    problems.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`  problems: ${problems.length}`);
  if (problems.length === 0) return;

  // 3) 기존 link (problem_id, case_id) 셋.
  const existing = new Set();
  {
    let f = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("problem_case_links")
        .select("problem_id, case_id, relation_type")
        .eq("relation_type", "cited")
        .range(f, f + PAGE - 1);
      if (error) {
        console.error("existing 조회 실패:", error.message);
        break;
      }
      if (!data || data.length === 0) break;
      for (const r of data) existing.add(`${r.problem_id}:${r.case_id}`);
      if (data.length < PAGE) break;
      f += PAGE;
    }
  }
  console.log(`existing cited links: ${existing.size}`);

  // 4) 매칭 + insert candidates.
  const inserts = [];
  let problemsMatched = 0;
  for (const p of problems) {
    const text = [p.body_md ?? "", p.explanation_md ?? ""].join("\n");
    const refs = extractCaseNumbers(text);
    if (refs.size === 0) continue;
    let m = 0;
    for (const num of refs) {
      const cid = caseByNumber.get(num);
      if (!cid) continue;
      const key = `${p.problem_id}:${cid}`;
      if (existing.has(key)) continue;
      inserts.push({
        problem_id: p.problem_id,
        case_id: cid,
        relation_type: "cited",
        note: "자동 추출 — 본문/해설 사건번호 인용",
      });
      existing.add(key);
      m++;
    }
    if (m > 0) problemsMatched++;
  }
  console.log(
    `prepared inserts: ${inserts.length} (problems matched: ${problemsMatched})`,
  );

  // 5) batch insert.
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const slice = inserts.slice(i, i + BATCH);
    const { error } = await supabase
      .from("problem_case_links")
      .insert(slice);
    if (error) {
      console.error(`batch ${i}~${i + slice.length} 실패: ${error.message}`);
      for (const row of slice) {
        const { error: e } = await supabase
          .from("problem_case_links")
          .insert(row);
        if (!e) inserted++;
      }
    } else {
      inserted += slice.length;
    }
  }
  console.log(`  inserted: ${inserted}`);
}

async function main() {
  const laws = parseLawArg(process.argv);
  console.log(`targets: ${laws.join(", ")}`);
  for (const code of laws) await runForLaw(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
