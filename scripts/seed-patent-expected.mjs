// expected-merged.json → patent origin='expected' DB seed.
//
// 1. source_doc 2건 upsert (문제편/해설편)
// 2. patent law_id 로딩
// 3. 같은 source_doc 으로 시드된 기존 expected problems soft-delete (재실행 안전)
// 4. problems(origin='expected') + problem_choices insert
// 5. articleHint → primary_article_id 자동 매핑 (가능한 경우)
//
//   node scripts/seed-patent-expected.mjs --dry-run
//   node scripts/seed-patent-expected.mjs
//
// 주의: SUPABASE_SERVICE_ROLE_KEY 필요.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const JSON_PATH = resolve(ROOT, "source/_converted/expected-merged.json");
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

// patent law_id
const { data: lawRow, error: lawErr } = await supa
  .from("laws")
  .select("law_id")
  .eq("law_code", "patent")
  .single();
if (lawErr || !lawRow) {
  console.error("patent law 누락");
  process.exit(1);
}
const patentLawId = lawRow.law_id;

const EDITION = "제20판";
const PROBLEM_FILE = "[완0316+내지+문제편] 리담특허법 객관식(Ⅱ) 예상문제 [제20판].hwpx";
const ANSWER_FILE = "[완0306+내지+해설편] 리담특허법 객관식(Ⅱ) 예상문제 [제20판].hwpx";

async function upsertSourceDoc(label, fileName, kind, paired) {
  const { data, error } = await supa
    .from("problem_source_docs")
    .insert({ label, file_name: fileName, kind, edition: EDITION, paired_with_doc_id: paired })
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
  else problemDocId = await upsertSourceDoc(
    "리담특허법 객관식(Ⅱ) 예상문제 제20판 — 문제편",
    PROBLEM_FILE, "problem", null,
  );
}
if (!answerDocId) {
  if (dryRun) console.log("(dry-run) source_doc answer 생성 예정");
  else {
    answerDocId = await upsertSourceDoc(
      "리담특허법 객관식(Ⅱ) 예상문제 제20판 — 해설편",
      ANSWER_FILE, "answer", problemDocId ?? null,
    );
    if (problemDocId) {
      await supa.from("problem_source_docs")
        .update({ paired_with_doc_id: answerDocId })
        .eq("source_doc_id", problemDocId);
    }
  }
}
console.log(`  problem_doc=${problemDocId} answer_doc=${answerDocId}`);

// 같은 source_doc 으로 시드된 기존 expected soft-delete.
if (!dryRun && problemDocId) {
  const { error: delErr, count } = await supa
    .from("problems")
    .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
    .eq("source_doc_id", problemDocId)
    .eq("origin", "expected")
    .is("deleted_at", null);
  if (delErr) console.error("기존 soft-delete 실패:", delErr.message);
  else console.log(`  기존 expected ${count ?? 0}건 soft-delete`);
}

// articleHint → primary_article_id 매핑 헬퍼.
// hint 예: "29①본문" / "29①각호" / "3-5, 7의2" / "1" — 첫 article_number 추출.
const HINT_NUM_RE = /^(\d+(?:의\d+)?)/;
const articleCache = new Map(); // article_number → article_id
async function resolveArticle(hint) {
  if (!hint) return null;
  const m = hint.match(HINT_NUM_RE);
  if (!m) return null;
  const num = m[1];
  if (articleCache.has(num)) return articleCache.get(num);
  const { data } = await supa
    .from("articles")
    .select("article_id")
    .eq("law_id", patentLawId)
    .eq("level", "article")
    .eq("article_number", num)
    .maybeSingle();
  const id = data?.article_id ?? null;
  articleCache.set(num, id);
  return id;
}

function inferFormat(p) {
  if (Array.isArray(p.boxItems) && p.boxItems.length > 0) return "mc_box";
  const stem = p.stem ?? "";
  if (/사례/.test(stem)) return "mc_case";
  if (/<\s*보기\s*>|<보기>|\[\s*보기\s*\]|모두\s*고른|㈎|㉠/.test(stem)) return "mc_box";
  return "mc_short";
}
function inferPolarity(stem) {
  if (/옳지\s*않은|틀린|아닌|아니한|않는/.test(stem)) return "negative";
  return "positive";
}

