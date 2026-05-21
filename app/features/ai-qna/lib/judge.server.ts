// feat-9-005 v1.2 — LLM judge.
// 강사가 라벨링한 reference_answer 와 AI 가 생성한 ai_answer 를 비교해 점수+verdict+사유 출력.
//
// 가격: judge 도 sonnet 호출이지만 컨텍스트 짧음(~1500 토큰 in, 200 토큰 out 가정) → 약 6원/판정.
// 50개 평가 = 300원 + 답변 생성 비용. 매일 cron 가정 시 월 ~10,000원 수준.

import Anthropic from "@anthropic-ai/sdk";

import { AI_QNA_MODEL } from "./constants";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface JudgeResult {
  /** 0~5 정수. 5=정답과 동등, 0=완전 오답. */
  score: number;
  verdict: "pass" | "partial" | "fail";
  /** 3줄 이내 사유. */
  rationale: string;
  /** 입력/출력 토큰. */
  tokenUsage: { input: number; output: number };
  /** 사용된 judge 모델 id. */
  model: string;
}

const SYSTEM_PROMPT =
  "당신은 대한민국 변리사 시험 학습 보조 AI 의 답변을 평가하는 채점자입니다.\n" +
  "강사가 작성한 reference_answer 가 정답입니다. AI 가 생성한 ai_answer 와 비교해 점수·verdict·사유를 JSON 으로만 출력하세요.\n" +
  "\n" +
  "기준:\n" +
  "- 5점: 정답과 동등하게 정확·완전. 핵심 요건/요소 누락 없음.\n" +
  "- 4점: 핵심 맞음, 미세한 누락/표현 차이.\n" +
  "- 3점: 부분 정답, 중요 내용 일부 누락 또는 오인 가능 표현.\n" +
  "- 2점: 일부 정답 + 일부 부정확.\n" +
  "- 1점: 대부분 오답 또는 환각.\n" +
  "- 0점: 완전 오답 / 미응답 / '강사 Q&A 안내' 같은 거절 응답.\n" +
  "\n" +
  "verdict: score>=4 -> 'pass', score in (2,3) -> 'partial', score<=1 -> 'fail'.\n" +
  "\n" +
  "출력 형식 (다른 텍스트 금지, JSON 객체만):\n" +
  '{"score": 0|1|2|3|4|5, "verdict": "pass"|"partial"|"fail", "rationale": "3줄 이내 한국어 사유"}';

export async function judgeAnswer(
  question: string,
  referenceAnswer: string,
  aiAnswer: string,
): Promise<JudgeResult> {
  const client = getClient();
  // 본문 길면 절단 — 비용 보호.
  const q = question.length > 1000 ? question.slice(0, 1000) + "…" : question;
  const ref =
    referenceAnswer.length > 2000
      ? referenceAnswer.slice(0, 2000) + "…"
      : referenceAnswer;
  const ai =
    aiAnswer.length > 2000 ? aiAnswer.slice(0, 2000) + "…" : aiAnswer;

  const resp = await client.messages.create({
    model: AI_QNA_MODEL,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `[question]\n${q}\n\n[reference_answer]\n${ref}\n\n[ai_answer]\n${ai}\n\n` +
          "위 기준에 따라 JSON 출력.",
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("judge 빈 응답");

  // 가드: 코드펜스 제거 + 첫 { 부터 마지막 } 까지.
  const cleaned = stripCodeFence(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`judge 응답이 JSON 아님: ${cleaned.slice(0, 200)}`);
  }
  const json = cleaned.slice(start, end + 1);
  let parsed: { score?: unknown; verdict?: unknown; rationale?: unknown };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    throw new Error(`judge JSON parse 실패: ${json.slice(0, 200)}`);
  }
  const score = Number(parsed.score);
  if (!Number.isFinite(score) || score < 0 || score > 5) {
    throw new Error(`judge score 범위 오류: ${String(parsed.score)}`);
  }
  const verdict = parsed.verdict;
  if (verdict !== "pass" && verdict !== "partial" && verdict !== "fail") {
    throw new Error(`judge verdict 오류: ${String(verdict)}`);
  }
  const rationale =
    typeof parsed.rationale === "string"
      ? parsed.rationale.trim().slice(0, 1000)
      : "";

  return {
    score: Math.round(score),
    verdict,
    rationale,
    tokenUsage: {
      input: resp.usage.input_tokens,
      output: resp.usage.output_tokens,
    },
    model: AI_QNA_MODEL,
  };
}

function stripCodeFence(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
}
