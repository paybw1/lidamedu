// 판례훈련 §1 — 강사 보조 AI 초안 생성.
// 2 종:
//   (a) draftCaseFactsFromCase — 판례 전문 → 사실관계 요약 (쟁점·판단·결론 제외)
//   (b) draftCaseIssuesFromCase — 판례 전문 → 채점용 쟁점 목록 (core/side)
// 비용 가드: GS usage-tracker 재사용 (kind = ai_case_facts_draft / ai_case_issues_draft).
// 호출 실패/cap/parse 오류 시 null. 호출 측은 강사가 직접 작성하도록 유도.

import Anthropic from "@anthropic-ai/sdk";

import {
  recordAiUsage,
  type UsageMeta,
} from "~/features/gs/lib/usage-tracker.server";

const MODEL = "claude-opus-4-7";

export interface DraftedIssue {
  label: string;
  descriptionMd: string;
  importance: "core" | "side";
  refHint?: string;
}

interface CaseSourceArgs {
  caseTitle: string;
  caseNumber: string;
  court: string;
  decidedAt: string;
  officialTextMd: string;
  usage?: { meta?: UsageMeta };
}

// ============================================================================
// (a) 사실관계 요약 초안 — 누출 방지 시스템 프롬프트
// ============================================================================

const FACTS_SYSTEM_PROMPT = `당신은 대한민국 변리사 시험 판례 학습용 사례 작성자입니다. \
주어진 판례 전문에서 **학생에게 사례로 제시할 사실관계 요약**을 작성합니다.

엄격한 규칙(어김 시 사용 불가):
- 사실관계만 기술. 시간 순서로 누가·언제·무엇을·어떻게 했는지.
- **법원의 판단·판결·결론·법리 적용·쟁점 명시 절대 금지.**
- "법원은 ~ 했다", "판단된다", "쟁점은 ~이다", "결론적으로", "따라서 ~다" 같은 문장 금지.
- "원심", "상고심", "파기 환송" 같은 절차 결과도 금지(사실관계만이 목적).
- 출원·등록·심사·이의·심판·소송 제기 같은 절차 행위 자체는 사실로서 포함 OK.
- 분량: 3~10문장 (200~600자). 학생이 1분 안에 읽을 수 있게.
- 출력 형식: markdown (강조·목록 사용 가능). 단, 판단·결론 표현 없이.`;

export async function draftCaseFactsFromCase(
  args: CaseSourceArgs,
): Promise<string | null> {
  const meta = args.usage?.meta;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await recordAiUsage({
      kind: "ai_case_facts_draft",
      model: MODEL,
      inputTokens: 0,
      outputTokens: 0,
      outcome: "skipped_no_key",
      meta,
      reason: "ANTHROPIC_API_KEY 미설정",
    });
    return null;
  }
  const client = new Anthropic({ apiKey });
  const prompt = [
    `# 판례`,
    `- 사건명: ${args.caseTitle}`,
    `- 사건번호: ${args.caseNumber}`,
    `- 법원/선고일: ${args.court} ${args.decidedAt}`,
    "",
    `# 판례 전문`,
    args.officialTextMd,
    "",
    "위 판례에서 학생용 사실관계 요약을 작성하세요. 쟁점·판단·결론은 제외하고 사실만.",
  ].join("\n");

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: FACTS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    const msg =
      e instanceof Anthropic.APIError
        ? `Anthropic API ${e.status}: ${e.message}`
        : e instanceof Error
          ? e.message
          : String(e);
    await recordAiUsage({
      kind: "ai_case_facts_draft",
      model: MODEL,
      inputTokens: 0,
      outputTokens: 0,
      outcome: "failed",
      meta,
      reason: msg.slice(0, 300),
    });
    return null;
  }

  const inputTokens = Number(response.usage?.input_tokens ?? 0);
  const outputTokens = Number(response.usage?.output_tokens ?? 0);
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    await recordAiUsage({
      kind: "ai_case_facts_draft",
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "no text block",
    });
    return null;
  }
  const text = textBlock.text.trim();
  if (text.length < 20) {
    await recordAiUsage({
      kind: "ai_case_facts_draft",
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "too short",
    });
    return null;
  }
  await recordAiUsage({
    kind: "ai_case_facts_draft",
    model: MODEL,
    inputTokens,
    outputTokens,
    outcome: "success",
    meta,
  });
  return text;
}

