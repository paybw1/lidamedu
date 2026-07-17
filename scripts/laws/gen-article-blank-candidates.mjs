// 조문 빈칸 후보 생성 (gen-case-blank-candidates 미러 — 조문판).
//   조문에 매핑된(related_article_id) 기출 OX '거짓(X)' 지문에서 "무엇을 바꿔 거짓으로
//   만들었나"(=시험 함정어)를 AI가 조문 원문 verbatim substring 으로 도출
//   → article_blank_candidates 적재(운영자 승인 대기 — /admin/blanks/article-candidates).
// 신뢰성: keyword 는 반드시 조문 텍스트의 부분 문자열이어야 채택. 아니면 skip.
// 재실행 안전: 같은 source_ref 후보 skip. (article, answer) 중복 skip.
//
//   node scripts/laws/gen-article-blank-candidates.mjs --law trademark          # dry-run
//   node scripts/laws/gen-article-blank-candidates.mjs --law trademark --apply
//   ARTICLE_LIMIT=5 node ... — 앞 N개 조문만(표본 검증용)
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const MODEL = "claude-sonnet-5";
const CONCURRENCY = 4;
const HINT_LEN = 80; // addBlankToSet beforeHint/afterHint 와 동일 규칙
const APPLY = process.argv.includes("--apply");
const lawIdx = process.argv.indexOf("--law");
const LAW = lawIdx >= 0 ? process.argv[lawIdx + 1] : null;
const ARTICLE_LIMIT = Number(process.env.ARTICLE_LIMIT || 0);
if (!LAW) {
  console.error("--law <trademark|design|patent|civil> 필요");
  process.exit(1);
}
const LAW_NAMES = {
  patent: "특허법",
  trademark: "상표법",
  design: "디자인보호법",
  civil: "민법",
  "civil-procedure": "민사소송법",
};
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── body_json 플랫텐 — 본문 텍스트(text/underline)만. 라벨·참조·주석 제외 ──
function inlineText(inline) {
  let out = "";
  for (const t of inline ?? []) {
    if (t.type === "text" || t.type === "underline") out += t.text ?? "";
  }
  return out;
}
function flattenBlocks(blocks, acc) {
  for (const b of blocks ?? []) {
    if (b.kind === "sub_article_group") {
      flattenBlocks(b.preface ?? [], acc);
      for (const a of b.articles ?? []) flattenBlocks(a.blocks ?? [], acc);
      continue;
    }
    if (b.inline) {
      const label = b.label ? `${b.label} ` : "";
      const text = inlineText(b.inline);
      if (text.trim()) acc.push(label + text);
    }
    if (b.children) flattenBlocks(b.children, acc);
  }
}
function articleText(bodyJson) {
  const acc = [];
  try {
    flattenBlocks(bodyJson?.blocks ?? [], acc);
  } catch {
    return "";
  }
  return acc.join("\n");
}

// ── 1. 대상 법령 조문 로드 ──
const { data: law } = await c
  .from("laws")
  .select("law_id")
  .eq("law_code", LAW)
  .maybeSingle();
if (!law) {
  console.error(`law_code=${LAW} 없음`);
  process.exit(1);
}
// 조문 본문 = articles.current_revision_id → article_revisions.body_json (개정 추적 구조).
let rawArticles = [];
for (let from = 0; ; from += 500) {
  const { data } = await c
    .from("articles")
    .select("article_id, article_number, display_label, current_revision_id")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .is("deleted_at", null)
    .order("article_number")
    .range(from, from + 499);
  if (!data?.length) break;
  rawArticles.push(...data);
  if (data.length < 500) break;
}
const revIds = rawArticles.map((a) => a.current_revision_id).filter(Boolean);
const bodyByRev = new Map();
for (let i = 0; i < revIds.length; i += 100) {
  const { data } = await c
    .from("article_revisions")
    .select("revision_id, body_json")
    .in("revision_id", revIds.slice(i, i + 100));
  for (const r of data ?? []) bodyByRev.set(r.revision_id, r.body_json);
}
let articles = [];
for (const a of rawArticles) {
  const text = articleText(bodyByRev.get(a.current_revision_id));
  if (text.length >= 20) articles.push({ ...a, text });
}
if (ARTICLE_LIMIT > 0) articles = articles.slice(0, ARTICLE_LIMIT);
const articleById = new Map(articles.map((a) => [a.article_id, a]));

