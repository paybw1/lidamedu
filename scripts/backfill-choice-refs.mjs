// 기존 problem_choices 에 대해 explanation_md 에서 조문번호 / 판례번호 추출 후
// related_article_number / related_case_number 일괄 백필 + 가능하면 related_article_id 도 연결.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 추출기 — app/features/problems/extract.ts 와 동일 로직 (스크립트 독립 실행 위해 inline 복제).
const ARTICLE_RES = [
  /제\s*(\d+)\s*조\s*의\s*(\d+)/,
  /(?:특허법|法|법)\s*(\d+)\s*의\s*(\d+)/,
  /(?:특허법|법|法)\s*제?\s*(\d+)\s*조?/,
  /제\s*(\d+)\s*조/,
];
function extractArticleNumber(text) {
  if (!text) return null;
  for (const re of ARTICLE_RES) {
    const m = text.match(re);
    if (m) return m[2] ? `${m[1]}의${m[2]}` : m[1];
  }
  return null;
}
const CASE_RES = [
  {
    re: /(대법원|특허법원|헌법재판소|헌재)\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*선고\s*(\d{2,4}\s*[다후카허헌마]\s*\d+)/,
    fmt: (m) => `${m[1]} ${m[2]}.${m[3]}.${m[4]}. 선고 ${m[5].replace(/\s+/g, "")}`,
  },
  {
    re: /(대법원|특허법원|헌법재판소|헌재)\s*(\d{2,4}\s*[다후카허헌마]\s*\d+)/,
    fmt: (m) => `${m[1]} ${m[2].replace(/\s+/g, "")}`,
  },
  { re: /\b(\d{2,4}[다후카허헌마]\d+)\b/, fmt: (m) => m[1] },
];
function extractCaseNumber(text) {
  if (!text) return null;
  for (const it of CASE_RES) {
    const m = text.match(it.re);
    if (m) return it.fmt(m);
  }
  return null;
}

// patent law id + article_number → article_id 매핑.
const { data: laws } = await supa.from("laws").select("law_id, law_code");
const lawIdByCode = new Map((laws ?? []).map((l) => [l.law_code, l.law_id]));

const { data: articleRows } = await supa
  .from("articles")
  .select("article_id, article_number, law_id")
  .is("deleted_at", null)
  .not("article_number", "is", null);
const articleIdByLawNumber = new Map();
for (const a of articleRows ?? []) {
  articleIdByLawNumber.set(`${a.law_id}|${a.article_number}`, a.article_id);
}
console.log(`articles map: ${articleIdByLawNumber.size}`);

// 모든 alive choice 가져오기 — REST 기본 limit 1000 회피용 페이징.
const choices = [];
const PAGE = 1000;
for (let from = 0; ; from += PAGE) {
  const { data: page, error } = await supa
    .from("problem_choices")
    .select(
      "choice_id, problem_id, choice_type, explanation_md, body_md, related_article_number, related_case_number, related_article_id, related_case_id",
    )
    .range(from, from + PAGE - 1);
  if (error) { console.error(error); break; }
  if (!page || page.length === 0) break;
  choices.push(...page);
  if (page.length < PAGE) break;
}
console.log(`choices total: ${choices.length}`);

// 각 choice 의 problem 의 law_id 가 필요 — batch.
const problemIds = [...new Set((choices ?? []).map((c) => c.problem_id))];
const { data: problems } = await supa
  .from("problems")
  .select("problem_id, law_id")
  .in("problem_id", problemIds);
const lawByProblem = new Map((problems ?? []).map((p) => [p.problem_id, p.law_id]));

let updated = 0;
let skipped = 0;
let articleResolved = 0;
const failures = [];
for (const c of choices ?? []) {
  const text = (c.explanation_md ?? "").trim() || c.body_md;
  let articleNumber = c.related_article_number ?? null;
  let caseNumber = c.related_case_number ?? null;
  let articleId = c.related_article_id ?? null;

  // 이미 채워져 있으면 건드리지 않음 (운영자가 수동 입력했을 가능성).
  const needArticle = articleNumber == null && (c.choice_type === "statute" || c.choice_type === "theory" || c.choice_type === null);
  const needCase = caseNumber == null && c.choice_type === "precedent";
  if (!needArticle && !needCase) { skipped++; continue; }

  if (needArticle) {
    articleNumber = extractArticleNumber(text);
  }
  if (needCase) {
    caseNumber = extractCaseNumber(text);
  }

  // article_id 도 같이 resolve.
  if (articleNumber && articleId == null) {
    const lawId = lawByProblem.get(c.problem_id);
    if (lawId) {
      const id = articleIdByLawNumber.get(`${lawId}|${articleNumber}`);
      if (id) {
        articleId = id;
        articleResolved++;
      }
    }
  }

  // 변경사항 있으면 update.
  const update = {};
  if (needArticle && articleNumber !== c.related_article_number) update.related_article_number = articleNumber;
  if (needCase && caseNumber !== c.related_case_number) update.related_case_number = caseNumber;
  if (articleId && articleId !== c.related_article_id) update.related_article_id = articleId;
  if (Object.keys(update).length === 0) { skipped++; continue; }

  const { error } = await supa.from("problem_choices").update(update).eq("choice_id", c.choice_id);
  if (error) {
    failures.push({ choice_id: c.choice_id, error: error.message });
  } else {
    updated++;
  }
}

console.log(`updated: ${updated}`);
console.log(`skipped: ${skipped}`);
console.log(`article_id resolved: ${articleResolved}`);
if (failures.length) console.log("failures:", failures.slice(0, 5));
