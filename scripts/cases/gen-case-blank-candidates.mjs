// feat-2-029 S4 — 판례 빈칸 후보 생성. 판례에 연결된 기출 OX '거짓(X)' 지문에서
//   "무엇을 바꿔 거짓으로 만들었나"(=시험 함정어)를 AI가 요지/판시 원문의 verbatim substring 으로
//   도출 → case_blank_candidates 적재(운영자 승인 대기, S5).
// 신뢰성: keyword 는 반드시 지정 텍스트의 부분 문자열이어야 채택(구조 검증). 아니면 skip.
// 재실행 안전: 같은 source_ref 후보가 있으면 skip. (case,target,item,answer) 중복도 skip.
//
//   node scripts/cases/gen-case-blank-candidates.mjs           # dry-run(적재 안 함, 출력만)
//   node scripts/cases/gen-case-blank-candidates.mjs --apply   # case_blank_candidates 적재
//   CASE_LIMIT=3 node scripts/cases/gen-case-blank-candidates.mjs   # 앞 N개 케이스만
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const MODEL = "claude-sonnet-5";
const CONCURRENCY = 4;
const APPLY = process.argv.includes("--apply");
const CASE_LIMIT = Number(process.env.CASE_LIMIT || 0);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── 1. 특허 판례(요지 있음) 로드 ──
let cases = [];
for (let from = 0; ; from += 500) {
  const { data } = await c
    .from("cases")
    .select("case_id, case_number, summary_items, reasoning_md")
    .contains("subject_laws", ["patent"])
    .is("deleted_at", null)
    .range(from, from + 499);
  if (!data?.length) break;
  for (const k of data) {
    const items = Array.isArray(k.summary_items) ? k.summary_items : [];
    if (items.length > 0) cases.push({ ...k, summaryItems: items });
  }
  if (data.length < 500) break;
}
if (CASE_LIMIT > 0) cases = cases.slice(0, CASE_LIMIT);
const caseById = new Map(cases.map((k) => [k.case_id, k]));

// ── 2. 케이스별 연결 기출의 거짓(X) 지문 수집 ──
const caseIds = cases.map((k) => k.case_id);
const linksByCase = new Map(); // case_id -> problem_id[]
const problemIds = new Set();
for (let i = 0; i < caseIds.length; i += 150) {
  const { data } = await c
    .from("problem_case_links")
    .select("case_id, problem_id")
    .in("case_id", caseIds.slice(i, i + 150));
  for (const l of data ?? []) {
    if (!linksByCase.has(l.case_id)) linksByCase.set(l.case_id, []);
    linksByCase.get(l.case_id).push(l.problem_id);
    problemIds.add(l.problem_id);
  }
}
const pids = [...problemIds];
// 문제 display_no
const displayNo = new Map();
for (let i = 0; i < pids.length; i += 200) {
  const { data } = await c
    .from("problems")
    .select("problem_id, display_no")
    .in("problem_id", pids.slice(i, i + 200));
  for (const p of data ?? []) displayNo.set(p.problem_id, p.display_no);
}
// 거짓 지문(choice/box) — ox_truth='X', 적격.
const falseByProblem = new Map(); // problem_id -> [{refType,refId,body,expl}]
async function collectFalse(table, idCol, refType) {
  for (let i = 0; i < pids.length; i += 150) {
    const { data } = await c
      .from(table)
      .select(`${idCol}, problem_id, body_md, explanation_md, ox_truth, ox_ineligible`)
      .in("problem_id", pids.slice(i, i + 150))
      .eq("ox_truth", "X")
      .limit(5000);
    for (const r of data ?? []) {
      if (r.ox_ineligible) continue;
      if (!falseByProblem.has(r.problem_id)) falseByProblem.set(r.problem_id, []);
      falseByProblem.get(r.problem_id).push({
        refType,
        refId: r[idCol],
        body: r.body_md ?? "",
        expl: r.explanation_md ?? "",
      });
    }
  }
}
await collectFalse("problem_choices", "choice_id", "choice");
await collectFalse("problem_box_items", "box_item_id", "box");

// 작업 큐 — (case, 거짓지문) 페어.
const queue = [];
for (const k of cases) {
  const probs = linksByCase.get(k.case_id) ?? [];
  for (const pid of probs) {
    for (const f of falseByProblem.get(pid) ?? []) {
      queue.push({ case: k, problemId: pid, ...f });
    }
  }
}

// 이미 후보 있는 source_ref skip(재실행 안전).
const existing = new Set();
{
  const refIds = queue.map((q) => q.refId);
  for (let i = 0; i < refIds.length; i += 150) {
    const { data } = await c
      .from("case_blank_candidates")
      .select("source_ref_id")
      .in("source_ref_id", refIds.slice(i, i + 150));
    for (const r of data ?? []) existing.add(r.source_ref_id);
  }
}
let work = queue.filter((q) => !existing.has(q.refId));
console.log(
  `케이스 ${cases.length} · 거짓지문 페어 ${queue.length} · 기존후보 ${existing.size} · 이번 ${work.length} · ${APPLY ? "APPLY" : "DRY-RUN"}`,
);

