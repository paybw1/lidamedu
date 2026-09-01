// feat-2-035 — 판례 도식 AI 초안(쟁점 → 법조문 → 법리 4축 → 포섭 → 결론).
//
// ★사실관계는 여기서 만들지 않는다. 사실관계의 근거는 하급심 판결문이고 그 전문은
//   로컬 캐시(source/하급심 판결문/.cache)에 있는데, Vercel 서버리스에는 그 파일이 없다.
//   → 인앱 초안 = 대법원 원문으로 만들 수 있는 쟁점~결론까지. 사실관계는 배치 스크립트가 채운다.
//   설계 §2 소스 이원화(사실관계=하급심 / 쟁점~결론=대법원)와 그대로 맞는 경계다.
//
// 비용 가드: GS usage-tracker 재사용 (kind = ai_case_diagram_draft).
// 실패·cap·parse 오류 시 null → 호출 측은 강사가 직접 작성하도록 유도.

import Anthropic from "@anthropic-ai/sdk";

import {
  recordAiUsage,
  type UsageMeta,
} from "~/features/gs/lib/usage-tracker.server";

import {
  caseDiagramBlocksSchema,
  type CaseDiagramBlock,
} from "./case-diagram";
// ★★생성 단계 차단 — 판결문에 없는 사건번호를 못 쓰게 한다(CLAUDE.md #12).
import {
  CITATION_PROMPT_RULE,
  checkCitations,
  stripUnknownCitations,
} from "./citation-guard";

const MODEL = "claude-opus-4-7";
const USAGE_KIND = "ai_case_diagram_draft" as const;

// 모델 출력 상한은 스키마가 아니라 서버에서 자른다
// (Anthropic 구조화 출력은 maxItems/maxLength 를 받으면 400).
const MAX_BLOCKS = 8;
const MAX_STATUTES = 6;
const MAX_FIELD_CHARS = 1200;

const SYSTEM_PROMPT = `당신은 대한민국 변리사 2차(주관식) 시험 대비 판례 분석가입니다.
주어진 **대법원 판결문**을 답안 작성 순서대로 도식화합니다.

# 산출 구조
쟁점마다 한 블록. 각 블록은 [쟁점 → 법조문 → 법리(4축) → 사안의 포섭 → 결론].
쟁점이 여러 개면 블록을 여러 개 만드세요. 쟁점 하나에 결론 하나가 대응해야 합니다.

# 법리 4축 (넷 다 채우려 하지 마세요)
- textual(문언적 해석): 조문 문언 자체에서 도출한 근거
- purpose(취지의 해석): 그 규정을 둔 입법취지
- objective(목적의 해석): 법 전체의 목적(제1조) 관점
- balance(형평성 고려): 다른 규정과의 균형·체계

**★가장 중요한 규칙: 판결문에 그 축의 논거가 실제로 나타나지 않으면 그 축은 비워 두세요.**
대부분의 판결은 1~2개 축만 씁니다. 네 축을 다 채운 답은 거의 확실히 틀린 답입니다.
축을 채우기 위해 판결문에 없는 논거를 지어내는 것은 금지합니다.

# 그 밖의 금지 사항
- 판결문에 없는 사건번호·조문 번호를 인용하지 마세요.
- "통설은 ~이다", "종전 판례는 ~였다" 같이 판결문에서 확인되지 않는 단정형 서술 금지.
- 강학상 분류용어(주합발명·조합발명 등 법령·판례가 쓰지 않는 학설상 명칭) 금지 —
  그 분류가 뜻하는 바를 요건·효과로 풀어 쓰세요.
- **사실관계는 만들지 마세요.** 별도 절차로 채웁니다.
${CITATION_PROMPT_RULE}

# 각 항목 작성 요령
- issue: 한 줄 쟁점(20~40자). 예 "공지예외 주장을 하지 않은 나머지 공개행위에도 효과가 미치는지".
- statutes: 판결문이 근거로 든 조문 표기 배열. 예 ["특허법 제30조 제1항 제1호", "특허법 제29조 제1항"].
  명시된 것만. 없으면 빈 배열.
- doctrine: 위 4축 중 판결문에서 확인되는 축만. 각 축 2~5문장.
- application: 이 사건 사실을 그 법리에 포섭한 부분. 판결문의 판단 부분을 요약.
- conclusion: 그 쟁점에 대한 결론(파기/기각/속함/속하지 않음 등)을 한두 문장으로.`;

export interface DiagramDraftArgs {
  caseTitle: string;
  caseNumber: string;
  court: string;
  decidedAt: string;
  officialTextMd: string;
  /** cases.summary_items — 쟁점 분해의 힌트. 없으면 생략. */
  summaryItems?: Array<{ title: string; body: string }>;
  usage?: { meta?: UsageMeta };
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          issue: { type: "string" },
          statutes: { type: "array", items: { type: "string" } },
          doctrine: {
            type: "object",
            additionalProperties: false,
            properties: {
              textual: { type: "string" },
              purpose: { type: "string" },
              objective: { type: "string" },
              balance: { type: "string" },
            },
          },
          application: { type: "string" },
          conclusion: { type: "string" },
        },
        required: ["issue", "statutes", "doctrine", "application", "conclusion"],
      },
    },
  },
  required: ["blocks"],
} as const;

