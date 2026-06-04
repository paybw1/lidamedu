// 특허법 origin='expected' 의 선지/박스 — 본문+해설에서 명시 인용 정규식으로
// related_article_id / related_case_id / choice_type 1차 자동 입력.
//
// 안전 모드: 명시 정규식만 — RAG/추측 사용 안 함. 정확도 ≈ 100% (잘못 들어갈 위험 거의 0).
// 강사는 /admin/problems/:id 편집 화면에서 자동 입력값 확인 + 빈 칸 보강 + 승인.
//
//   node scripts/backfill-expected-links.mjs --dry-run
//   node scripts/backfill-expected-links.mjs
//
// 멱등: 이미 채워진 값(related_article_id IS NOT NULL)은 건드리지 않는다. 재실행 안전.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

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

// ── extract.ts 헬퍼 (그대로 포팅) ──────────────────────────
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
    if (m) {
      if (m[2]) return `${m[1]}의${m[2]}`;
      return m[1];
    }
  }
  return null;
}
const CASE_RES = [
  {
    re: /(대법원|특허법원|헌법재판소|헌재)\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*선고\s*(\d{2,4}\s*[다후카허헌마]\s*\d+)/,
    format: (m) => `${m[1]} ${m[2]}.${m[3]}.${m[4]}. 선고 ${m[5].replace(/\s+/g, "")}`,
  },
  {
    re: /(대법원|특허법원|헌법재판소|헌재)\s*(\d{2,4}\s*[다후카허헌마]\s*\d+)/,
    format: (m) => `${m[1]} ${m[2].replace(/\s+/g, "")}`,
  },
  {
    re: /\b(\d{2,4}[다후카허헌마]\d+)\b/,
    format: (m) => m[1],
  },
];
function extractCaseNumber(text) {
  if (!text) return null;
  for (const item of CASE_RES) {
    const m = text.match(item.re);
    if (m) return item.format(m);
  }
  return null;
}

// ── ① patent law_id ────────────────────────────────────────
const { data: lawRow } = await supa.from("laws").select("law_id").eq("law_code", "patent").single();
const patentLawId = lawRow.law_id;

// ── ② patent expected problem_ids ──────────────────────────
const { data: problems } = await supa
  .from("problems")
  .select("problem_id, body_md")
  .eq("origin", "expected")
  .eq("law_id", patentLawId)
  .is("deleted_at", null);
console.log(`patent expected problems: ${problems.length}`);

const problemBody = new Map(problems.map((p) => [p.problem_id, p.body_md ?? ""]));
const problemIds = problems.map((p) => p.problem_id);

// ── ③ 선지 + 박스 일괄 로드 (CHUNK) ────────────────────────
const CHUNK = 200;
const choices = [];
const boxes = [];
for (let i = 0; i < problemIds.length; i += CHUNK) {
  const slice = problemIds.slice(i, i + CHUNK);
  const [{ data: cs }, { data: bs }] = await Promise.all([
    supa
      .from("problem_choices")
      .select("choice_id, problem_id, body_md, explanation_md, related_article_id, related_case_id, choice_type")
      .in("problem_id", slice),
    supa
      .from("problem_box_items")
      .select("box_item_id, problem_id, body_md, explanation_md, related_article_id, related_case_id, choice_type")
      .in("problem_id", slice),
  ]);
  for (const c of cs ?? []) choices.push(c);
  for (const b of bs ?? []) boxes.push(b);
}
console.log(`  · choices=${choices.length}  boxes=${boxes.length}`);

// ── ④ articles / cases 매칭 캐시 ───────────────────────────
const { data: arts } = await supa
  .from("articles")
  .select("article_id, article_number")
  .eq("law_id", patentLawId)
  .eq("level", "article");
const articleByNumber = new Map();
for (const a of arts ?? []) {
  if (a.article_number) articleByNumber.set(a.article_number, a.article_id);
}
console.log(`  · patent articles: ${articleByNumber.size}`);

