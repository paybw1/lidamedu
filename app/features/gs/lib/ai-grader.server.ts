// Claude API 기반 GS 답안 채점 초안 생성기.
// 입력: 문제 + 모범답안 + 학생 답안(OCR 텍스트). 출력: 점수(0~maxScore) + 마크다운 피드백.
//
// 환경변수: ANTHROPIC_API_KEY (Vercel 환경변수 / .env)

import Anthropic from "@anthropic-ai/sdk";

import { type RubricCriterion } from "~/features/gs/queries.server";

export interface AiGradingDraft {
  score: number;
  feedback: string;
  reasoning?: string;
  rubricScores?: Record<string, number>; // criterionId → 항목 점수 (rubric 모드일 때만).
}

interface GradeArgs {
  questionTitle: string | null;
  questionBody: string;
  modelAnswer: string | null;
  maxScore: number;
  studentAnswerText: string; // 첨부들의 ocrText 를 합친 것.
  legibilityWarnings?: string[]; // 판독률 부족 등 경고.
  rubric?: RubricCriterion[]; // 비어있지 않으면 항목별 점수 모드.
}

const SYSTEM_PROMPT = `당신은 대한민국 변리사 2차 시험(주관식·논술)의 채점 보조 AI 입니다.
법조문 인용 정확성, 논리 구조, 결론의 타당성, 사실 적용을 종합적으로 평가하여 부분 점수를 산정합니다.
- 모범답안의 핵심 논점이 학생 답안에 포함되어 있는지를 단계별로 검토하세요.
- 단순 키워드 일치가 아니라 논리 흐름과 법리 적용이 적절한지 보세요.
- 학생 답안이 OCR 로 추출된 텍스트라 일부 글자가 깨지거나 누락될 수 있습니다. 판독 불가 영역은
  학생에게 불리하지 않게 가급적 의도를 추정하되, 모범답안 핵심이 명확히 보이지 않으면 감점하세요.
- 점수는 ${"`"}max_score${"`"} 이하의 정수 또는 .5 단위 소수.
- 피드백은 한국어 마크다운. 강점 → 부족한 점 → 개선 방향 순으로 5~10줄.
- 채점은 강사 검토 전 초안이며, 강사가 최종 수정할 수 있습니다.`;

export async function generateGradingDraft(
  args: GradeArgs,
): Promise<AiGradingDraft | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const useRubric = (args.rubric ?? []).length > 0;
  const rubricBlock = useRubric
    ? [
        "",
        `# 채점 항목 (rubric)`,
        ...(args.rubric ?? []).map(
          (c, i) =>
            `${i + 1}. [${c.criterionId}] ${c.label} — 만점 ${c.maxPoints}점${c.descriptionMd ? `\n   ${c.descriptionMd}` : ""}`,
        ),
        "",
        "각 항목별로 0..해당 만점 범위의 점수를 매기세요. 합이 문항 총점이 됩니다.",
      ].join("\n")
    : "";

  // 캐시 가능한 prefix (문제 + 모범답안 + 만점 + rubric) — 같은 회차의 다른 학생 채점 시 재사용.
  // 변동 부분 (학생 답안) 은 마지막에 둬서 prefix-match 캐시 정합.
  const promptPrefix = [
    `# 문제`,
    args.questionTitle ? `## ${args.questionTitle}` : null,
    args.questionBody,
    "",
    `# 모범답안 / 채점 기준`,
    args.modelAnswer ?? "(미입력 — 일반적 변리사 시험 채점 기준에 의거 평가)",
    "",
    `# 만점`,
    `${args.maxScore}점`,
    rubricBlock,
  ]
    .filter(Boolean)
    .join("\n");

  const studentSection = [
    `# 학생 답안 (OCR 추출 텍스트)`,
    args.studentAnswerText.trim() || "(텍스트 추출 실패 — 첨부 이미지 자체에서 직접 판독 필요)",
    args.legibilityWarnings && args.legibilityWarnings.length > 0
      ? `\n⚠️ 판독 경고: ${args.legibilityWarnings.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: {
          type: "json_schema",
          schema: useRubric
            ? {
                type: "object",
                additionalProperties: false,
                properties: {
                  rubric_scores: {
                    type: "object",
                    additionalProperties: { type: "number" },
                    description:
                      "각 채점 항목의 criterionId 를 key 로, 부여 점수(0..max) 를 value 로. 모든 항목 포함.",
                  },
                  feedback: {
                    type: "string",
                    description:
                      "학생에게 보낼 마크다운 피드백. 강점→부족한 점→개선 방향 순.",
                  },
                  reasoning: {
                    type: "string",
                    description:
                      "항목별 점수 산정 근거를 채점자에게 짧게 설명 (참고용).",
                  },
                },
                required: ["rubric_scores", "feedback", "reasoning"],
              }
            : {
                type: "object",
                additionalProperties: false,
                properties: {
                  score: {
                    type: "number",
                    description: `0 이상 ${args.maxScore} 이하의 부분 점수. 정수 또는 .5 단위.`,
                  },
                  feedback: {
                    type: "string",
                    description:
                      "학생에게 보낼 마크다운 피드백. 강점→부족한 점→개선 방향 순.",
                  },
                  reasoning: {
                    type: "string",
                    description: "점수 산정 근거를 채점자에게 짧게 설명 (참고용).",
                  },
                },
                required: ["score", "feedback", "reasoning"],
              },
        },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptPrefix,
              // 같은 회차의 다른 학생 채점 시 prefix 재사용.
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: studentSection,
            },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("Anthropic API error", e.status, e.message);
    } else {
      console.error("AI grading failed", e);
    }
    return null;
  }

  // JSON 응답 파싱 — output_config.format=json_schema 면 첫 text block 이 JSON 문자열.
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    console.error("AI grading: JSON parse failed", textBlock.text.slice(0, 200));
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const feedback = typeof obj.feedback === "string" ? obj.feedback : "";
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : undefined;

  if (useRubric) {
    const raw = obj.rubric_scores;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const rubricScores: Record<string, number> = {};
    let sum = 0;
    for (const c of args.rubric ?? []) {
      const v = (raw as Record<string, unknown>)[c.criterionId];
      const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
      const clamped = Math.max(0, Math.min(c.maxPoints, Math.round(n * 2) / 2));
      rubricScores[c.criterionId] = clamped;
      sum += clamped;
    }
    const total = Math.max(0, Math.min(args.maxScore, Math.round(sum * 2) / 2));
    return { score: total, feedback, reasoning, rubricScores };
  }

  const rawScore = typeof obj.score === "number" ? obj.score : null;
  if (rawScore == null || !Number.isFinite(rawScore)) return null;
  const score = Math.max(0, Math.min(args.maxScore, Math.round(rawScore * 2) / 2));
  return { score, feedback, reasoning };
}
