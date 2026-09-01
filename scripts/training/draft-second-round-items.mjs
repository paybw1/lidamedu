// feat-2-028 Stage 3 — 특허 2차 기출(해설/채점평 보유분) 훈련 항목 + AI 초안 일괄 생성.
// 산출은 전부 draft(승인 큐) — 학생 비노출. 원장 검수·승인 후 공개.
//
//   node --import tsx scripts/training/draft-second-round-items.mjs            # dry-run
//   node --import tsx scripts/training/draft-second-round-items.mjs --apply    # 생성 실행
//   node --import tsx scripts/training/draft-second-round-items.mjs --apply --limit 5
// ★--import tsx 필수 — 인용 가드(citation-guard.ts)를 import 한다.
//
// ★★2026-09-01: 이 생성기가 만든 논점에서 실재하지 않는 사건번호 3건이 발견됐다
//   (2005후3352·2009후3919·2015다257538 — 법리는 맞고 번호만 틀려 읽어서는 안 잡혔다).
//   그래서 발문·해설에 적히지도 않고 DB 에도 없는 번호는 생성 즉시 걷어낸다.
//
// 프롬프트·모델·비용 산정은 앱(ai-case-drafter/conclusion-drafter/pricing)과 동일 유지.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

import { CITATION_PROMPT_RULE, scrubCitations } from "../../app/features/cases/lib/citation-guard.ts";
import { loadKnownCaseNumbers } from "../../app/features/cases/lib/known-case-numbers.server.ts";

const APPLY = process.argv.includes("--apply");
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : Infinity;

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-opus-4-7";
// pricing.ts 와 동일 단가.
const COST = { inputPerM: 5.0, outputPerM: 25.0 };

const ISSUES_SYSTEM = `당신은 대한민국 변리사 2차(주관식) 시험 출제 분석가입니다. \
주어진 기출 발문에서 **답안에 반드시 다뤄야 채점되는 핵심 쟁점**을 짧은 라벨 형태로 추출합니다.

규칙:
- 발문이 실제로 묻는 쟁점만 추출. 해설/채점평이 있으면 근거로 활용하되, 발문과 무관한 쟁점 발명 금지.
- 한 쟁점 = 한 줄 라벨 (15자 내외 권장, 최대 30자). 예: "신규성 위반 여부", "국내우선권주장의 효과".
- description_md 는 1~2문장으로 어떤 판단 기준·법리가 적용되는지 압축.
- importance:
  - "core" — 빠뜨리면 합격선 미달이 되는 결정적 쟁점 (보통 2~5개).
  - "side" — 보조·부수 쟁점.
- ref_hint 는 발문·해설에 명시된 조문/판례 식별자만 (예: "특허법 제29조 제1항"). 명시 없으면 비워두세요(추측 금지).
- 추출 개수: 3~8개. 너무 잘게 쪼개지 마세요.
${CITATION_PROMPT_RULE}`;

const CONCLUSIONS_SYSTEM = `당신은 대한민국 변리사 2차(주관식) 시험 학습 코치입니다. 주어진 기출 \
발문·쟁점들에 대해 각 쟁점의 (a) 모범 결론 방향 (b) 짧은 결론 근거 (c) 권장 비중(weight 0~100, 선택) 을 작성합니다.

규칙:
- direction: 짧은 단어(예: "인정", "부정", "성립", "불성립", "위반", "미위반", "유효", "무효"). 자유 텍스트 가능하지만 짧게.
- rationale_md: 1~2문장. 왜 그 결론인지 핵심 근거(조문·판례 법리).
- weight: 답안에서 권장 비중(0~100). NULL 도 가능(importance 만으로 판정).
  - 권장: core 는 60~80, side 는 10~30 정도. 합산 100 강제 아님.
- 추가 발명 금지. 해설/채점평이 있으면 그 판단을 따르고, 없으면 통설·판례 법리에 따른 표준 결론만.
${CITATION_PROMPT_RULE}`;