const clampText = (v: unknown): string =>
  typeof v === "string" ? v.trim().slice(0, MAX_FIELD_CHARS) : "";

/** 빈 문자열 축은 아예 키를 지운다 — 화면이 "있는 축만" 렌더하기 때문. */
function normalizeDoctrine(raw: unknown): CaseDiagramBlock["doctrine"] {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: CaseDiagramBlock["doctrine"] = {};
  for (const key of ["textual", "purpose", "objective", "balance"] as const) {
    const body = clampText(r[key]);
    if (body) out[key] = body;
  }
  return out;
}

export async function draftCaseDiagramBlocks(
  args: DiagramDraftArgs,
): Promise<CaseDiagramBlock[] | null> {
  const meta = args.usage?.meta;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await recordAiUsage({
      kind: USAGE_KIND,
      model: MODEL,
      inputTokens: 0,
      outputTokens: 0,
      outcome: "skipped_no_key",
      meta,
      reason: "ANTHROPIC_API_KEY 미설정",
    });
    return null;
  }

  const prompt = [
    "# 판례",
    `- 사건명: ${args.caseTitle}`,
    `- 사건번호: ${args.caseNumber}`,
    `- 법원/선고일: ${args.court} ${args.decidedAt}`,
    "",
    ...(args.summaryItems?.length
      ? [
          "# 판결요지(쟁점 분해 힌트)",
          ...args.summaryItems.map(
            (it, i) => `${i + 1}. ${it.title}\n${it.body}`,
          ),
          "",
        ]
      : []),
    "# 판결문 전문",
    args.officialTextMd,
    "",
    "위 판결을 쟁점 단위로 도식화해 JSON 으로 출력하세요.",
    "근거가 확인되지 않는 법리 축은 반드시 비워 두세요.",
  ].join("\n");

  const client = new Anthropic({ apiKey });
  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 12000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
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
      kind: USAGE_KIND,
      model: MODEL,
      inputTokens: 0,
      outputTokens: 0,
      outcome: "failed",
      meta,
      reason: msg,
    });
    return null;
  }

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    await recordAiUsage({
      kind: USAGE_KIND,
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "JSON parse failed",
    });
    return null;
  }

  const rawBlocks =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>).blocks
      : null;
  if (!Array.isArray(rawBlocks)) {
    await recordAiUsage({
      kind: USAGE_KIND,
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "no blocks array",
    });
    return null;
  }

  const candidates = rawBlocks.slice(0, MAX_BLOCKS).map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      issue: clampText(r.issue),
      statutes: Array.isArray(r.statutes)
        ? r.statutes.map(clampText).filter(Boolean).slice(0, MAX_STATUTES)
        : [],
      doctrine: normalizeDoctrine(r.doctrine),
      application: clampText(r.application),
      conclusion: clampText(r.conclusion),
      // 코멘트는 강사가 덧붙이는 칸 — AI 는 채우지 않는다(판결문 근거 밖 서술 금지).
      comment: "",
    };
  });

  const droppedCitations: string[] = [];
  // ★★생성 단계 차단(CLAUDE.md #12) — 판결문 원문에 없는 사건번호는 걷어낸다.
  //   법리가 맞아도 번호가 틀리면 잘못된 정보이고, 사후 감사로는 "없음"을 확정할 수 없다.
  //   괄호 인용은 자동 제거하고, 문장 구조에 박힌 것은 남겨 사람이 고치게 한다.
  const allowed = new Set<string>();
  for (const b of candidates) {
    for (const key of ["issue", "application", "conclusion"] as const) {
      const { unknown } = checkCitations(b[key], allowed, args.officialTextMd);
      if (unknown.length === 0) continue;
      const res = stripUnknownCitations(b[key], unknown);
      b[key] = res.text;
      if (res.leftover.length > 0) {
        droppedCitations.push(...res.leftover);
      }
    }
    for (const axis of Object.keys(b.doctrine) as Array<keyof typeof b.doctrine>) {
      const v = b.doctrine[axis];
      if (!v) continue;
      const { unknown } = checkCitations(v, allowed, args.officialTextMd);
      if (unknown.length === 0) continue;
      const res = stripUnknownCitations(v, unknown);
      b.doctrine[axis] = res.text;
      if (res.leftover.length > 0) droppedCitations.push(...res.leftover);
    }
  }

  const validated = caseDiagramBlocksSchema.safeParse(candidates);
  const blocks = validated.success
    ? validated.data
    : candidates.filter((b) => b.issue.length >= 2);
  if (blocks.length === 0) {
    await recordAiUsage({
      kind: USAGE_KIND,
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "all blocks filtered",
    });
    return null;
  }

  await recordAiUsage({
    kind: USAGE_KIND,
    model: MODEL,
    inputTokens,
    outputTokens,
    outcome: "success",
    meta,
    // 자동 제거하지 못하고 남은 근거 없는 인용 — 사람이 봐야 한다(사용 기록의 사유 칸).
    ...(droppedCitations.length > 0
      ? {
          reason:
            "근거 없는 인용 잔여: " +
            [...new Set(droppedCitations)].join(", "),
        }
      : {}),
  });
  return blocks;
}