// ── 2. 조문별 매핑된 거짓(X) 지문 수집 ──
const aids = articles.map((a) => a.article_id);
const falseByArticle = new Map(); // article_id -> [{refType,refId,problemId,body,expl}]
async function collectFalse(table, idCol, refType) {
  for (let i = 0; i < aids.length; i += 150) {
    const { data } = await c
      .from(table)
      .select(
        `${idCol}, problem_id, related_article_id, body_md, explanation_md, ox_truth, ox_ineligible, ox_hidden_at`,
      )
      .in("related_article_id", aids.slice(i, i + 150))
      .eq("ox_truth", "X")
      .limit(5000);
    for (const r of data ?? []) {
      if (r.ox_ineligible || r.ox_hidden_at) continue;
      const aid = r.related_article_id;
      if (!falseByArticle.has(aid)) falseByArticle.set(aid, []);
      falseByArticle.get(aid).push({
        refType,
        refId: r[idCol],
        problemId: r.problem_id,
        body: r.body_md ?? "",
        expl: r.explanation_md ?? "",
      });
    }
  }
}
await collectFalse("problem_choices", "choice_id", "choice");
await collectFalse("problem_box_items", "box_item_id", "box");

// display_no
const pids = [...new Set([...falseByArticle.values()].flat().map((f) => f.problemId))];
const displayNo = new Map();
for (let i = 0; i < pids.length; i += 200) {
  const { data } = await c
    .from("problems")
    .select("problem_id, display_no")
    .in("problem_id", pids.slice(i, i + 200));
  for (const p of data ?? []) displayNo.set(p.problem_id, p.display_no);
}

const queue = [];
for (const a of articles) {
  for (const f of falseByArticle.get(a.article_id) ?? []) {
    queue.push({ article: a, ...f });
  }
}

// 재실행 안전 — 기존 후보 source_ref skip.
const existing = new Set();
{
  const refIds = queue.map((q) => q.refId);
  for (let i = 0; i < refIds.length; i += 150) {
    const { data } = await c
      .from("article_blank_candidates")
      .select("source_ref_id")
      .in("source_ref_id", refIds.slice(i, i + 150));
    for (const r of data ?? []) existing.add(r.source_ref_id);
  }
}
const work = queue.filter((q) => !existing.has(q.refId));
console.log(
  `${LAW_NAMES[LAW] ?? LAW} — 조문 ${articles.length} · 거짓지문 페어 ${queue.length} · 기존후보 ${existing.size} · 이번 ${work.length} · ${APPLY ? "APPLY" : "DRY-RUN"}`,
);

const TOOL = {
  name: "propose_article_blank",
  description:
    "조문에 매핑된 기출 OX '거짓' 지문이 무엇을 바꿔 거짓이 됐는지 보고, 그 함정에 해당하는 핵심 법률어를 조문 원문에서 verbatim 으로 지목",
  input_schema: {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description:
          "조문 '원문에 그대로 존재하는' 짧은 핵심 법률어 하나(빈칸 정답). 단일 용어~짧은 구, 대개 2~10자·최대 15자. 절/문장 전체 금지. 적절한 짧은 단어가 없으면 빈 문자열.",
      },
      rationale: {
        type: "string",
        description: "이 거짓 지문이 무엇을 바꿔(부정·치환 등) 거짓이 됐는지 한 문장.",
      },
    },
    required: ["keyword", "rationale"],
  },
};

