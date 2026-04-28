// 리담특허법 조문 자동 시드 (옵션 A: clean wipe + re-seed)
//
// 흐름:
//   1. 기존 patent law 의 articles / article_revisions / article_case_links / article_article_links / problems / problem_choices / law_revisions / laws 삭제
//      (cascade 로 사용자 학습 데이터 중 target_type='article' 항목 정리됨)
//   2. laws.patent + law_revisions 1건(시행 2025-11-11) 신규 발급
//   3. 13 chapter article 삽입
//   4. 268 article 삽입 + body_json 으로 article_revisions 발행
//   5. articles.current_revision_id 갱신
//   6. 기존 link 의미 재구축: 제29조-3판례 / 제2조-29조 / 제29조-33조
//   7. 기존 problem 2건 재구축 (primary_article_id, problem_choices.related_article_id)
//
// 주의: SUPABASE_SERVICE_ROLE_KEY 필요. .env 자동 로드.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
// v2 우선 사용. 없으면 v1 fallback.
import { existsSync } from "node:fs";
const V2_PATH = resolve(ROOT, "source/_converted/parsed-articles-v2.json");
const V1_PATH = resolve(ROOT, "source/_converted/parsed-articles.json");
const JSON_PATH = existsSync(V2_PATH) ? V2_PATH : V1_PATH;
console.log(`source: ${JSON_PATH.endsWith("v2.json") ? "v2" : "v1"}`);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const data = JSON.parse(readFileSync(JSON_PATH, "utf8"));
console.log(
  `loaded: ${data.stats.chapters} chapters / ${data.stats.articles} articles`,
);

// ───────── 1. wipe ─────────
async function wipePatent() {
  // 기존 patent law row 의 article_id 들을 cascade 시키기 위해 articles 부터 — laws 삭제 시 cascade 가 articles → article_revisions → article_case_links 까지 정리
  // 단, problems/problem_choices 는 law_id ref 만 있고 articles cascade 와 별개. 명시 삭제.
  // problem_choices 는 problems FK on delete cascade — problems 만 지우면 됨.
  console.log("→ wipe");
  const { data: law } = await supa
    .from("laws")
    .select("law_id")
    .eq("law_code", "patent")
    .maybeSingle();
  if (!law) {
    console.log("  patent law row 없음 — wipe 건너뜀");
    return;
  }
  const lawId = law.law_id;

  // problems → cascade 로 problem_choices 정리
  await delAll("problems", { law_id: lawId });
  // articles → cascade 로 article_revisions, article_case_links, article_article_links, user_*(target_type='article') 정리
  await delAll("articles", { law_id: lawId });
  // law_revisions
  await delAll("law_revisions", { law_id: lawId });
  // laws
  await delAll("laws", { law_id: lawId });
  console.log("  ✓ wipe 완료");
}

async function delAll(table, eqs) {
  let q = supa.from(table).delete();
  for (const [k, v] of Object.entries(eqs)) q = q.eq(k, v);
  const { error, count } = await q.select("*", { count: "exact", head: true });
  if (error) throw new Error(`delete ${table}: ${error.message}`);
  console.log(`  - ${table}: ${count ?? "?"} row`);
}

// ───────── 2. law + law_revision ─────────
async function insertLaw() {
  const { data: law, error } = await supa
    .from("laws")
    .insert({
      law_code: "patent",
      display_label: "특허법",
      short_label: "특허",
      ord: 10,
    })
    .select("law_id")
    .single();
  if (error) throw new Error(`law insert: ${error.message}`);

  const { data: rev, error: revErr } = await supa
    .from("law_revisions")
    .insert({
      law_id: law.law_id,
      revision_number: "법률 제21134호",
      promulgated_at: "2025-11-11",
      effective_date: "2025-11-11",
      status: "published",
      published_at: new Date().toISOString(),
      reason_md: "리담 특허법 조문 정리 (제5판) — 임병웅 변리사 (2026.03)",
    })
    .select("law_revision_id")
    .single();
  if (revErr) throw new Error(`law_revisions: ${revErr.message}`);

  console.log(`  ✓ law=${law.law_id}, revision=${rev.law_revision_id}`);
  return { lawId: law.law_id, lawRevId: rev.law_revision_id };
}

