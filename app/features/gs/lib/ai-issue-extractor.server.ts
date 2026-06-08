// Claude 기반 — gs_questions.model_answer_md 에서 핵심 논점 목록 추출.
// 출력: { label, descriptionMd, importance, refHint? }[].
// 비용 가드: kind='ai_issue_extract' 로 gs_ai_usage 기록 (GS 가드에 자동 합산).

import Anthropic from "@anthropic-ai/sdk";

import {
  recordAiUsage,
  type UsageMeta,
} from "~/features/gs/lib/usage-tracker.server";

const MODEL = "claude-opus-4-7";

export interface ExtractedIssue {
  label: string;
  descriptionMd: string;
  importance: "core" | "side";
  refHint?: string;
}

interface ExtractArgs {
  questionTitle: string | null;
  questionBody: string;
  modelAnswer: string;
  usage?: { meta?: UsageMeta };
}

const SYSTEM_PROMPT = `당신은 대한민국 변리사 2차 시험 답안 분석가입니다. 모범답안 본문에서 \
**채점에 영향을 주는 핵심 논점**을 짧은 라벨 형태로 추출합니다.

규칙:
- 모범답안에 실제로 등장하는 논점만 추출. 추가 발명 금지.
- 한 논점 = 한 줄 라벨 (15자 내외 권장, 최대 30자). 예: "신규성 위반 여부", "출원경과 금반언".
- description_md 는 1~2문장으로 핵심 쟁점/판단 기준을 압축.
- importance:
  - "core" — 빠뜨리면 합격선 미달이 되는 결정적 논점 (보통 2~5개).
  - "side" — 보조·부수 논점 (만점 잡으려면 필요).
- ref_hint 는 모범답안에 직접 인용된 조문/판례 식별자만 (예: "특허법 제29조 제1항 제2호", "대판 2020다1234").
  명시 없으면 비워두세요(추측 금지).
- 추출 개수: 3~8개. 너무 잘게 쪼개지 마세요.`;

export async function extractIssuesFromModelAnswer(
  args: ExtractArgs,
): Promise<ExtractedIssue[] | null> {
  const meta = args.usage?.meta;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await recordAiUsage({
      kind: "ai_issue_extract",
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
    `# 문제`,
    args.questionTitle ? `## ${args.questionTitle}` : null,
    args.questionBody,
    "",
    `# 모범답안`,
    args.modelAnswer,
    "",
    "위 모범답안의 핵심 논점을 JSON 배열로 추출하세요.",
  ]
    .filter(Boolean)
    .join("\n");

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
    console.error("issue extract failed", msg);
    await recordAiUsage({
      kind: "ai_issue_extract",
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
      kind: "ai_issue_extract",
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
      kind: "ai_issue_extract",
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
      kind: "ai_issue_extract",
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
      kind: "ai_issue_extract",
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "no issues array",
    });
    return null;
  }

  const result: ExtractedIssue[] = [];
  for (const it of rawIssues) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const descriptionMd =
      typeof r.description_md === "string" ? r.description_md.trim() : "";
    const importance =
      r.importance === "core" || r.importance === "side" ? r.importance : "core";
    const refHint =
      typeof r.ref_hint === "string" && r.ref_hint.trim().length > 0
        ? r.ref_hint.trim()
        : undefined;
    if (label.length < 2) continue;
    result.push({ label, descriptionMd, importance, refHint });
  }
  if (result.length === 0) {
    await recordAiUsage({
      kind: "ai_issue_extract",
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
    kind: "ai_issue_extract",
    model: MODEL,
    inputTokens,
    outputTokens,
    outcome: "success",
    meta,
  });
  return result;
}