async function recordUsage(kind, inputTokens, outputTokens, outcome, meta, reason) {
  const cost =
    (inputTokens / 1_000_000) * COST.inputPerM +
    (outputTokens / 1_000_000) * COST.outputPerM;
  await sb.from("gs_ai_usage").insert({
    kind,
    model: MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
    outcome,
    reason: reason ?? null,
    pages: 0,
  });
}

async function callStructured(system, prompt, schema) {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const inputTokens = Number(res.usage?.input_tokens ?? 0);
  const outputTokens = Number(res.usage?.output_tokens ?? 0);
  const text = res.content.find((b) => b.type === "text");
  return { parsed: text ? JSON.parse(text.text) : null, inputTokens, outputTokens };
}

const ISSUES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    issues: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          description_md: { type: "string" },
          importance: { type: "string", enum: ["core", "side"] },
          ref_hint: { type: "string" },
        },
        required: ["label", "description_md", "importance"],
      },
    },
  },
  required: ["issues"],
};

const CONCLUSIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    conclusions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          issue_id: { type: "string" },
          direction: { type: "string" },
          rationale_md: { type: "string" },
          weight: { type: "integer" },
        },
        required: ["issue_id", "direction", "rationale_md"],
      },
    },
  },
  required: ["conclusions"],
};

// ── 대상 수집 ──
const { data: law } = await sb.from("laws").select("law_id").eq("law_code", "patent").single();
const { data: probs } = await sb
  .from("problems")
  .select("problem_id, year, problem_number, body_md, explanation_md")
  .eq("law_id", law.law_id)
  .eq("exam_round", "second")
  .is("deleted_at", null)
  .order("year")
  .order("problem_number");
const { data: existing } = await sb
  .from("case_training_items")
  .select("problem_id")
  .not("problem_id", "is", null)
  .is("deleted_at", null);
const used = new Set((existing ?? []).map((e) => e.problem_id));
const { data: adminProfile } = await sb
  .from("profiles")
  .select("profile_id")
  .eq("role", "admin")
  .limit(1)
  .single();

// 인용 허용 사건번호 = 우리 DB 수록분(+ 문항별 발문·해설).
const knownCaseNumbers = await loadKnownCaseNumbers(sb);

const targets = (probs ?? [])
  .filter(
    (p) =>
      !used.has(p.problem_id) &&
      (p.body_md ?? "").trim().length >= 30 &&
      (p.explanation_md ?? "").trim().length > 50,
  )
  .slice(0, LIMIT);

