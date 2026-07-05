// 민법 정오문제 조문 매칭 2단계 — AI 후보 생성 + 검증 패스 → ox_article_suggestions 적재.
// 신뢰성 설계:
//   · 생성: 지문·해설을 근거로 "직접 근거 조문" 1개 제안(특정 불가 = null 제안)
//   · 검증: 제안 조문의 DB 원문을 가져와 별도 호출로 "직접 근거인가"를 보수 판정 → verified
//   · 자동 반영 없음 — 운영자가 /admin/problems/ox '조문 미매칭' 큐에서 승인해야 노출
// 재실행 안전: 이미 제안 행이 있는 지문은 스킵.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const MODEL = "claude-sonnet-5";
const CONCURRENCY = 5;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: law } = await c.from("laws").select("law_id").eq("law_code", "civil").single();

// 문제(발문) 로드
const probMap = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c
    .from("problems")
    .select("problem_id, year, problem_number, body_md")
    .eq("law_id", law.law_id)
    .is("deleted_at", null)
    .range(from, from + 999);
  for (const p of data) probMap.set(p.problem_id, p);
  if (data.length < 1000) break;
}

// 조문 맵 (number → {id, label, revisionId})
const artMap = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c
    .from("articles")
    .select("article_id, article_number, display_label, current_revision_id")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .range(from, from + 999);
  for (const a of data) artMap.set(a.article_number, a);
  if (data.length < 1000) break;
}

// 조문 원문 텍스트 (revision body_json → 평문)
const articleTextCache = new Map();
async function articleText(num) {
  if (articleTextCache.has(num)) return articleTextCache.get(num);
  const art = artMap.get(num);
  if (!art?.current_revision_id) return null;
  const { data: rev } = await c
    .from("article_revisions")
    .select("body_json")
    .eq("revision_id", art.current_revision_id)
    .single();
  let text = null;
  try {
    const body = typeof rev.body_json === "string" ? JSON.parse(rev.body_json) : rev.body_json;
    text = (body?.blocks ?? [])
      .map((b) => (b.inline ?? []).map((i) => i.text ?? "").join(""))
      .filter(Boolean)
      .join("\n");
  } catch {
    text = null;
  }
  const out = text ? `${art.display_label}\n${text}` : null;
  articleTextCache.set(num, out);
  return out;
}

// 대상 수집 — OX 적격 + 조문 미연결 + 제안 미존재
const pids = [...probMap.keys()];
const targets = [];
async function collect(table, idCol, refType) {
  for (let i = 0; i < pids.length; i += 150) {
    const { data: rows } = await c
      .from(table)
      .select(`${idCol}, problem_id, body_md, explanation_md, ox_truth, ox_ineligible, related_article_id, related_article_number, related_case_number`)
      .in("problem_id", pids.slice(i, i + 150))
      .limit(10000);
    for (const r of rows) {
      if (r.ox_ineligible || !r.ox_truth) continue;
      if (r.related_article_id || r.related_article_number) continue;
      targets.push({ refType, refId: r[idCol], ...r });
    }
  }
}
await collect("problem_choices", "choice_id", "choice");
await collect("problem_box_items", "box_item_id", "box");

const existing = new Set();
for (let i = 0; i < targets.length; i += 150) {
  const { data } = await c
    .from("ox_article_suggestions")
    .select("ref_type, ref_id")
    .in("ref_id", targets.slice(i, i + 150).map((t) => t.refId))
    .limit(1000);
  for (const s of data ?? []) existing.add(`${s.ref_type}:${s.ref_id}`);
}
let queue = targets.filter((t) => !existing.has(`${t.refType}:${t.refId}`));
const LIMIT = Number(process.env.SUGGEST_LIMIT || 0);
if (LIMIT > 0) queue = queue.slice(0, LIMIT);
console.log(`대상 ${targets.length} · 기존 제안 ${existing.size} · 이번 실행 ${queue.length}`);

async function callTool(system, userText, tool, maxTokens = 700) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userText }],
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
      });
      const block = res.content.find((b) => b.type === "tool_use");
      if (block) return block.input;
      throw new Error("no tool_use block");
    } catch (e) {
      const status = e?.status ?? 0;
      if (attempt < 4 && (status === 429 || status === 529 || status >= 500)) {
        await new Promise((r) => setTimeout(r, attempt * 4000));
        continue;
      }
      throw e;
    }
  }
}

const GEN_TOOL = {
  name: "propose_article",
  description: "지문의 정오 판단의 직접 근거가 되는 민법 조문을 제안",
  input_schema: {
    type: "object",
    properties: {
      article_number: {
        type: ["string", "null"],
        description: "민법 조 번호. 예: '126', '826의2'. 특정 불가면 null",
      },
      rationale: { type: "string", description: "한 문장 근거" },
    },
    required: ["article_number", "rationale"],
  },
};
const VERIFY_TOOL = {
  name: "verify_governance",
  description: "조문 원문이 지문의 직접 근거인지 보수 판정",
  input_schema: {
    type: "object",
    properties: {
      governs: { type: "boolean", description: "직접 근거이면 true" },
      reason: { type: "string", description: "한 문장 이유" },
    },
    required: ["governs", "reason"],
  },
};

