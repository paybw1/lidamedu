// tm-design-merged.json → DB seed (trademark + design problems).
//
// 1. source_doc 2건 (상표+디자인 문제편 + 해설편) upsert
// 2. trademark / design 각각 law_id 로딩
// 3. 기존 source_doc 으로 시드된 problems soft-delete (재실행 안전)
// 4. problems + problem_choices insert
//
// 호환: parse-tm-design-problems / parse-tm-design-answers 출력 형식
//  - lawCode, year, round, origin, problemNumber, stem, choices[{index,body}],
//    scope, correctIndex, explanation, choiceExplanations
//
// 주의: SUPABASE_SERVICE_ROLE_KEY 필요.
//
//   node scripts/seed-tm-design-problems.mjs [--dry-run]

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const JSON_PATH = resolve(ROOT, "source/_converted/tm-design-merged.json");
const dryRun = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const { problems } = JSON.parse(readFileSync(JSON_PATH, "utf8"));
console.log(`로드: ${problems.length} problems (dry=${dryRun})`);

// law_id 매핑 (trademark, design)
const { data: laws } = await supa
  .from("laws")
  .select("law_id, law_code")
  .in("law_code", ["trademark", "design"]);
const lawIdByCode = new Map((laws ?? []).map((l) => [l.law_code, l.law_id]));
if (!lawIdByCode.has("trademark") || !lawIdByCode.has("design")) {
  console.error("trademark / design law 누락", [...lawIdByCode.keys()]);
  process.exit(1);
}

// source_doc upsert (같은 hwpx 가 두 law 의 문제를 공통 수록).
const EDITION = "제3판";
const PROBLEM_FILE = "[내지] 리담 상표+디자인 기출문제편 [제3판].hwpx";
const ANSWER_FILE = "[내지] 리담 상표+디자인 기출해설편 [제3판].hwpx";

async function upsertSourceDoc(label, fileName, kind, paired) {
  const { data, error } = await supa
    .from("problem_source_docs")
    .insert({
      label,
      file_name: fileName,
      kind,
      edition: EDITION,
      paired_with_doc_id: paired,
    })
    .select("source_doc_id")
    .single();
  if (error) throw error;
  return data.source_doc_id;
}

const { data: existing } = await supa
  .from("problem_source_docs")
  .select("source_doc_id, kind, file_name")
  .eq("edition", EDITION)
  .in("file_name", [PROBLEM_FILE, ANSWER_FILE]);

let problemDocId = (existing ?? []).find(
  (r) => r.file_name === PROBLEM_FILE && r.kind === "problem",
)?.source_doc_id;
let answerDocId = (existing ?? []).find(
  (r) => r.file_name === ANSWER_FILE && r.kind === "answer",
)?.source_doc_id;

if (!problemDocId) {
  if (dryRun) console.log("(dry-run) source_doc problem 생성 예정");
  else
    problemDocId = await upsertSourceDoc(
      "리담 상표+디자인 기출문제 제3판 — 문제편",
      PROBLEM_FILE,
      "problem",
      null,
    );
}
if (!answerDocId) {
  if (dryRun) console.log("(dry-run) source_doc answer 생성 예정");
  else {
    answerDocId = await upsertSourceDoc(
      "리담 상표+디자인 기출문제 제3판 — 해설편",
      ANSWER_FILE,
      "answer",
      problemDocId ?? null,
    );
    if (problemDocId) {
      await supa
        .from("problem_source_docs")
        .update({ paired_with_doc_id: answerDocId })
        .eq("source_doc_id", problemDocId);
    }
  }
}
console.log(`  problem_doc=${problemDocId} answer_doc=${answerDocId}`);

// 기존 같은 source_doc 으로 시드된 problems soft-delete.
if (!dryRun && problemDocId) {
  const { error: delErr } = await supa
    .from("problems")
    .update({ deleted_at: new Date().toISOString() })
    .eq("source_doc_id", problemDocId);
  if (delErr) console.error("기존 soft-delete 실패:", delErr.message);
}

function inferFormat(stem) {
  if (/사례/.test(stem)) return "mc_case";
  if (/<\s*보기\s*>|<보기>|\[\s*보기\s*\]|모두\s*고른/.test(stem)) return "mc_box";
  return "mc_short";
}
function inferPolarity(stem) {
  if (/옳지\s*않은|틀린|아닌|아니한|않는/.test(stem)) return "negative";
  return "positive";
}

let inserted = 0;
let skipped = 0;
const skipReasons = { noChoices5: 0, noCorrect: 0, noLaw: 0 };

for (const p of problems) {
  if (!p.choices || p.choices.length !== 5) {
    skipped++;
    skipReasons.noChoices5++;
    continue;
  }
  if (p.correctIndex == null) {
    skipped++;
    skipReasons.noCorrect++;
    continue;
  }
  const lawId = lawIdByCode.get(p.lawCode);
  if (!lawId) {
    skipped++;
    skipReasons.noLaw++;
    continue;
  }

  if (dryRun) {
    inserted++;
    continue;
  }

  const { data: probRow, error } = await supa
    .from("problems")
    .insert({
      law_id: lawId,
      exam_round: "first",
      subject_type: "law",
      origin: "past_exam",
      format: inferFormat(p.stem),
      scope: "comprehensive",
      polarity: inferPolarity(p.stem),
      year: p.year,
      problem_number: p.problemNumber,
      primary_article_id: null,
      body_md: p.stem,
      explanation_md: p.explanation || null,
      source_doc_id: problemDocId,
    })
    .select("problem_id")
    .single();
  if (error) {
    console.error(
      `  insert 실패 [${p.lawCode} ${p.year} #${p.problemNumber}]:`,
      error.message,
    );
    continue;
  }
  const choiceRows = p.choices.map((c) => ({
    problem_id: probRow.problem_id,
    choice_index: c.index,
    body_md: c.body,
    is_correct: c.index === p.correctIndex,
    explanation_md: p.choiceExplanations?.[c.index] ?? null,
  }));
  const { error: cErr } = await supa.from("problem_choices").insert(choiceRows);
  if (cErr) {
    console.error(`  choices insert 실패:`, cErr.message);
    continue;
  }
  inserted++;
}

console.log(`\n=== 결과 ===`);
console.log(`  inserted=${inserted}  skipped=${skipped}`);
console.log(`  skipReasons:`, skipReasons);
