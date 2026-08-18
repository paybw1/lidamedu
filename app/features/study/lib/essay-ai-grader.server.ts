// feat-2-032 S3 — 2차 논술 답안 AI 채점 초안 생성기.
//   근거 = 실제 채점위원 채점평(problem_grading_notes) + 모범답안 + 3축 루브릭(docs/features/feat-2-032).
//   출력 = 3축 점수(논점/구성/논증 0~100) + 종합(가중합) + 총평 마크다운. 강사 확정 전 초안.
//   환경변수: ANTHROPIC_API_KEY. 사용량은 gs_ai_usage 에 kind=ai_grade 로 기록(round 없음).
import Anthropic from "@anthropic-ai/sdk";

import { recordAiUsage } from "~/features/gs/lib/usage-tracker.server";

const MODEL = "claude-opus-4-7";

// 3축 가중치(코퍼스 강조 빈도 반영). 문서 SSOT: docs/features/feat-2-032-essay-grading.md
export const ESSAY_AXES = [
  { key: "issue", label: "논점 추출", weight: 0.4 },
  { key: "structure", label: "목차·구성", weight: 0.25 },
  { key: "writing", label: "답안 작성·논증", weight: 0.35 },
] as const;

// null = 해당 단계 미작성 → 채점 제외(0점과 구분). 종합은 작성한 축만으로 재정규화한다.
export type EssayAxisScores = {
  issue: number | null;
  structure: number | null;
  writing: number | null;
};

export interface EssayGradingDraft {
  overall: number; // 0~100 가중합
  axisScores: EssayAxisScores;
  feedbackMd: string;
  reasoning?: string;
}

interface GradeArgs {
  questionLabel: string | null; // 예 "A-1"
  questionBody: string; // 발문(body_md)
  modelAnswer: string | null; // 모범답안
  gradingNotesMd: string | null; // 실제 채점위원 채점평(폼 단위)
  studentStages: EssayStages; // 학생 3단계 훈련 기록
  userId?: string | null; // 사용량 로깅
}

/** 학생이 작성하는 3단계 — AI 채점 3축과 1:1 대응(feat-2-032 개편 2026-08-18). */
export interface EssayStages {
  issuesMd: string; // ① 논점 추출 → issue 축
  outlineMd: string; // ② 목차 구성 → structure 축
  analysisMd: string; // ③ 사안의 포섭·결론 → writing 축
}

const STAGE_EMPTY = "(미작성)";

/** 3단계를 채점용 한 덩어리로 조립. 축↔단계 대응이 프롬프트에서 흔들리지 않게 머리글을 고정한다. */
export function composeStageAnswer(s: EssayStages): string {
  return [
    `### ① 논점 추출\n${s.issuesMd.trim() || STAGE_EMPTY}`,
    `### ② 목차 구성\n${s.outlineMd.trim() || STAGE_EMPTY}`,
    `### ③ 사안의 포섭·결론\n${s.analysisMd.trim() || STAGE_EMPTY}`,
  ].join("\n\n");
}

const SYSTEM_PROMPT = `당신은 대한민국 변리사 2차 시험(주관식·논술)의 채점 보조 AI 입니다.
아래 '채점 3축 기준'과 '실제 채점위원 채점평', '모범답안'에 근거해서만 채점하세요. 기준에 없는 임의
잣대를 만들지 마세요.

[중요 — 학습자는 완성 답안을 쓰지 않습니다]
2차는 오프라인 지필 시험이므로 온라인에서는 답안의 뼈대를 잡는 3단계 훈련만 합니다. 학생 입력은
① 논점 추출 ② 목차 구성 ③ 사안의 포섭·결론 세 칸으로 나뉘어 들어옵니다. 각 축은 **대응하는 단계만**
보고 채점하세요(① → issue, ② → structure, ③ → writing). "분량이 적다", "완성된 문장이 아니다",
"서론·결론이 없다"처럼 **완성 답안이 아니라는 이유로 감점하지 마세요.**

[채점 3축 기준]
1) 논점 추출(issue) — ①만 본다: 출제자가 무엇을 묻는지(설문 취지·핵심)를 정확히 파악했는가. 사안의
   특정 사실을 포착해 배점에 맞는 쟁점을 빠짐없이 적시했는가. 묻지 않은 것·무관한 조문·일반론 나열,
   설문 단서 위반, 자의적 해석, 핵심 쟁점 누락은 감점. 다만 문장이 아니라 키워드·목록 형태여도
   쟁점이 정확하면 감점하지 않는다.
2) 목차·구성(structure) — ②만 본다: 쟁점별 목차·소제목으로 체계화했는가. 배점 비례로 분량·강약을
   배분할 계획이 드러나는가(일반론 최소·사안 해결에 지면 할애). 학설·판례를 구분 배치했는가.
   수험서 목차 단순 암기, 특정 쟁점 편중, 서론 비대, 조문 전사식 나열은 감점. 목차 기호(Ⅰ·1·가)의
   형식은 따지지 않는다.
3) 답안 작성·논증(writing) — ③만 본다: 실정법(조문)→학설·판례 순으로 근거를 제시하고 사안에
   포섭·적용했는가. 명확한 결론과 결론에 이르는 일관된 논리가 있는가. 학설 대립 시 자기 입장·논거를
   밝혔는가. 법전 전사, 애매모호한 결론, 논리 비약, 본문↔결론 모순은 감점. 이 단계는 문장으로 쓴
   포섭·결론을 기대한다 — 목차를 다시 옮겨 적기만 한 경우는 감점.

'(미작성)'으로 표시된 단계는 채점 대상이 아닙니다. 그 축의 점수는 무시되므로 0 을 넣고, 총평에서도
그 단계를 평가하지 말고 '아직 작성하지 않았다'는 사실만 짚으세요.

각 축을 0~100 으로 채점하고, 총평은 한국어 마크다운으로 '강점 → 보완할 점 → 다음 학습 제안' 순
6~12줄. 총평은 단계 이름(① 논점 / ② 목차 / ③ 포섭·결론)으로 짚어 주세요. 채점은 강사 검토 전
초안입니다.`;

