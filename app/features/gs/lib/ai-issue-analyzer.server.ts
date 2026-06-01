// Claude 기반 — 학생 자유 서술 논점 ↔ 모범 논점 의미 매칭.
//
// 원칙:
//   1) 표현이 달라도 같은 논점이면 match (예: "신규성 위반" ↔ "제29조 제1항").
//   2) AI 는 단정하지 않는다 — "AI 보기엔 …일 가능성" 정도의 어조.
//   3) 학생 최종 판단은 자기채점. AI 는 보조.
//
// 비용 가드: kind='ai_issue_analyze' 로 GS cap 합산.

import Anthropic from "@anthropic-ai/sdk";

import type { QuestionIssue } from "~/features/gs/queries-issues.server";
import {
  recordAiUsage,
  type UsageMeta,
} from "~/features/gs/lib/usage-tracker.server";

const MODEL = "claude-opus-4-7";

export interface IssueAnalysisHit {
  issueId: string;
  evidence?: string;
}
export interface IssueAnalysisMissed {
  issueId: string;
  severity: "core" | "side";
}
export interface IssueAnalysisResult {
  hits: IssueAnalysisHit[];
  missed: IssueAnalysisMissed[];
  extras: string[]; // 모범에 없는데 학생이 적은 개념 — 사람 판단 필요
  reasoning?: string;
}

interface AnalyzeArgs {
  questionTitle: string | null;
  questionBody: string;
  masterIssues: QuestionIssue[];
  studentIssuesMd: string;
  usage?: { meta?: UsageMeta };
}

const SYSTEM_PROMPT = `당신은 대한민국 변리사 2차 답안 분석 보조입니다. 학생이 자유 서술로 적은 "논점" 메모를 \
승인된 모범 논점 목록과 의미 단위로 대조합니다.

원칙:
- **표현이 달라도 같은 논점이면 짚었다고(hit) 판단**. 예: "신규성 위반" ≈ "제29조 제1항" ≈ "공지된 발명과 동일성".
- 학생이 명백히 다른 의미로 적었다면 hit 처리 금지.
- **단정 금지**. 항상 보조 의견의 어조 ("…일 가능성이 있어 보입니다", "확인해보세요").
- 학생이 적은 줄 중 모범에 매칭되지 않는 내용은 extras 에 짧게 (모범과 무관한 자작 — 사람이 다시 판단해야 함).
- 한 학생 줄이 여러 모범과 겹쳐 보이면 가장 가까운 1개에만 hit. 나머지는 missed 로 가능 (학생의 누락 판정은 사람이 최종).
- reasoning: 채점자에게 짧은 근거. 학생에겐 직접 보이지 않을 수 있음.

출력 JSON 스키마는 호출 측이 정의합니다. 모범 논점 목록의 issue_id 만 사용하세요.`;

export async function analyzeIssueExtraction(
  args: AnalyzeArgs,
): Promise<IssueAnalysisResult | null> {
  const meta = args.usage?.meta;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await recordAiUsage({
      kind: "ai_issue_analyze",
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

  const masterBlock = args.masterIssues
    .map(
      (m) =>
        `- [issue_id=${m.issueId}] (${m.importance === "core" ? "핵심" : "부차"}) ${m.label}${m.refHint ? ` — ${m.refHint}` : ""}\n  ${m.descriptionMd ?? ""}`,
    )
    .join("\n");

  const prompt = [
    `# 사례`,
    args.questionTitle ? `## ${args.questionTitle}` : null,
    args.questionBody,
    "",
    `# 모범 논점 목록 (issue_id 사용)`,
    masterBlock,
    "",
    `# 학생이 적은 논점 메모 (자유 서술)`,
    args.studentIssuesMd.trim() || "(빈 답안)",
    "",
    "위 학생 메모가 모범 논점들 중 어느 것을 짚었는지, 빠뜨렸는지, 모범 밖의 자작인지를 의미 단위로 판정해 JSON 으로 응답하세요.",
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
              hits: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    issue_id: { type: "string" },
                    evidence: { type: "string", maxLength: 200 },
                  },
                  required: ["issue_id"],
                },
              },
              missed: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    issue_id: { type: "string" },
                    severity: { type: "string", enum: ["core", "side"] },
                  },
                  required: ["issue_id", "severity"],
                },
              },
              extras: {
                type: "array",
                items: { type: "string", maxLength: 100 },
              },
              reasoning: { type: "string", maxLength: 800 },
            },
            required: ["hits", "missed", "extras"],
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
    console.error("issue analyze failed", msg);
    await recordAiUsage({
      kind: "ai_issue_analyze",
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
      kind: "ai_issue_analyze",
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
      kind: "ai_issue_analyze",
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
      kind: "ai_issue_analyze",
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
  const validIds = new Set(args.masterIssues.map((m) => m.issueId));

  function parseHits(raw: unknown): IssueAnalysisHit[] {
    if (!Array.isArray(raw)) return [];
    const out: IssueAnalysisHit[] = [];
    for (const it of raw) {
      if (!it || typeof it !== "object") continue;
      const r = it as Record<string, unknown>;
      const id = typeof r.issue_id === "string" ? r.issue_id : null;
      if (!id || !validIds.has(id)) continue;
      const evidence =
        typeof r.evidence === "string" && r.evidence.trim().length > 0
          ? r.evidence.trim()
          : undefined;
      out.push({ issueId: id, evidence });
    }
    return out;
  }
  function parseMissed(raw: unknown): IssueAnalysisMissed[] {
    if (!Array.isArray(raw)) return [];
    const out: IssueAnalysisMissed[] = [];
    for (const it of raw) {
      if (!it || typeof it !== "object") continue;
      const r = it as Record<string, unknown>;
      const id = typeof r.issue_id === "string" ? r.issue_id : null;
      if (!id || !validIds.has(id)) continue;
      const severity =
        r.severity === "core" || r.severity === "side" ? r.severity : "core";
      out.push({ issueId: id, severity });
    }
    return out;
  }
  function parseExtras(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 100);
  }

  const result: IssueAnalysisResult = {
    hits: parseHits(obj.hits),
    missed: parseMissed(obj.missed),
    extras: parseExtras(obj.extras),
    reasoning:
      typeof obj.reasoning === "string" ? obj.reasoning.trim() : undefined,
  };

  await recordAiUsage({
    kind: "ai_issue_analyze",
    model: MODEL,
    inputTokens,
    outputTokens,
    outcome: "success",
    meta,
  });
  return result;
}
