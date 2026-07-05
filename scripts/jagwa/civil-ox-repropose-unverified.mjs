// 민법 정오문제 조문 매칭 — 검증 거부(unverified) 제안 2차 패스.
// 1차 검증기의 거부 사유를 피드백으로 주고 재제안 → 재검증.
// 신뢰성 가드:
//   · 같은 조문 재제안 = 재검증하지 않고 그대로 둔다(검증 반복 굴리기 방지, 운영자 몫)
//   · 다른 조문 재제안 + 재검증 통과 → 기존 일괄 승인과 동일하게 연결(.is null 가드)
//   · null 재제안(조문 특정 불가 전환) → 제안만 갱신, 연결 없음(운영자 '조문 없음' 확정 대상)
//   · 사전 백업 + 사후 재집계
import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const MODEL = "claude-sonnet-5";
const CONCURRENCY = 5;
const ADMIN_ID = "e20ac99a-bfa6-4862-94dd-23c063189463"; // 일괄 처리 지시자(임병웅 admin)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: law } = await c.from("laws").select("law_id").eq("law_code", "civil").single();
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
  } catch { text = null; }
  const out = text ? `${art.display_label}\n${text}` : null;
  articleTextCache.set(num, out);
  return out;
}

// 대상 — 검증 거부 + pending + 조문 제안 있음
const targets = [];
for (let from = 0; ; from += 1000) {
  const { data } = await c
    .from("ox_article_suggestions")
    .select("suggestion_id, ref_type, ref_id, problem_id, suggested_article_number, rationale")
    .eq("law_code", "civil")
    .eq("verified", false)
    .eq("status", "pending")
    .not("suggested_article_number", "is", null)
    .order("suggestion_id")
    .range(from, from + 999);
  targets.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
console.log("2차 패스 대상(검증 거부·pending):", targets.length);
writeFileSync("tmp/jagwa/civil-ox-repropose-backup.json", JSON.stringify(targets, null, 1));

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
  description: "지문의 배치에 적절한 민법 조문을 재제안",
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
  description: "조문 원문이 지문의 배치처로 적절한지 보수 판정",
  input_schema: {
    type: "object",
    properties: {
      governs: { type: "boolean", description: "적절하면 true" },
      reason: { type: "string", description: "한 문장 이유" },
    },
    required: ["governs", "reason"],
  },
};

const GEN2_SYSTEM = `너는 대한민국 민법 전문가다. 변리사 수험생이 민법 조문을 읽을 때 그 조문 옆에 관련 정오(O/X) 기출 지문이 표시된다. 주어진 지문을 어느 민법 조문(조 단위)에 배치해야 학습에 적절한지 특정한다.
이전에 제안된 조문이 검증에서 거부되었다. 거부 사유를 반영해 더 적절한 조문을 다시 특정하라. 거부 사유가 다른 조문을 지목하면 그 조문을 우선 검토하라.
규칙:
1. 지문이 (a) 특정 민법 조문의 내용·요건·효과를 다루거나 (b) 그 조문에 대한 대법원 판례의 해석·적용을 다루는 경우, 그 조문 번호를 제시한다.
2. 특정 조문에 귀속시키기 어려운 경우(일반 법리·증명책임·법률행위 해석론·타법 사안)에는 article_number 를 null 로 한다. 억지로 붙이는 것이 가장 나쁘다.
3. 민법이 아닌 다른 법률의 조문 번호는 절대 제시하지 않는다.
4. 번호 형식은 숫자만: "126", "826의2" 처럼.`;

const VERIFY_SYSTEM = `민법 조문 원문과 기출 정오(O/X) 지문이 주어진다. 수험생이 이 조문을 읽을 때 옆에 이 지문이 기출 확인용으로 표시된다. 배치가 적절한지 판정하라.
· 지문이 이 조문의 제도·내용·요건·효과를 다루거나, 이 조문에 대한 대법원 판례의 해석·적용을 다루면 governs=true. (정오의 근거가 판례 법리라도 그 판례가 이 조문을 해석한 것이면 true)
· 지문의 핵심 쟁점이 다른 조문의 제도이거나, 타법이 규율하는 사안이거나, 이 조문과의 연결이 수험생에게 어색하게 느껴질 정도로 간접적이면 governs=false.
· 확신이 없으면 false.`;

let done = 0, connected = 0, toNull = 0, samePropose = 0, stillUnverified = 0, failed = 0;

