// 학생 — 판례 기반 쟁점추출 attempt 의 AI 의미 매칭 분석.
// 학생 자유 서술 ↔ 승인된 모범 쟁점 의미 단위 대조. 단정 X, 보조 의견.
// 비용 가드: kind='ai_case_issue_analyze'.

import Anthropic from "@anthropic-ai/sdk";

import type { MasterIssue } from "~/features/issue-extraction/lib/types";
import {
  recordAiUsage,
  type UsageMeta,
} from "~/features/gs/lib/usage-tracker.server";

const MODEL = "claude-opus-4-7";

export interface CaseIssueAnalysisResult {
  hits: Array<{ issueId: string; evidence?: string }>;
  missed: Array<{ issueId: string; severity: "core" | "side" }>;
  extras: Array<{ text: string; reason?: string }>;
}

interface AnalyzeArgs {
  caseTitle: string;
  factsSummaryMd: string;
  masterIssues: MasterIssue[];
  studentIssuesMd: string;
  usage?: { meta?: UsageMeta };
}

const SYSTEM_PROMPT = `당신은 대한민국 변리사 시험 판례 학습 보조입니다. 학생이 자유 서술로 적은 \
"쟁점" 메모를 승인된 모범 쟁점 목록과 의미 단위로 대조합니다.

원칙:
- **표현이 달라도 같은 쟁점이면 짚었다고(hit) 판단**. 예: "신규성 위반" ≈ "제29조 제1항".
- 학생이 명백히 다른 의미로 적었다면 hit 처리 금지.
- **단정 금지**. 보조 의견 어조 ("…일 가능성", "확인해보세요").
- 모범에 매칭되지 않는 학생 줄은 extras (모범 밖 자작 — 사람이 다시 판단).
- 한 학생 줄이 여러 모범과 겹쳐 보이면 가장 가까운 1개에만 hit.

issue_id 는 제공된 모범 목록의 값만 사용.`;

export async function analyzeCaseIssueExtraction(
  args: AnalyzeArgs,
): Promise<CaseIssueAnalysisResult | null> {
  const meta = args.usage?.meta;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await recordAiUsage({
      kind: "ai_case_issue_analyze",
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
    `# 판례`,
    `## ${args.caseTitle}`,
    "",
    `# 사실관계 (학생이 받은 사례)`,
    args.factsSummaryMd,
    "",
    `# 모범 쟁점 목록 (issue_id 사용)`,
    masterBlock,
    "",
    `# 학생 쟁점 메모 (자유 서술)`,
    args.studentIssuesMd.trim() || "(빈 답안)",
    "",
    "위 학생 메모가 모범 쟁점들 중 어느 것을 짚었는지, 빠뜨렸는지, 모범 밖 자작인지를 의미 단위로 판정해 JSON 으로 응답하세요.",
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
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    text: { type: "string", maxLength: 200 },
                    reason: { type: "string", maxLength: 300 },
                  },
                  required: ["text"],
                },
              },
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
    await recordAiUsage({
      kind: "ai_case_issue_analyze",
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
      kind: "ai_case_issue_analyze",
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
      kind: "ai_case_issue_analyze",
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
      kind: "ai_case_issue_analyze",
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
  const masterIdSet = new Set(args.masterIssues.map((m) => m.issueId));

  const rawHits = Array.isArray(obj.hits) ? obj.hits : [];
  const hits: CaseIssueAnalysisResult["hits"] = [];
  for (const h of rawHits) {
    if (!h || typeof h !== "object") continue;
    const r = h as Record<string, unknown>;
    const id = typeof r.issue_id === "string" ? r.issue_id : "";
    if (!masterIdSet.has(id)) continue;
    const evidence =
      typeof r.evidence === "string" && r.evidence.trim() ? r.evidence : undefined;
    hits.push({ issueId: id, evidence });
  }

  const rawMissed = Array.isArray(obj.missed) ? obj.missed : [];
  const missed: CaseIssueAnalysisResult["missed"] = [];
  for (const m of rawMissed) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const id = typeof r.issue_id === "string" ? r.issue_id : "";
    if (!masterIdSet.has(id)) continue;
    const sev = r.severity === "side" ? "side" : "core";
    missed.push({ issueId: id, severity: sev });
  }

  const rawExtras = Array.isArray(obj.extras) ? obj.extras : [];
  const extras: CaseIssueAnalysisResult["extras"] = [];
  for (const e of rawExtras) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const text = typeof r.text === "string" ? r.text.trim() : "";
    if (!text) continue;
    const reason =
      typeof r.reason === "string" && r.reason.trim() ? r.reason : undefined;
    extras.push({ text, reason });
  }

  await recordAiUsage({
    kind: "ai_case_issue_analyze",
    model: MODEL,
    inputTokens,
    outputTokens,
    outcome: "success",
    meta,
  });
  return { hits, missed, extras };
}