// ───────── 3. chapter + article + revision ─────────
function pad(n, width) {
  return String(n).padStart(width, "0");
}
function chapterPath(ch) {
  const branch = ch.branch ? `_${pad(ch.branch, 2)}` : "";
  return `patent.ch${pad(ch.number, 2)}${branch}`;
}
function articlePath(chPath, art) {
  const branch = art.branch ? `_${pad(art.branch, 2)}` : "";
  return `${chPath}.a${art.number}${branch}`;
}
function articleNumberText(art) {
  return art.branch ? `${art.number}의${art.branch}` : String(art.number);
}
function articleDisplayLabel(art) {
  // 한국 법령 표기는 "제29조의2" — 가지조는 조 뒤에 의N
  const b = art.branch ? `의${art.branch}` : "";
  if (art.deleted) return `제${art.number}조${b} (삭제)`;
  return `제${art.number}조${b} ${art.title}`;
}

async function seedChaptersAndArticles(lawId, lawRevId) {
  console.log("→ chapters + articles");
  let chapterCount = 0;
  let articleCount = 0;
  let revisionCount = 0;

  for (const ch of data.chapters) {
    const chPath = chapterPath(ch);
    const { data: chRow, error: chErr } = await supa
      .from("articles")
      .insert({
        law_id: lawId,
        parent_id: null,
        level: "chapter",
        path: chPath,
        article_number: null,
        display_label: ch.label,
        importance: 1,
      })
      .select("article_id")
      .single();
    if (chErr) throw new Error(`chapter ${ch.label}: ${chErr.message}`);
    chapterCount++;

    // 해당 chapter 의 articles 삽입
    const inserts = ch.articles.map((art) => ({
      law_id: lawId,
      parent_id: chRow.article_id,
      level: "article",
      path: articlePath(chPath, art),
      article_number: articleNumberText(art),
      display_label: articleDisplayLabel(art),
      importance: art.deleted ? 0 : Math.max(0, Math.min(3, art.importance ?? 0)),
    }));

    // batch insert (Supabase는 한 번에 수백 row 처리 가능)
    const { data: inserted, error: aErr } = await supa
      .from("articles")
      .insert(inserts)
      .select("article_id, article_number, path");
    if (aErr) throw new Error(`articles in ${ch.label}: ${aErr.message}`);
    articleCount += inserted.length;

    // 본문 있는 article 들에 article_revisions 발행
    const revInserts = [];
    const idByArticleNumber = new Map();
    for (let i = 0; i < ch.articles.length; i++) {
      const src = ch.articles[i];
      const row = inserted[i];
      idByArticleNumber.set(row.article_number, row.article_id);
      // 삭제된 article 이라도 v2 파서가 옛 본문 (구특허법 박스 등) 을 채워줬으면 revision 발행.
      // 옛 내용을 살펴봐야 할 필요가 있는 경우 — 제26조/제27조/제31조 등.
      if (!src.blocks || src.blocks.length === 0) continue;
      revInserts.push({
        article_id: row.article_id,
        law_revision_id: lawRevId,
        body_json: { blocks: src.blocks },
        effective_date: "2025-11-11",
        change_kind: "created",
      });
    }

    if (revInserts.length > 0) {
      const { data: revs, error: rErr } = await supa
        .from("article_revisions")
        .insert(revInserts)
        .select("revision_id, article_id");
      if (rErr) throw new Error(`revisions in ${ch.label}: ${rErr.message}`);
      revisionCount += revs.length;

      // articles.current_revision_id 일괄 갱신
      for (const r of revs) {
        const { error: uErr } = await supa
          .from("articles")
          .update({ current_revision_id: r.revision_id })
          .eq("article_id", r.article_id);
        if (uErr) throw new Error(`update current_revision_id: ${uErr.message}`);
      }
    }
    console.log(
      `  ✓ ${ch.label} → ${inserted.length}조 / ${revInserts.length} revisions`,
    );
  }

  console.log(
    `  total: ${chapterCount} chapters / ${articleCount} articles / ${revisionCount} revisions`,
  );
}