async function processOne(t) {
  try {
    const table = t.ref_type === "choice" ? "problem_choices" : "problem_box_items";
    const idCol = t.ref_type === "choice" ? "choice_id" : "box_item_id";
    const { data: item } = await c
      .from(table)
      .select(`${idCol}, body_md, explanation_md, ox_truth, related_article_id`)
      .eq(idCol, t.ref_id)
      .single();
    if (!item || item.related_article_id) return; // 이미 연결됨 — 건너뜀

    const { data: prob } = await c
      .from("problems")
      .select("body_md")
      .eq("problem_id", t.problem_id)
      .single();

    const userText = [
      `[문제 발문] ${prob?.body_md ?? ""}`,
      `[지문] ${item.body_md}`,
      `[정답] ${item.ox_truth}`,
      item.explanation_md ? `[해설] ${item.explanation_md}` : null,
      `[이전 제안] 제${t.suggested_article_number}조`,
      `[검증 거부 사유] ${t.rationale ?? ""}`,
    ].filter(Boolean).join("\n\n");

    const gen = await callTool(GEN2_SYSTEM, userText, GEN_TOOL);
    let num = gen.article_number ? String(gen.article_number).replace(/[제조\s]/g, "") : null;
    if (num && !artMap.has(num)) num = null;

    if (num === t.suggested_article_number) {
      // 같은 조문 고집 — 재검증 굴리기 방지, 운영자 몫으로 그대로 둔다.
      samePropose++;
      return;
    }

    if (num === null) {
      // 조문 특정 불가로 전환 — 제안만 갱신(연결 없음).
      await c.from("ox_article_suggestions").update({
        suggested_article_number: null,
        rationale: `[2차] ${gen.rationale ?? ""}`.slice(0, 500),
        verified: false,
      }).eq("suggestion_id", t.suggestion_id);
      toNull++;
      return;
    }

    // 다른 조문 재제안 — 재검증.
    const artText = await articleText(num);
    let verified = false;
    let reason = "";
    if (artText) {
      const v = await callTool(
        VERIFY_SYSTEM,
        `[조문 원문]\n${artText}\n\n[지문] ${item.body_md}\n[정답] ${item.ox_truth}${item.explanation_md ? `\n[해설] ${item.explanation_md}` : ""}`,
        VERIFY_TOOL,
      );
      verified = v.governs === true;
      reason = v.reason ?? "";
    }
    const rationale = `[2차] ${gen.rationale ?? ""} / 검증: ${reason}`.slice(0, 500);

    if (!verified) {
      await c.from("ox_article_suggestions").update({
        suggested_article_number: num,
        rationale,
        verified: false,
      }).eq("suggestion_id", t.suggestion_id);
      stillUnverified++;
      return;
    }

    // 재검증 통과 — 기존 일괄 승인과 동일 처리(연결 + approved).
    const { data: updated, error } = await c
      .from(table)
      .update({
        related_article_id: artMap.get(num).article_id,
        related_article_number: num,
      })
      .eq(idCol, t.ref_id)
      .is("related_article_id", null)
      .select(idCol);
    if (error) throw error;
    if ((updated ?? []).length === 0) return; // 경합 — 이미 연결됨
    await c.from("ox_article_suggestions").update({
      suggested_article_number: num,
      rationale,
      verified: true,
      status: "approved",
      decided_by: ADMIN_ID,
      decided_at: new Date().toISOString(),
    }).eq("suggestion_id", t.suggestion_id);
    connected++;
  } catch (e) {
    failed++;
    console.log("ERR", t.suggestion_id, e.message);
  } finally {
    done++;
    if (done % 25 === 0)
      console.log(`진행 ${done}/${targets.length} · 연결 ${connected} · null전환 ${toNull} · 동일고집 ${samePropose} · 재거부 ${stillUnverified} · 실패 ${failed}`);
  }
}

let idx = 0;
async function worker() {
  while (idx < targets.length) await processOne(targets[idx++]);
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`완료 — 총 ${done} · 연결 ${connected} · 특정불가 전환 ${toNull} · 동일 조문 고집(보류) ${samePropose} · 재거부(보류) ${stillUnverified} · 실패 ${failed}`);

// 사후 재집계
const { data: probs } = await c.from("problems").select("problem_id").eq("law_id", law.law_id).is("deleted_at", null).limit(2000);
const pids = probs.map((p) => p.problem_id);
let eligible = 0, withArtCnt = 0;
for (const table of ["problem_choices", "problem_box_items"]) {
  for (let i = 0; i < pids.length; i += 150) {
    const { data: rows } = await c
      .from(table)
      .select("ox_truth, ox_ineligible, related_article_id")
      .in("problem_id", pids.slice(i, i + 150))
      .limit(10000);
    for (const r of rows ?? []) {
      if (r.ox_ineligible || !r.ox_truth) continue;
      eligible++;
      if (r.related_article_id) withArtCnt++;
    }
  }
}
console.log(`재집계 — 적격 ${eligible} 중 조문 연결 ${withArtCnt} (${Math.round((withArtCnt / eligible) * 100)}%)`);
