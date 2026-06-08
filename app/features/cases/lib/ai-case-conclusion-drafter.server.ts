// 강사 §1 — 쟁점 목록에서 모범 결론·권장 강약(weight) 일괄 초안.
// 호출: 한 항목의 승인된 쟁점들을 한 번에 넣어 결과 N건 반환.
// 비용 가드: ai_case_conclusion_draft.

import Anthropic from "@anthropic-ai/sdk";

import {
  recordAiUsage,
  type UsageMeta,
} from "~/features/gs/lib/usage-tracker.server";

const MODEL = "claude-opus-4-7";

export interface DraftedConclusion {
  issueId: string;
  modelConclusionDirection: string;
  modelConclusionMd: string;
  weight: number | null;
}

interface DraftArgs {
  caseTitle: string;
  caseNumber: string;
  factsSummaryMd: string;
  officialTextMd: string;
  issues: Array<{
    issueId: string;
    label: string;
    descriptionMd: string | null;
    importance: "core" | "side";
    refHint: string | null;
  }>;
  usage?: { meta?: UsageMeta };
}

const SYSTEM_PROMPT = `당신은 대한민국 변리사 시험 판례 학습 코치입니다. 주어진 판례·쟁점들에 \
대해 각 쟁점의 (a) 모범 결론 방향 (b) 짧은 결론 근거 (c) 권장 비중(weight 0~100, 선택) 을 작성합니다.

규칙:
- direction: 짧은 단어(예: "인정", "부정", "성립", "불성립", "위반", "미위반", "유효", "무효"). 자유 텍스트 가능하지만 짧게.
- rationale_md: 1~2문장. 왜 그 결론인지 핵심 근거.
- weight: 답안에서 권장 비중(0~100). NULL 도 가능(importance 만으로 판정).
  - 권장: core 는 60~80, side 는 10~30 정도. 합산 100 강제 아님.
- 추가 발명 금지. 판례 전문에 등장한 판단/결론만.`;

export async function draftCaseConclusionsFromIssues(
  args: DraftArgs,
): Promise<DraftedConclusion[] | null> {
  const meta = args.usage?.meta;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await recordAiUsage({
      kind: "ai_case_conclusion_draft",
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
  const issuesBlock = args.issues
    .map(
      (i) =>
        `- [issue_id=${i.issueId}] (${i.importance}) ${i.label}${i.refHint ? ` — ${i.refHint}` : ""}\n  ${i.descriptionMd ?? ""}`,
    )
    .join("\n");
  const prompt = [
    `# 판례`,
    `- ${args.caseTitle} (${args.caseNumber})`,
    "",
    `# 사실관계`,
    args.factsSummaryMd || "(미설정)",
    "",
    `# 판례 전문 (요약 가능)`,
    args.officialTextMd,
    "",
    `# 쟁점 목록 (issue_id 그대로 사용)`,
    issuesBlock,
    "",
    "각 쟁점의 결론·권장 비중을 JSON 으로 응답하세요.",
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
          },
        },
      },
      system: SYSTEM_PROMPT,
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
      kind: "ai_case_conclusion_draft",
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
      kind: "ai_case_conclusion_draft",
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
      kind: "ai_case_conclusion_draft",
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
      kind: "ai_case_conclusion_draft",
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
  const raw = Array.isArray(obj.conclusions) ? obj.conclusions : [];
  const idSet = new Set(args.issues.map((i) => i.issueId));
  const result: DraftedConclusion[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const issueId = typeof o.issue_id === "string" ? o.issue_id : "";
    if (!idSet.has(issueId)) continue;
    const direction =
      typeof o.direction === "string" ? o.direction.trim() : "";
    if (!direction) continue;
    const rationaleMd =
      typeof o.rationale_md === "string" ? o.rationale_md.trim() : "";
    const weight =
      typeof o.weight === "number" && o.weight >= 0 && o.weight <= 100
        ? Math.round(o.weight)
        : null;
    result.push({
      issueId,
      modelConclusionDirection: direction,
      modelConclusionMd: rationaleMd,
      weight,
    });
  }
  if (result.length === 0) {
    await recordAiUsage({
      kind: "ai_case_conclusion_draft",
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "no conclusions",
    });
    return null;
  }
  await recordAiUsage({
    kind: "ai_case_conclusion_draft",
    model: MODEL,
    inputTokens,
    outputTokens,
    outcome: "success",
    meta,
  });
  return result;
}