const SYSTEM = `너는 대한민국 ${LAW_NAMES[LAW] ?? LAW} 전문가다. 변리사 수험생용 조문 학습에서, 그 조문에 매핑된 기출 OX '거짓(X)' 지문을 이용해 '빈칸 암기 카드'를 만든다.
거짓 지문은 출제자가 조문의 핵심을 '한 부분 바꿔서'(부정어 추가, 요건·주체·기간·효과 치환 등) 거짓으로 만든 것이다. 그 '바뀐 자리의 올바른 핵심어'가 곧 시험이 노리는 암기 포인트다.
규칙:
1. 주어진 '조문 원문'에서, 그 거짓 지문이 왜곡한 바로 그 핵심 법률어를 '원문에 그대로 나오는 부분 문자열'로 지목한다(keyword). 원문에 없는 표현을 지어내지 마라.
2. ★keyword 는 반드시 '짧은 핵심 법률어 하나'다 — 단일 용어 또는 최소 결정어. 대개 2~10자, 최대 15자.
   좋은 예: "30일", "특허청장", "동의", "등록", "출원일", "정당한 이유", "3개월 이내".
   ★절·문장·서술어구 전체는 절대 금지. 거짓 지문이 뒤집은 '가장 결정적인 한 단어/짧은 구'만 고른다.
3. 거짓의 핵심이 조문 원문에 '짧은 대응 단어'로 존재하지 않으면(판례 법리·다른 조문 쟁점 등) keyword 를 빈 문자열로 둔다. 억지·긴구 금지.`;

async function callTool(userText) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: "user", content: userText }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
      });
      const block = res.content.find((b) => b.type === "tool_use");
      if (block) return block.input;
      throw new Error("no tool_use");
    } catch (e) {
      const s = e?.status ?? 0;
      if (attempt < 4 && (s === 429 || s === 529 || s >= 500)) {
        await new Promise((r) => setTimeout(r, attempt * 4000));
        continue;
      }
      throw e;
    }
  }
}

const placed = new Set();
let done = 0, proposed = 0, notFound = 0, empty = 0, failed = 0;
const samples = [];

async function processOne(t) {
  const a = t.article;
  try {
    const userText = [
      `[조문] ${a.display_label ?? `제${a.article_number}조`}`,
      `[조문 원문]\n${a.text.slice(0, 4000)}`,
      "",
      `[함정(거짓, X) 지문] ${t.body}`,
      t.expl ? `[해설] ${t.expl.slice(0, 800)}` : null,
    ].filter(Boolean).join("\n");
    const out = await callTool(userText);
    const keyword = (out.keyword ?? "").trim();
    if (!keyword) { empty++; return; }
    const pos = a.text.indexOf(keyword);
    if (pos < 0) { notFound++; return; } // verbatim 아님 → 채택 안 함
    const dedup = `${a.article_id}|${keyword}`;
    if (placed.has(dedup)) return;
    placed.add(dedup);
    const cand = {
      article_id: a.article_id,
      law_code: LAW,
      answer: keyword,
      before_context: a.text.slice(Math.max(0, pos - HINT_LEN), pos),
      after_context: a.text.slice(pos + keyword.length, pos + keyword.length + HINT_LEN),
      source_ref_type: t.refType,
      source_ref_id: t.refId,
      source_problem_id: t.problemId,
      source_display_no: displayNo.get(t.problemId) ?? null,
      false_statement: t.body.slice(0, 500),
      rationale: (out.rationale ?? "").slice(0, 500),
    };
    proposed++;
    if (samples.length < 15)
      samples.push({ article: a.display_label ?? a.article_number, keyword, rationale: cand.rationale });
    if (APPLY) {
      const { error } = await c.from("article_blank_candidates").insert(cand);
      if (error && !error.message.includes("duplicate")) throw error;
    }
  } catch (e) {
    failed++;
    console.log(`ERR ${a.article_number} ${String(t.refId).slice(0, 8)} — ${e.message}`);
  } finally {
    done++;
    if (done % 25 === 0)
      console.log(`진행 ${done}/${work.length} · 채택 ${proposed} · 미발견 ${notFound} · 빈 ${empty} · 실패 ${failed}`);
  }
}

let idx = 0;
async function worker() {
  while (idx < work.length) await processOne(work[idx++]);
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n완료 — 채택 ${proposed} · verbatim미발견 ${notFound} · 빈제안 ${empty} · 실패 ${failed} · ${APPLY ? "적재됨" : "DRY-RUN(미적재)"}`);
console.log("\n── 표본 후보 ──");
for (const s of samples)
  console.log(`  ${s.article} · "${s.keyword}" — ${s.rationale}`);
