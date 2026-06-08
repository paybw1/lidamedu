// 학생 §3 — 결론·강약 attempt 의 AI 코칭 분석.
// 단정 금지 — "쟁점 A의 비중이 부족해 보입니다" 톤.
// 비용 가드: ai_case_conclusion_analyze.

import Anthropic from "@anthropic-ai/sdk";

import {
  recordAiUsage,
  type UsageMeta,
} from "~/features/gs/lib/usage-tracker.server";
import type {
  ConclusionAiAnalysis,
  ConclusionsMap,
  EmphasisMap,
  IssueEmphasis,
  MasterIssueWithConclusion,
} from "~/features/issue-extraction/lib/types";

const MODEL = "claude-opus-4-7";

interface AnalyzeArgs {
  caseTitle: string;
  factsSummaryMd: string;
  masterIssues: MasterIssueWithConclusion[];
  studentConclusions: ConclusionsMap;
  studentEmphasis: EmphasisMap;
  studentOutlineMd: string;
  usage?: { meta?: UsageMeta };
}

const SYSTEM_PROMPT = `당신은 대한민국 변리사 시험 답안 코치입니다. 학생이 짠 답안 \
목차와 쟁점별 강약 설정에 대해 짧은 코칭 메모를 작성합니다.

원칙:
- **단정 금지**. "…해 보입니다", "확인해보세요" 톤.
- 권장 강약과 학생 강약 차이를 짚지만 점수화 X — "왜 그렇게 봤는지" 학생이 다시 생각하도록.
- 핵심(core) 인데 약하게 표시한 경우, 부차(side) 인데 강하게 표시한 경우를 우선.
- 결론 방향이 모범과 어긋난 경우도 짚되 결론 자체보다 "근거가 부족해 보임" 어조.
- overall: 1~2문장 종합. 우선순위 조언.

issue_id 는 제공된 모범 목록의 값만 사용.`;

const EMPHASIS_LABEL_KO: Record<IssueEmphasis, string> = {
  strong: "강",
  medium: "중",
  weak: "약",
};

export async function analyzeCaseConclusion(
  args: AnalyzeArgs,
): Promise<ConclusionAiAnalysis | null> {
  const meta = args.usage?.meta;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await recordAiUsage({
      kind: "ai_case_conclusion_analyze",
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
    .map((m) => {
      const recDir = m.modelConclusionDirection ?? "(미설정)";
      const recWeight = m.weight !== null ? ` weight=${m.weight}` : "";
      const studentConc = args.studentConclusions[m.issueId];
      const studentDir = studentConc?.direction ?? "(미작성)";
      const studentEmph = args.studentEmphasis[m.issueId];
      return [
        `- [issue_id=${m.issueId}] ${m.label} (${m.importance}${recWeight})`,
        `  모범 결론: ${recDir} — ${m.modelConclusionMd ?? ""}`,
        `  학생 결론: ${studentDir}`,
        `  학생 강약: ${studentEmph ? EMPHASIS_LABEL_KO[studentEmph] : "(미선택)"}`,
      ].join("\n");
    })
    .join("\n");

  const prompt = [
    `# 판례: ${args.caseTitle}`,
    "",
    `# 사실관계`,
    args.factsSummaryMd,
    "",
    `# 쟁점·결론 비교 (모범 vs 학생)`,
    masterBlock,
    "",
    `# 학생 답안 목차`,
    args.studentOutlineMd || "(빈 답안)",
    "",
    "위 학생 답안에 대한 코칭 메모를 JSON 으로 응답하세요.",
  ].join("\n");

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              notes: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    issue_id: { type: "string" },
                    kind: {
                      type: "string",
                      enum: ["emphasis", "conclusion", "overall"],
                    },
                    note: { type: "string" },
                  },
                  required: ["kind", "note"],
                },
              },
            },
            required: ["notes"],
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
      kind: "ai_case_conclusion_analyze",
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
      kind: "ai_case_conclusion_analyze",
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
      kind: "ai_case_conclusion_analyze",
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
      kind: "ai_case_conclusion_analyze",
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
  const rawNotes = Array.isArray(obj.notes) ? obj.notes : [];
  const idSet = new Set(args.masterIssues.map((i) => i.issueId));
  const notes: ConclusionAiAnalysis["notes"] = [];
  for (const n of rawNotes) {
    if (!n || typeof n !== "object") continue;
    const o = n as Record<string, unknown>;
    const kind = o.kind;
    if (kind !== "emphasis" && kind !== "conclusion" && kind !== "overall")
      continue;
    const note = typeof o.note === "string" ? o.note.trim() : "";
    if (!note) continue;
    let issueId: string | null = null;
    if (typeof o.issue_id === "string" && idSet.has(o.issue_id))
      issueId = o.issue_id;
    notes.push({ issueId, kind, note });
  }

  await recordAiUsage({
    kind: "ai_case_conclusion_analyze",
    model: MODEL,
    inputTokens,
    outputTokens,
    outcome: "success",
    meta,
  });
  return { notes };
}