// ───────── 4. links 재구축 ─────────
async function rebuildLinks(lawId) {
  console.log("→ rebuild links");
  // 새 article_id 조회
  const { data: a29 } = await supa
    .from("articles")
    .select("article_id")
    .eq("law_id", lawId)
    .eq("path", "patent.ch02.a29")
    .maybeSingle();
  const { data: a33 } = await supa
    .from("articles")
    .select("article_id")
    .eq("law_id", lawId)
    .eq("path", "patent.ch02.a33")
    .maybeSingle();
  const { data: a2 } = await supa
    .from("articles")
    .select("article_id")
    .eq("law_id", lawId)
    .eq("path", "patent.ch01.a2")
    .maybeSingle();
  const { data: a44 } = await supa
    .from("articles")
    .select("article_id")
    .eq("law_id", lawId)
    .eq("path", "patent.ch02.a44")
    .maybeSingle();

  if (!a29 || !a33 || !a2 || !a44) {
    console.warn("  ! 핵심 article 일부 없음 — link 재구축 건너뜀");
    return;
  }

  const cases = await supa
    .from("cases")
    .select("case_id, case_number")
    .in("case_number", ["2013도10265", "2014후2061", "2017후424"]);
  const caseByNum = new Map(
    (cases.data ?? []).map((c) => [c.case_number, c.case_id]),
  );

  const { data: profile } = await supa
    .from("profiles")
    .select("profile_id")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const creator = profile?.profile_id ?? null;

  const acInserts = [
    {
      article_id: a29.article_id,
      case_id: caseByNum.get("2013도10265"),
      relation_type: "directly_interprets",
      note: '제29조 제1항 제1호 "공지" 의 인터넷 공개 범위',
      created_by: creator,
    },
    {
      article_id: a29.article_id,
      case_id: caseByNum.get("2014후2061"),
      relation_type: "directly_interprets",
      note: "제29조 제2항 진보성 — 결합 동기·시사 + 효과",
      created_by: creator,
    },
    {
      article_id: a29.article_id,
      case_id: caseByNum.get("2017후424"),
      relation_type: "cites",
      note: "제29조 진보성과의 비교 (균등론 5요건 정리)",
      created_by: creator,
    },
  ].filter((r) => r.case_id);

  if (acInserts.length > 0) {
    const { error } = await supa.from("article_case_links").insert(acInserts);
    if (error) throw new Error(`article_case_links: ${error.message}`);
    console.log(`  ✓ article_case_links: ${acInserts.length}`);
  }

  // article-article (정규화 a < b)
  function pair(x, y) {
    return x < y ? [x, y] : [y, x];
  }
  const aaInserts = [
    {
      ...pairToObj(pair(a2.article_id, a29.article_id)),
      relation_type: "cross_reference",
      note: '"발명" 정의(제2조) ↔ 특허요건(제29조)',
      created_by: creator,
    },
    {
      ...pairToObj(pair(a29.article_id, a33.article_id)),
      relation_type: "cross_reference",
      note: "특허요건(제29조) ↔ 특허받을수있는자(제33조)",
      created_by: creator,
    },
    {
      ...pairToObj(pair(a33.article_id, a44.article_id)),
      relation_type: "cross_reference",
      note: "특허받을수있는자 제33조 제2항(공동발명) ↔ 공동출원(제44조)",
      created_by: creator,
    },
  ];
  const { error: aaErr } = await supa
    .from("article_article_links")
    .insert(aaInserts);
  if (aaErr) throw new Error(`article_article_links: ${aaErr.message}`);
  console.log(`  ✓ article_article_links: ${aaInserts.length}`);

  return { a29: a29.article_id, a33: a33.article_id, a2: a2.article_id };
}

function pairToObj([a, b]) {
  return { article_a: a, article_b: b };
}