// 판례는 사건번호 정확 매칭만. 단독 사건번호("2018후10844") 매치를 위해
// cases.case_number 의 다양한 형태도 부분 lookup.
const caseLookup = async (num) => {
  if (!num) return null;
  // 1) 정확 매칭
  let { data: rows } = await supa.from("cases").select("case_id").eq("case_number", num).limit(1);
  if (rows && rows.length > 0) return rows[0].case_id;
  // 2) 사건번호 단독("2018후10844") 일 때 끝부분 일치
  if (/^\d{2,4}[다후카허헌마]\d+$/.test(num)) {
    ({ data: rows } = await supa
      .from("cases")
      .select("case_id")
      .ilike("case_number", `%${num}`)
      .limit(1));
    if (rows && rows.length > 0) return rows[0].case_id;
  }
  return null;
};

// ── ⑤ 각 segment 분석 → update 후보 ────────────────────────
let choiceUpdates = 0;
let boxUpdates = 0;
let articleHit = 0, caseHit = 0;
const skipReasons = { alreadyFilled: 0, noText: 0, noMatch: 0 };

async function decideUpdate(seg, parentBodyMd) {
  // 이미 article 채워졌고 case 도 채워졌으면 skip (멱등).
  if (seg.related_article_id && seg.related_case_id) {
    skipReasons.alreadyFilled++;
    return null;
  }
  // 본문 + 해설 합쳐 분석 (단, 너무 길면 해설만 우선).
  const choiceText = [seg.body_md ?? "", seg.explanation_md ?? ""].filter(Boolean).join("\n");
  if (!choiceText.trim()) {
    skipReasons.noText++;
    return null;
  }
  // 선지 텍스트에 매치 안 되면 문제 본문도 합쳐 본다 (보조).
  const combined = [choiceText, parentBodyMd].filter(Boolean).join("\n");

  const caseNum = extractCaseNumber(choiceText) ?? extractCaseNumber(combined);
  const artNum = extractArticleNumber(choiceText) ?? extractArticleNumber(combined);

  const update = {};

  if (caseNum && !seg.related_case_id) {
    const caseId = await caseLookup(caseNum);
    if (caseId) {
      update.related_case_id = caseId;
      caseHit++;
      // 분류 미설정인 경우만 precedent 로.
      if (!seg.choice_type) update.choice_type = "precedent";
    }
  }
  if (artNum && !seg.related_article_id) {
    const articleId = articleByNumber.get(artNum);
    if (articleId) {
      update.related_article_id = articleId;
      articleHit++;
      // 분류 미설정 + 판례 매치도 없으면 statute. 판례 매치 있으면 분류=precedent 유지.
      if (!seg.choice_type && !update.choice_type) update.choice_type = "statute";
    }
  }
  if (Object.keys(update).length === 0) {
    skipReasons.noMatch++;
    return null;
  }
  return update;
}

for (const c of choices) {
  const update = await decideUpdate(c, problemBody.get(c.problem_id));
  if (!update) continue;
  if (dryRun) { choiceUpdates++; continue; }
  const { error } = await supa
    .from("problem_choices")
    .update(update)
    .eq("choice_id", c.choice_id);
  if (error) console.error(`choice ${c.choice_id}: ${error.message}`);
  else choiceUpdates++;
}
for (const b of boxes) {
  const update = await decideUpdate(b, problemBody.get(b.problem_id));
  if (!update) continue;
  if (dryRun) { boxUpdates++; continue; }
  const { error } = await supa
    .from("problem_box_items")
    .update(update)
    .eq("box_item_id", b.box_item_id);
  if (error) console.error(`box ${b.box_item_id}: ${error.message}`);
  else boxUpdates++;
}

console.log(`\n=== 결과 ===`);
console.log(`  적용: choices=${choiceUpdates}  boxes=${boxUpdates}`);
console.log(`  hit:  article=${articleHit}  case=${caseHit}`);
console.log(`  skip:`, skipReasons);
if (dryRun) console.log(`(dry-run — DB 변경 없음)`);