// ============================================================================
// (b) 쟁점 목록 초안 — 채점 기준
// ============================================================================

const ISSUES_SYSTEM_PROMPT = `당신은 대한민국 변리사 시험 판례 분석가입니다. \
주어진 판례 전문에서 **채점에 영향을 주는 핵심 쟁점**을 짧은 라벨 형태로 추출합니다.

규칙:
- 판례에 실제로 등장하는 쟁점만 추출. 추가 발명 금지.
- 한 쟁점 = 한 줄 라벨 (15자 내외 권장, 최대 30자). 예: "신규성 위반 여부", "출원경과 금반언".
- description_md 는 1~2문장으로 어떤 판단 기준이 적용되는지 압축.
- importance:
  - "core" — 빠뜨리면 합격선 미달이 되는 결정적 쟁점 (보통 2~5개).
  - "side" — 보조·부수 쟁점.
- ref_hint 는 판례가 인용한 조문/판례 식별자만 (예: "특허법 제29조 제1항", "대판 2020다1234").
  명시 없으면 비워두세요(추측 금지).
- 추출 개수: 3~8개. 너무 잘게 쪼개지 마세요.`;

export async function draftCaseIssuesFromCase(
  args: CaseSourceArgs,
): Promise<DraftedIssue[] | null> {
  const meta = args.usage?.meta;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await recordAiUsage({
      kind: "ai_case_issues_draft",
      model: MODEL,
      inputTokens: 0,
      outputTokens: 0,
      outcome: "skipped_no_key",
      meta,
      reason: "ANTHROPIC_API_KEY 미설정",
    });
    return null;
  }
  const client = new Anthropic({ apiKey });
  const prompt = [
    `# 판례`,
    `- 사건명: ${args.caseTitle}`,
    `- 사건번호: ${args.caseNumber}`,
    `- 법원/선고일: ${args.court} ${args.decidedAt}`,
    "",
    `# 판례 전문`,
    args.officialTextMd,
    "",
    "위 판례의 핵심 쟁점을 JSON 배열로 추출하세요.",
  ].join("\n");

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: {
          type: "json_schema",
          schema: {
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
          },
        },
      },
      system: ISSUES_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    const msg =
      e instanceof Anthropic.APIError
        ? `Anthropic API ${e.status}: ${e.message}`
        : e instanceof Error
          ? e.message
          : String(e);
    await recordAiUsage({
      kind: "ai_case_issues_draft",
      model: MODEL,
      inputTokens: 0,
      outputTokens: 0,
      outcome: "failed",
      meta,
      reason: msg.slice(0, 300),
    });
    return null;
  }

  const inputTokens = Number(response.usage?.input_tokens ?? 0);
  const outputTokens = Number(response.usage?.output_tokens ?? 0);
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    await recordAiUsage({
      kind: "ai_case_issues_draft",
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "no text block",
    });
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    await recordAiUsage({
      kind: "ai_case_issues_draft",
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "JSON parse failed",
    });
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    await recordAiUsage({
      kind: "ai_case_issues_draft",
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "not object",
    });
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const rawIssues = obj.issues;
  if (!Array.isArray(rawIssues) || rawIssues.length === 0) {
    await recordAiUsage({
      kind: "ai_case_issues_draft",
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "no issues array",
    });
    return null;
  }
  const result: DraftedIssue[] = [];
  for (const it of rawIssues) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const descriptionMd =
      typeof r.description_md === "string" ? r.description_md.trim() : "";
    const importance =
      r.importance === "core" || r.importance === "side"
        ? r.importance
        : "core";
    const refHint =
      typeof r.ref_hint === "string" && r.ref_hint.trim().length > 0
        ? r.ref_hint.trim()
        : undefined;
    if (label.length < 2) continue;
    result.push({ label, descriptionMd, importance, refHint });
  }
  if (result.length === 0) {
    await recordAiUsage({
      kind: "ai_case_issues_draft",
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "all issues filtered",
    });
    return null;
  }
  await recordAiUsage({
    kind: "ai_case_issues_draft",
    model: MODEL,
    inputTokens,
    outputTokens,
    outcome: "success",
    meta,
  });
  return result;
}