/** 0~100 로 clamp + 0.5 단위 반올림. */
function clampScore(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(v * 2) / 2));
}

export async function gradeEssayDraft(
  args: GradeArgs,
): Promise<EssayGradingDraft | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const meta = { userId: args.userId ?? null };
  if (!apiKey) {
    await recordAiUsage({
      kind: "ai_grade",
      model: MODEL,
      inputTokens: 0,
      outputTokens: 0,
      outcome: "skipped_no_key",
      meta,
    });
    return null;
  }
  const client = new Anthropic({ apiKey });

  // 문제·모범답안·채점평 = 프리픽스(같은 문제 재채점 시 캐시 재사용). 학생 답안만 뒤에.
  const promptPrefix = [
    args.questionLabel ? `## 문제 ${args.questionLabel}` : "## 문제",
    args.questionBody,
    args.modelAnswer ? `\n## 모범답안\n${args.modelAnswer}` : "",
    args.gradingNotesMd
      ? `\n## 실제 채점위원 채점평(이 문제 소속 폼)\n${args.gradingNotesMd}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const studentSection = `## 학생 답안(3단계 훈련)\n${composeStageAnswer(args.studentStages)}`;

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
              issue_score: { type: "number", description: "논점 추출 0~100" },
              structure_score: {
                type: "number",
                description: "목차·구성 0~100",
              },
              writing_score: {
                type: "number",
                description: "답안 작성·논증 0~100",
              },
              feedback_md: {
                type: "string",
                description:
                  "학생용 총평 마크다운. 강점→보완할 점→다음 학습 제안 순.",
              },
              reasoning: {
                type: "string",
                description: "축별 점수 산정 근거(강사 참고용, 짧게).",
              },
            },
            required: [
              "issue_score",
              "structure_score",
              "writing_score",
              "feedback_md",
              "reasoning",
            ],
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
              cache_control: { type: "ephemeral" },
            },
            { type: "text", text: studentSection },
          ],
        },
      ],
    });
  } catch (e) {
    const msg =
      e instanceof Anthropic.APIError
        ? `Anthropic API ${e.status}: ${e.message}`
        : e instanceof Error
          ? e.message
          : String(e);
    await recordAiUsage({
      kind: "ai_grade",
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
      kind: "ai_grade",
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "no text block",
    });
    return null;
  }
  let parsed: {
    issue_score?: number;
    structure_score?: number;
    writing_score?: number;
    feedback_md?: string;
    reasoning?: string;
  };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    await recordAiUsage({
      kind: "ai_grade",
      model: MODEL,
      inputTokens,
      outputTokens,
      outcome: "failed",
      meta,
      reason: "json parse",
    });
    return null;
  }

  // 미작성 단계는 채점 제외(null) — 모델이 0 을 넣어도 서버가 지운다. 작성 여부의 권위는 서버.
  const filled = {
    issue: args.studentStages.issuesMd.trim().length > 0,
    structure: args.studentStages.outlineMd.trim().length > 0,
    writing: args.studentStages.analysisMd.trim().length > 0,
  };
  const axisScores: EssayAxisScores = {
    issue: filled.issue ? clampScore(parsed.issue_score) : null,
    structure: filled.structure ? clampScore(parsed.structure_score) : null,
    writing: filled.writing ? clampScore(parsed.writing_score) : null,
  };
  // 종합 = 작성한 축만 가중 평균(가중치 재정규화). 미작성을 0점으로 깔지 않는다 —
  // ①만 연습한 학생이 33점을 받으면 훈련을 그만두게 된다.
  const weighted = ESSAY_AXES.reduce(
    (acc, ax) => {
      const v = axisScores[ax.key];
      return v === null
        ? acc
        : { sum: acc.sum + v * ax.weight, w: acc.w + ax.weight };
    },
    { sum: 0, w: 0 },
  );
  const overall =
    weighted.w > 0 ? Math.round((weighted.sum / weighted.w) * 2) / 2 : 0;

  await recordAiUsage({
    kind: "ai_grade",
    model: MODEL,
    inputTokens,
    outputTokens,
    outcome: "success",
    meta,
  });

  return {
    overall,
    axisScores,
    feedbackMd: (parsed.feedback_md ?? "").trim() || "(피드백 없음)",
    reasoning: parsed.reasoning,
  };
}
