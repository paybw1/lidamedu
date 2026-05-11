// 객관식 지문(problem_choices) 의 (related_article_id, related_case_number) 매핑 활용.
//
// 신호:
//  (a) related_case_number 가 있는 지문 → cases.case_number 매칭 → case_id 결정.
//  (b) 동일 지문에 related_article_id 가 있으면 (article_id, case_id) 페어 → article_case_links 시드.
//  (c) related_article_id 가 없어도 부모 problem.primary_article_id 가 있으면 그것으로 페어 fallback.
//  (d) 모든 매칭에 problem_case_links (problem_id, case_id) 도 적재.
//
// 정규화:
//  - related_case_number 의 공백/특수기호 제거: "2017 후 523" → "2017후523".

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { parseLawArg } from "./lib-args.mjs";

loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeCaseNumber(raw) {
  if (typeof raw !== "string") return null;
  // "대법원 2014.3.20. 선고 2012후4162" 형태에서 사건번호 부분만 추출.
  // 연도 4자리 (또는 책 표기 2자리도 허용) + 한글 1~2자 + 일련번호 1~5자리.
  // 단어 경계 — 앞에는 공백/시작/연도가 아닌 char, 뒤에는 공백/끝.
  const m = raw.match(
    /(?:^|[^\d])(\d{2,4})\s*([가-힣]{1,2})\s*(\d{1,5})(?!\d)/,
  );
  if (!m) return null;
  // 사건번호의 한글 종류 화이트리스트 — 조문 단위 어휘 제외.
  if (["조", "항", "호", "목"].includes(m[2])) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

async function runForLaw(lawCode) {
  console.log(`\n=== ${lawCode} ===`);
  // 0) law_id.
  const { data: law } = await supabase
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) {
    console.log(`  law row 없음 — skip`);
    return;
  }
  // 1) 해당 과목 cases (case_number → case_id).
  const { data: caseRows } = await supabase
    .from("cases")
    .select("case_id, case_number")
    .contains("subject_laws", [lawCode])
    .is("deleted_at", null);
  const caseByNumber = new Map();
  for (const r of caseRows ?? []) caseByNumber.set(r.case_number, r.case_id);
  console.log(`  cases: ${caseByNumber.size}`);
  if (caseByNumber.size === 0) return;

  // 2) 매핑 후보 — 해당 law 의 problem 의 choice 중 related_case_number 있는 것.
  const choices = [];
  const PAGE = 500;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("problem_choices")
      .select(
        "choice_id, problem_id, related_article_id, related_case_number, problems!inner(law_id, primary_article_id, deleted_at)",
      )
      .eq("problems.law_id", law.law_id)
      .not("related_case_number", "is", null)
      .neq("related_case_number", "")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("choices fetch 실패:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.problems?.deleted_at) continue;
      choices.push({
        choiceId: r.choice_id,
        problemId: r.problem_id,
        relatedArticleId: r.related_article_id,
        problemPrimaryArticleId: r.problems?.primary_article_id ?? null,
        relatedCaseNumber: r.related_case_number,
      });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`choices with case_number: ${choices.length}`);

  // 3) 기존 article_case_links / problem_case_links 셋.
  const existingAcl = new Set();
  {
    let f = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("article_case_links")
        .select("article_id, case_id, relation_type")
        .eq("relation_type", "directly_interprets")
        .range(f, f + 1000 - 1);
      if (error) { console.error("acl 조회:", error.message); break; }
      if (!data || data.length === 0) break;
      for (const r of data) existingAcl.add(`${r.case_id}:${r.article_id}`);
      if (data.length < 1000) break;
      f += 1000;
    }
  }
  console.log(`existing article_case_links: ${existingAcl.size}`);

  const existingPcl = new Set();
  {
    let f = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("problem_case_links")
        .select("problem_id, case_id, relation_type")
        .eq("relation_type", "cited")
        .range(f, f + 1000 - 1);
      if (error) { console.error("pcl 조회:", error.message); break; }
      if (!data || data.length === 0) break;
      for (const r of data) existingPcl.add(`${r.problem_id}:${r.case_id}`);
      if (data.length < 1000) break;
      f += 1000;
    }
  }
  console.log(`existing problem_case_links: ${existingPcl.size}`);

  // 4) 매칭 결과 누적.
  const aclInserts = [];
  const pclInserts = [];
  let caseMatchedChoices = 0;
  let articleMatchedChoices = 0;
  for (const c of choices) {
    const norm = normalizeCaseNumber(c.relatedCaseNumber);
    if (!norm) continue;
    const caseId = caseByNumber.get(norm);
    if (!caseId) continue; // cases 테이블에 없는 사건번호 — skip.
    caseMatchedChoices++;

    // (a) ACL — 우선 related_article_id, fallback primary_article_id.
    const aid = c.relatedArticleId ?? c.problemPrimaryArticleId;
    if (aid) {
      articleMatchedChoices++;
      const key = `${caseId}:${aid}`;
      if (!existingAcl.has(key)) {
        aclInserts.push({
          article_id: aid,
          case_id: caseId,
          relation_type: "directly_interprets",
          note: c.relatedArticleId
            ? "객관식 지문 매핑(지문↔조문)"
            : "객관식 문제 매핑(문제↔조문)",
        });
        existingAcl.add(key);
      }
    }

    // (b) PCL — problem ↔ case 직접.
    const pkey = `${c.problemId}:${caseId}`;
    if (!existingPcl.has(pkey)) {
      pclInserts.push({
        problem_id: c.problemId,
        case_id: caseId,
        relation_type: "cited",
        note: "객관식 지문 매핑",
      });
      existingPcl.add(pkey);
    }
  }
  console.log(
    `case matched: ${caseMatchedChoices} / article matched: ${articleMatchedChoices}`,
  );
  console.log(
    `prepared inserts — article_case_links: ${aclInserts.length}, problem_case_links: ${pclInserts.length}`,
  );

  // 5) batch insert.
  async function batchInsert(table, rows) {
    let inserted = 0;
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { error } = await supabase.from(table).insert(slice);
      if (error) {
        console.error(`[${table}] batch 실패: ${error.message}`);
        for (const row of slice) {
          const { error: e } = await supabase.from(table).insert(row);
          if (!e) inserted++;
        }
      } else {
        inserted += slice.length;
      }
    }
    return inserted;
  }

  const ai = await batchInsert("article_case_links", aclInserts);
  const pi = await batchInsert("problem_case_links", pclInserts);
  console.log(`  inserted — article_case_links: +${ai}, problem_case_links: +${pi}`);
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
