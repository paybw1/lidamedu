// problems-merged.json → DB seed.
// 1. problem_source_docs 2건 (문제책 + 답안책) upsert.
// 2. 기존 patent problems 모두 soft-delete (재실행 안전).
// 3. parsed problems 를 problems + problem_choices 로 insert.
// 4. articleHint 의 첫 article_number → primary_article_id 매핑.
//
// 주의: SUPABASE_SERVICE_ROLE_KEY 필요.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const JSON_PATH = resolve(ROOT, "source/_converted/problems-merged.json");

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
console.log(`로드: ${problems.length} problems`);

// patent law id
const { data: law, error: lErr } = await supa
  .from("laws")
  .select("law_id")
  .eq("law_code", "patent")
  .maybeSingle();
if (lErr || !law) {
  console.error("patent law 없음", lErr);
  process.exit(1);
}
const lawId = law.law_id;

// articles 조회 — article_number → article_id 매핑.
const { data: articleRows } = await supa
  .from("articles")
  .select("article_id, article_number")
  .eq("law_id", lawId)
  .is("deleted_at", null)
  .not("article_number", "is", null);
const articleByNumber = new Map(
  (articleRows ?? []).map((r) => [r.article_number, r.article_id]),
);
console.log(`articles map: ${articleByNumber.size}`);

// articleHint → 첫 article_number 추출.
//   "29①본문" → "29"
//   "29의2"   → "29의2"
//   "3-5, 7의2" → "3"
//   "29③-29⑦" → "29"
function articleNumberFromHint(hint) {
  if (!hint) return null;
  // 의N (가지조) 우선 매칭
  const m = hint.match(/(\d+)\s*의\s*(\d+)/);
  if (m) return `${m[1]}의${m[2]}`;
  const m2 = hint.match(/\d+/);
  return m2 ? m2[0] : null;
}

// source_doc upsert.
async function upsertSourceDoc(label, fileName, kind, edition, paired) {
  const { data, error } = await supa
    .from("problem_source_docs")
    .insert({
      label,
      file_name: fileName,
      kind,
      edition,
      paired_with_doc_id: paired,
    })
    .select("source_doc_id")
    .single();
  if (error) throw error;
  return data.source_doc_id;
}

console.log("source_docs 생성…");
// 기존 동일 label/edition 있으면 재사용.
const { data: existing } = await supa
  .from("problem_source_docs")
  .select("source_doc_id, label, kind")
  .eq("edition", "제20판");
const existingByKind = new Map(
  (existing ?? []).map((r) => [r.kind, r.source_doc_id]),
);
let problemDocId = existingByKind.get("problem");
let answerDocId = existingByKind.get("answer");
if (!problemDocId) {
  problemDocId = await upsertSourceDoc(
    "리담특허법 객관식(Ⅰ) 기출문제 제20판 — 문제편",
    "객관식 기출문제 [제20판].hwpx",
    "problem",
    "제20판",
    null,
  );
}
if (!answerDocId) {
  answerDocId = await upsertSourceDoc(
    "리담특허법 객관식(Ⅰ) 기출문제 제20판 — 해설편",
    "[완0305+내지+해설편] 객관식(Ⅰ) 기출문제 [제20판].hwpx",
    "answer",
    "제20판",
    problemDocId,
  );
  // pair both directions
  await supa
    .from("problem_source_docs")
    .update({ paired_with_doc_id: answerDocId })
    .eq("source_doc_id", problemDocId);
}
console.log(`  problem_doc=${problemDocId}`);
console.log(`  answer_doc=${answerDocId}`);

// 기존 같은 source_doc 으로 시드된 problem 들 soft-delete (재실행 안전성).
console.log("기존 problems soft-delete…");
const { error: delErr } = await supa
  .from("problems")
  .update({ deleted_at: new Date().toISOString() })
  .eq("source_doc_id", problemDocId);
if (delErr) {
  console.error("기존 삭제 실패:", delErr.message);
}

// origin 매핑은 이미 parser 에서 처리. format/polarity 는 stem 으로 추정.
function inferFormat(stem) {
  if (/사례/.test(stem) || /다음\s*사례/.test(stem)) return "mc_case";
  if (/<\s*보기\s*>|<보기>|\[\s*보기\s*\]/.test(stem)) return "mc_box";
  return "mc_short";
}
function inferPolarity(stem) {
  // "옳지 않은", "틀린", "아닌" → negative
  if (/옳지\s*않은|틀린|아닌|아니한|않는/.test(stem)) return "negative";
  return "positive";
}

let inserted = 0;
let skipped = 0;
for (const p of problems) {
  // 5지문 미완성 또는 정답 미매칭 → skip (운영자가 admin 화면에서 수동 보강).
  if (p.choices.length !== 5) {
    skipped++;
    continue;
  }
  const articleNumber = articleNumberFromHint(p.articleHint);
  const primaryArticleId = articleNumber
    ? articleByNumber.get(articleNumber) ?? null
    : null;
  const { data: probRow, error } = await supa
    .from("problems")
    .insert({
      law_id: lawId,
      exam_round: "first",
      subject_type: "law",
      origin: p.origin,
      format: inferFormat(p.stem),
      scope: p.scope,
      polarity: inferPolarity(p.stem),
      year: p.year,
      problem_number: p.problemNumber,
      primary_article_id: primaryArticleId,
      body_md: p.stem,
      source_doc_id: problemDocId,
    })
    .select("problem_id")
    .single();
  if (error) {
    console.error(`  insert 실패 [${p.chapter}/${p.section}/${p.problemNumber}]`, error.message);
    continue;
  }
  const choiceRows = p.choices.map((c) => ({
    problem_id: probRow.problem_id,
    choice_index: c.index,
    body_md: c.body,
    is_correct: p.correctIndex === c.index,
    explanation_md: p.choiceExplanations?.[c.index] ?? null,
    choice_type: p.choiceTypes?.[c.index] ?? null,
  }));
  const { error: cErr } = await supa.from("problem_choices").insert(choiceRows);
  if (cErr) {
    console.error(`  choices insert 실패`, cErr.message);
    continue;
  }
  inserted++;
}

console.log(`✓ inserted: ${inserted}`);
console.log(`  skipped (incomplete): ${skipped}`);