const GEN_SYSTEM = `너는 대한민국 민법 전문가다. 변리사 수험생이 민법 조문을 읽을 때 그 조문 옆에 관련 정오(O/X) 기출 지문이 표시된다. 주어진 지문을 어느 민법 조문(조 단위)에 배치해야 학습에 적절한지 특정한다.
규칙:
1. 지문이 (a) 특정 민법 조문의 내용·요건·효과를 다루거나 (b) 그 조문에 대한 대법원 판례의 해석·적용을 다루는 경우, 그 조문 번호를 제시한다. 판례 법리도 특정 조문의 해석이면 그 조문에 배치하는 것이 맞다.
2. 특정 조문에 귀속시키기 어려운 경우 — 일반 법리(신의칙 제외)·증명책임 분배·법률행위 해석론·타법(주택임대차보호법·부동산실명법·국토계획법·집합건물법·근로기준법 등)이 규율하는 사안 — 에는 article_number 를 null 로 한다. 억지로 붙이는 것이 가장 나쁘다.
3. 민법이 아닌 다른 법률의 조문 번호는 절대 제시하지 않는다.
4. 여러 조문이 걸치면 지문의 핵심 쟁점 1개 조문만 제시한다.
5. 번호 형식은 숫자만: "126", "826의2" 처럼. "제"나 "조"를 붙이지 않는다.`;

const VERIFY_SYSTEM = `민법 조문 원문과 기출 정오(O/X) 지문이 주어진다. 수험생이 이 조문을 읽을 때 옆에 이 지문이 기출 확인용으로 표시된다. 배치가 적절한지 판정하라.
· 지문이 이 조문의 제도·내용·요건·효과를 다루거나, 이 조문에 대한 대법원 판례의 해석·적용을 다루면 governs=true. (정오의 근거가 판례 법리라도 그 판례가 이 조문을 해석한 것이면 true)
· 지문의 핵심 쟁점이 다른 조문의 제도이거나, 타법이 규율하는 사안이거나, 이 조문과의 연결이 수험생에게 어색하게 느껴질 정도로 간접적이면 governs=false.
· 확신이 없으면 false.`;

let done = 0, proposedArt = 0, proposedNull = 0, verifiedTrue = 0, failed = 0;
async function processOne(t) {
  const prob = probMap.get(t.problem_id);
  const tag = `${prob?.year}#${prob?.problem_number}`;
  try {
    const userText = [
      `[문제 발문] ${prob?.body_md ?? ""}`,
      `[지문] ${t.body_md}`,
      `[정답] ${t.ox_truth}`,
      t.explanation_md ? `[해설] ${t.explanation_md}` : null,
      t.related_case_number ? `[해설이 인용한 판례] ${t.related_case_number}` : null,
    ].filter(Boolean).join("\n\n");

    const gen = await callTool(GEN_SYSTEM, userText, GEN_TOOL);
    let num = gen.article_number ? String(gen.article_number).replace(/[제조\s]/g, "") : null;
    if (num && !artMap.has(num)) num = null; // DB에 없는 조문 = 특정 실패로 처리

    let verified = false;
    let rationale = gen.rationale ?? "";
    if (num) {
      proposedArt++;
      const artText = await articleText(num);
      if (artText) {
        const v = await callTool(
          VERIFY_SYSTEM,
          `[조문 원문]\n${artText}\n\n[지문] ${t.body_md}\n[정답] ${t.ox_truth}${t.explanation_md ? `\n[해설] ${t.explanation_md}` : ""}`,
          VERIFY_TOOL,
        );
        verified = v.governs === true;
        if (verified) verifiedTrue++;
        rationale = `${rationale} / 검증: ${v.reason ?? ""}`.slice(0, 500);
      }
    } else {
      proposedNull++;
    }

    const { error } = await c.from("ox_article_suggestions").insert({
      ref_type: t.refType,
      ref_id: t.refId,
      problem_id: t.problem_id,
      law_code: "civil",
      suggested_article_number: num,
      rationale,
      verified,
    });
    if (error && !error.message.includes("duplicate")) throw error;
  } catch (e) {
    failed++;
    console.log(`ERR ${tag} ${t.refType}:${t.refId.slice(0, 8)} — ${e.message}`);
  } finally {
    done++;
    if (done % 25 === 0)
      console.log(`진행 ${done}/${queue.length} · 조문제안 ${proposedArt}(검증통과 ${verifiedTrue}) · null ${proposedNull} · 실패 ${failed}`);
  }
}

// 단순 워커 풀
let idx = 0;
async function worker() {
  while (idx < queue.length) {
    const t = queue[idx++];
    await processOne(t);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`완료 — 총 ${done} · 조문제안 ${proposedArt}(검증통과 ${verifiedTrue}) · 특정불가 ${proposedNull} · 실패 ${failed}`);