console.log(`대상 ${targets.length}문항 (해설 보유·미출제)`);
if (!APPLY) {
  for (const p of targets)
    console.log(` ${p.year} 제${p.problem_number}문 — ${(p.body_md ?? "").replace(/\s+/g, " ").slice(0, 60)}`);
  console.log("dry-run — --apply 로 생성 실행");
  process.exitCode = 0;
} else {
  let ok = 0, fail = 0, totalIn = 0, totalOut = 0;
  for (const p of targets) {
    const label = `${p.year} 제${p.problem_number}문`;
    try {
      // 1) 항목 생성 (draft)
      const { data: item, error: itemErr } = await sb
        .from("case_training_items")
        .insert({
          problem_id: p.problem_id,
          facts_summary_md: "",
          created_by: adminProfile?.profile_id ?? null,
        })
        .select("item_id")
        .single();
      if (itemErr) throw new Error(`item insert: ${itemErr.message}`);

      // 2) 쟁점 초안
      const issuesPrompt = [
        `# 2차 기출 문항`,
        `- 특허법 ${p.year}년 제${p.problem_number}문`,
        "",
        `# 발문`,
        p.body_md,
        "",
        `# 해설/채점평 (근거 자료)`,
        p.explanation_md,
        "",
        "위 발문이 답안에서 요구하는 핵심 쟁점을 JSON 배열로 추출하세요.",
      ].join("\n");
      const issuesRes = await callStructured(ISSUES_SYSTEM, issuesPrompt, ISSUES_SCHEMA);
      totalIn += issuesRes.inputTokens; totalOut += issuesRes.outputTokens;
      await recordUsage("ai_case_issues_draft", issuesRes.inputTokens, issuesRes.outputTokens, "success");
      const issues = (issuesRes.parsed?.issues ?? []).filter((i) => (i.label ?? "").trim().length >= 2);
      if (issues.length === 0) throw new Error("쟁점 0건");

      // ★인용 스크럽 — 이 문항의 발문·해설에 적히지 않고 DB 에도 없는 사건번호는 걷어낸다.
      const citationSource = `${p.body_md ?? ""}\n${p.explanation_md ?? ""}`;
      const leftover = new Set();
      const scrub = (v) => {
        const res = scrubCitations(v ?? "", knownCaseNumbers, citationSource);
        for (const n of res.leftover) leftover.add(n);
        return res.text;
      };

      const rows = issues.map((d, i) => ({
        item_id: item.item_id,
        label: scrub(d.label).trim(),
        description_md: scrub(d.description_md ?? "").trim() || null,
        importance: d.importance === "side" ? "side" : "core",
        ref_hint: scrub(d.ref_hint ?? "").trim() || null,
        order_index: i,
        generated_by: "ai",
        created_by: adminProfile?.profile_id ?? null,
      }));
      const { data: inserted, error: issErr } = await sb
        .from("case_training_issues")
        .insert(rows)
        .select("issue_id, label, description_md, importance, ref_hint");
      if (issErr) throw new Error(`issues insert: ${issErr.message}`);

      // 3) 결론·강약 초안
      const issuesBlock = inserted
        .map((i) => `- [issue_id=${i.issue_id}] (${i.importance}) ${i.label}${i.ref_hint ? ` — ${i.ref_hint}` : ""}\n  ${i.description_md ?? ""}`)
        .join("\n");
      const conclPrompt = [
        `# 2차 기출 문항`,
        `- 특허법 ${p.year}년 2차 제${p.problem_number}문 (기출)`,
        "",
        `# 발문`,
        p.body_md,
        "",
        `# 해설/채점평 (근거 자료)`,
        p.explanation_md,
        "",
        `# 쟁점 목록 (issue_id 그대로 사용)`,
        issuesBlock,
        "",
        "각 쟁점의 결론·권장 비중을 JSON 으로 응답하세요.",
      ].join("\n");
      const conclRes = await callStructured(CONCLUSIONS_SYSTEM, conclPrompt, CONCLUSIONS_SCHEMA);
      totalIn += conclRes.inputTokens; totalOut += conclRes.outputTokens;
      await recordUsage("ai_case_conclusion_draft", conclRes.inputTokens, conclRes.outputTokens, "success");
      const ids = new Set(inserted.map((i) => i.issue_id));
      let applied = 0;
      for (const c of conclRes.parsed?.conclusions ?? []) {
        if (!ids.has(c.issue_id)) continue;
        const w = Number.isInteger(c.weight) ? Math.max(0, Math.min(100, c.weight)) : null;
        const { error } = await sb
          .from("case_training_issues")
          .update({
            weight: w,
            model_conclusion_direction: (c.direction ?? "").trim() || null,
            model_conclusion_md: scrub(c.rationale_md ?? "").trim() || null,
          })
          .eq("issue_id", c.issue_id);
        if (!error) applied++;
      }

      ok++;
      const warn = leftover.size
        ? ` · ⚠근거 없는 인용 잔여 ${[...leftover].join(",")}`
        : "";
      console.log(`OK ${label} — 쟁점 ${inserted.length} · 결론 ${applied}${warn}`);
    } catch (e) {
      fail++;
      console.log(`FAIL ${label}: ${e.message}`);
    }
  }
  const cost = (totalIn / 1e6) * COST.inputPerM + (totalOut / 1e6) * COST.outputPerM;
  console.log(`완료 ${ok} · 실패 ${fail} · 토큰 in ${totalIn}/out ${totalOut} · 비용 ~$${cost.toFixed(2)}`);
  console.log("전부 draft 상태 — /admin/case-training 승인 큐에서 검수·승인 필요");
}