const TOOL = {
  name: "propose_case_blank",
  description:
    "판례에 연결된 기출 OX '거짓' 지문이 무엇을 바꿔 거짓이 됐는지 보고, 그 함정에 해당하는 핵심 법리어를 판례 요지/판시 원문에서 verbatim 으로 지목",
  input_schema: {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description:
          "요지/판시 '원문에 그대로 존재하는' 짧은 핵심 법률어 하나(빈칸 정답). 단일 용어~짧은 구, 대개 2~10자·최대 15자. 절/문장/서술어구 전체 금지. 적절한 짧은 단어가 없으면 빈 문자열.",
      },
      target: {
        type: "string",
        enum: ["summary", "reasoning"],
        description: "keyword 가 있는 텍스트 — 판결요지(summary) 또는 판시이유(reasoning)",
      },
      item_index: {
        type: "integer",
        description: "target=summary 일 때 몇 번째 요지 항목(0-based). reasoning 이면 0.",
      },
      rationale: {
        type: "string",
        description: "이 거짓 지문이 무엇을 바꿔(부정·치환 등) 거짓이 됐는지 한 문장.",
      },
    },
    required: ["keyword", "target", "item_index", "rationale"],
  },
};

const SYSTEM = `너는 대한민국 특허법 전문가다. 변리사 수험생용 판례 학습에서, 그 판례에 연결된 기출 OX '거짓(X)' 지문을 이용해 '빈칸 암기 카드'를 만든다.
거짓 지문은 출제자가 판례의 핵심 법리를 '한 부분 바꿔서'(부정어 추가, 요건·주체·효과 치환 등) 거짓으로 만든 것이다. 그 '바뀐 자리의 올바른 핵심어'가 곧 시험이 노리는 암기 포인트다.
규칙:
1. 주어진 판례 '요지/판시 원문'에서, 그 거짓 지문이 왜곡한 바로 그 핵심 법리어를 '원문에 그대로 나오는 부분 문자열'로 지목한다(keyword). 원문에 없는 표현을 지어내지 마라.
2. ★keyword 는 반드시 '짧은 핵심 법률어 하나'다 — 단일 용어 또는 최소 결정어. 대개 2~10자, 최대 15자.
   좋은 예: "신규성", "진보성", "산업상 이용가능성", "적법", "기재불비", "동의", "전용실시권자", "확대된 선출원".
   ★절·문장·서술어구 전체는 절대 금지. 예: "그 명세서의 기재는 적법하다"(X) → "적법" 또는 "기재불비"(O).
   거짓 지문이 뒤집은 '가장 결정적인 한 단어'만 고른다. 그 짧은 단어가 원문에 그대로 있어야 한다.
3. 그 keyword 가 요지에 있으면 target='summary' 와 정확한 item_index, 판시이유에 있으면 target='reasoning'.
4. 거짓의 핵심이 판례 원문에 '짧은 대응 단어'로 존재하지 않으면 keyword 를 빈 문자열로 둔다(억지·긴구 금지).`;

async function callTool(userText) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 500,
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

function holdingContext(k) {
  const parts = ["[판례] " + k.case_number, "[판결요지]"];
  k.summaryItems.forEach((it, i) => parts.push(`[${i}] ${it.body ?? ""}`));
  if (k.reasoning_md) parts.push("[판시이유]\n" + k.reasoning_md.slice(0, 1500));
  return parts.join("\n");
}

// (case,target,item,answer) 중복 방지(이번 실행 내 + 곧 insert 예정).
const placed = new Set();
let done = 0, proposed = 0, notFound = 0, empty = 0, failed = 0;
const samples = [];

async function processOne(t) {
  const k = t.case;
  try {
    const userText = [
      holdingContext(k),
      "",
      `[함정(거짓, X) 지문] ${t.body}`,
      t.expl ? `[해설] ${t.expl}` : null,
    ].filter(Boolean).join("\n");
    const out = await callTool(userText);
    const keyword = (out.keyword ?? "").trim();
    if (!keyword) { empty++; return; }
    const target = out.target === "reasoning" ? "reasoning" : "summary";
    const itemIndex = target === "summary" ? Math.max(0, Number(out.item_index) || 0) : 0;
    const text =
      target === "summary"
        ? (k.summaryItems[itemIndex]?.body ?? "")
        : (k.reasoning_md ?? "");
    const pos = text.indexOf(keyword);
    if (pos < 0) { notFound++; return; } // verbatim 아님 → 채택 안 함
    const dedup = `${k.case_id}|${target}|${itemIndex}|${keyword}`;
    if (placed.has(dedup)) return;
    placed.add(dedup);
    const before = text.slice(Math.max(0, pos - 30), pos);
    const after = text.slice(pos + keyword.length, pos + keyword.length + 30);
    const cand = {
      case_id: k.case_id,
      target,
      item_index: target === "summary" ? itemIndex : null,
      answer: keyword,
      before_context: before,
      after_context: after,
      cum_offset: pos,
      source_ref_type: t.refType,
      source_ref_id: t.refId,
      source_problem_id: t.problemId,
      source_display_no: displayNo.get(t.problemId) ?? null,
      false_statement: t.body.slice(0, 500),
      rationale: (out.rationale ?? "").slice(0, 500),
    };
    proposed++;
    if (samples.length < 15) samples.push({ case: k.case_number, keyword, target, itemIndex, rationale: cand.rationale });
    if (APPLY) {
      const { error } = await c.from("case_blank_candidates").insert(cand);
      if (error && !error.message.includes("duplicate")) throw error;
    }
  } catch (e) {
    failed++;
    console.log(`ERR ${k.case_number} ${t.refId.slice(0, 8)} — ${e.message}`);
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
  console.log(`  ${s.case} · [${s.target}${s.target === "summary" ? "#" + s.itemIndex : ""}] "${s.keyword}" — ${s.rationale}`);