let inserted = 0;
let skipped = 0;
const skipReasons = { noStem: 0, noCorrect: 0, fewerChoices: 0 };
let primaryHit = 0;
let primaryMiss = 0;
const sampleSkip = [];

for (const p of problems) {
  if (!p.stem || p.stem.length < 5) {
    skipped++; skipReasons.noStem++;
    if (sampleSkip.length < 3) sampleSkip.push({ reason: "noStem", problemNumber: p.problemNumber });
    continue;
  }
  // 복수정답 지원 — correctList(배열) 우선, 없으면 correctIndex(단일).
  const correctSet = new Set(
    Array.isArray(p.correctList)
      ? p.correctList
      : p.correctIndex != null
        ? [p.correctIndex]
        : [],
  );
  if (correctSet.size === 0) {
    skipped++; skipReasons.noCorrect++;
    if (sampleSkip.length < 3) sampleSkip.push({ reason: "noCorrect", section: p.section, num: p.problemNumber });
    continue;
  }
  // 5지문 미만 (박스형/패키지) 도 일단 적재 — link-suggest 화면에서 강사가 추후 보정.
  // 단 0개면 skip (의미 없음).
  if (!p.choices || p.choices.length === 0) {
    skipped++; skipReasons.fewerChoices++;
    continue;
  }

  const primaryArticleId = await resolveArticle(p.articleHint);
  if (primaryArticleId) primaryHit++;
  else primaryMiss++;

  if (dryRun) { inserted++; continue; }

  const { data: probRow, error } = await supa
    .from("problems")
    .insert({
      law_id: patentLawId,
      exam_round: "first",
      subject_type: "law",
      origin: "expected",
      format: inferFormat(p),
      scope: p.scope === "comprehensive" ? "comprehensive" : "unit",
      polarity: inferPolarity(p.stem),
      year: null, // 예상문제는 연도 없음
      problem_number: p.problemNumber,
      primary_article_id: primaryArticleId,
      body_md: p.stem,
      explanation_md: p.explanation || null,
      source_doc_id: problemDocId,
    })
    .select("problem_id")
    .single();
  if (error) {
    console.error(`  insert 실패 [#${p.problemNumber} ${(p.section ?? "").slice(0, 20)}]:`, error.message);
    continue;
  }
  const choiceRows = p.choices.slice(0, 5).map((c) => ({
    problem_id: probRow.problem_id,
    choice_index: c.index,
    body_md: c.body,
    is_correct: correctSet.has(c.index),
    explanation_md: p.choiceExplanations?.[c.index] ?? null,
  }));
  if (choiceRows.length > 0) {
    const { error: cErr } = await supa.from("problem_choices").insert(choiceRows);
    if (cErr) console.error(`  choices insert 실패:`, cErr.message);
  }
  // box_items — 박스형 문제 (mc_box) 의 보기 항목.
  if (Array.isArray(p.boxItems) && p.boxItems.length > 0) {
    const boxRows = p.boxItems.map((b, i) => ({
      problem_id: probRow.problem_id,
      marker: b.marker,
      position_index: i,
      body_md: b.body,
      // 해설은 별도 매칭 단계 — 일단 null. 강사가 link-suggest 에서 보강.
      explanation_md: null,
    }));
    const { error: bErr } = await supa.from("problem_box_items").insert(boxRows);
    if (bErr) console.error(`  box_items insert 실패:`, bErr.message);
  }
  inserted++;
}

console.log(`\n=== 결과 ===`);
console.log(`  inserted=${inserted}  skipped=${skipped}`);
console.log(`  skipReasons:`, skipReasons);
console.log(`  primary_article_id: hit=${primaryHit} miss=${primaryMiss}`);
if (sampleSkip.length > 0) console.log(`  skip sample:`, sampleSkip);
if (dryRun) console.log(`\n(dry-run — DB 변경 없음)`);