// ───────── 5. problems 재구축 ─────────
async function rebuildProblems(lawId, articleIds) {
  console.log("→ rebuild problems");
  const { data: cases } = await supa
    .from("cases")
    .select("case_id, case_number");
  const caseByNum = new Map((cases ?? []).map((c) => [c.case_number, c.case_id]));
  const { data: profile } = await supa
    .from("profiles")
    .select("profile_id")
    .limit(1)
    .maybeSingle();
  const creator = profile?.profile_id ?? null;

  // 문제 1: 신규성
  const { data: p1, error: p1Err } = await supa
    .from("problems")
    .insert({
      exam_round: "first",
      subject_type: "law",
      law_id: lawId,
      origin: "past_exam",
      format: "mc_short",
      scope: "unit",
      polarity: "positive",
      year: 2021,
      exam_round_no: 58,
      examined_at: "2021-02-27",
      problem_number: 12,
      primary_article_id: articleIds.a29,
      body_md:
        '특허법 제29조 제1항 제1호의 "공지(公知)된 발명" 에 해당하는 것은?',
      created_by: creator,
    })
    .select("problem_id")
    .single();
  if (p1Err) throw new Error(`problem 1: ${p1Err.message}`);

  const p1Choices = [
    [1, "특허출원 후 공개된 박사학위논문에 게재된 발명", false, "출원 후 공개는 공지 판단 기준 시점 이후이므로 해당하지 않는다.", articleIds.a29, null],
    [2, "특허출원 전 비밀유지의무 하에 회사 내부에 알려진 발명", false, "비밀유지의무 하의 공지는 공지로 보지 않는다는 것이 통설.", articleIds.a29, null],
    [3, "특허출원 전 인터넷에 누구나 접근 가능한 형태로 공개된 발명", true, "대법원 2013도10265 — 인터넷 공개는 공지에 해당.", articleIds.a29, caseByNum.get("2013도10265") ?? null],
    [4, "특허출원 전 외국에서 출원·등록되었으나 국내에 공개되지 않은 발명", false, "특허법은 국내·국외 모두를 본다.", articleIds.a29, null],
    [5, "특허출원과 같은 날 공개된 발명", false, '같은 날 공개는 출원 "전" 에 해당하지 않는다.', articleIds.a29, null],
  ].map(([idx, body, ok, ex, art, kase]) => ({
    problem_id: p1.problem_id,
    choice_index: idx,
    body_md: body,
    is_correct: ok,
    explanation_md: ex,
    related_article_id: art,
    related_case_id: kase,
  }));
  const { error: p1cErr } = await supa
    .from("problem_choices")
    .insert(p1Choices);
  if (p1cErr) throw new Error(`problem 1 choices: ${p1cErr.message}`);

  // 문제 2: 진보성
  const { data: p2, error: p2Err } = await supa
    .from("problems")
    .insert({
      exam_round: "first",
      subject_type: "law",
      law_id: lawId,
      origin: "past_exam",
      format: "mc_box",
      scope: "unit",
      polarity: "negative",
      year: 2022,
      exam_round_no: 59,
      examined_at: "2022-02-26",
      problem_number: 14,
      primary_article_id: articleIds.a29,
      body_md:
        "특허법 제29조 제2항(진보성) 에 관한 다음 설명 중 옳지 않은 것은?",
      created_by: creator,
    })
    .select("problem_id")
    .single();
  if (p2Err) throw new Error(`problem 2: ${p2Err.message}`);

  const k_inv = caseByNum.get("2014후2061") ?? null;
  const p2Choices = [
    [1, "진보성 판단의 기준은 통상의 기술자 관점이다.", false, "제29조 제2항 본문 — 옳음.", articleIds.a29, null],
    [2, "선행기술의 결합 동기·시사가 인정되어야 진보성을 부정할 수 있다.", false, "대법원 2014후2061 — 옳음.", articleIds.a29, k_inv],
    [3, "결합으로 예측 가능한 효과 이상의 작용효과가 있어야 한다.", false, "대법원 2014후2061 — 옳음.", articleIds.a29, k_inv],
    [4, "신규성이 부정되면 진보성도 자동으로 부정된다.", true, "신규성과 진보성은 별개의 요건이다.", articleIds.a29, null],
    [5, "특허출원 시 통상의 기술자가 쉽게 발명할 수 있어야 진보성이 부정된다.", false, "제29조 제2항 본문 — 옳음.", articleIds.a29, null],
  ].map(([idx, body, ok, ex, art, kase]) => ({
    problem_id: p2.problem_id,
    choice_index: idx,
    body_md: body,
    is_correct: ok,
    explanation_md: ex,
    related_article_id: art,
    related_case_id: kase,
  }));
  const { error: p2cErr } = await supa
    .from("problem_choices")
    .insert(p2Choices);
  if (p2cErr) throw new Error(`problem 2 choices: ${p2cErr.message}`);

  console.log("  ✓ 2 problems / 10 choices");
}

// ───────── 실행 ─────────
async function main() {
  await wipePatent();
  console.log("→ insert law + revision");
  const { lawId, lawRevId } = await insertLaw();
  await seedChaptersAndArticles(lawId, lawRevId);
  const articleIds = await rebuildLinks(lawId);
  if (articleIds) {
    await rebuildProblems(lawId, articleIds);
  }

  // 검증
  const { count: aCount } = await supa
    .from("articles")
    .select("*", { count: "exact", head: true })
    .eq("law_id", lawId);
  const { count: rCount } = await supa
    .from("article_revisions")
    .select("*", { count: "exact", head: true });
  const { count: linkCount } = await supa
    .from("article_case_links")
    .select("*", { count: "exact", head: true });
  console.log("");
  console.log("=== 결과 ===");
  console.log(`  articles: ${aCount}`);
  console.log(`  article_revisions: ${rCount}`);
  console.log(`  article_case_links: ${linkCount}`);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
