// feat-9-004 잔여 ④ — 신규 AI 대화의 제목을 Claude Haiku 로 요약.
// 첫 답변 완료 직후 background 1회 호출. 실패 시 호출부가 기존 truncate 제목 유지.

import Anthropic from "@anthropic-ai/sdk";

import { AI_TITLE_MODEL } from "./constants";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * 질문 + 답변을 8~20자 한국어 명사구 제목으로 요약.
 * 따옴표·마침표·이모지 없음. 실패 시 throw — 호출부가 swallow.
 */
export async function summarizeConversationTitle(
  question: string,
  answer: string,
): Promise<string> {
  const client = getClient();
  // 질문·답변이 길면 토큰 절감 위해 절단.
  const q = question.length > 500 ? question.slice(0, 500) + "…" : question;
  const a = answer.length > 800 ? answer.slice(0, 800) + "…" : answer;

  const resp = await client.messages.create({
    model: AI_TITLE_MODEL,
    max_tokens: 60, // 한국어 8~20자 ≈ 12~30 토큰. 여유.
    system:
      "한국어 변리사 학습 AI 대화의 제목을 8~20자 명사구로 요약합니다. 마침표·따옴표·이모지·접두사 없이 제목만 출력하세요. 예: '특허법 제29조 진보성 판단 기준', '디자인보호법 신규성 상실 예외'.",
    messages: [
      {
        role: "user",
        content: `[질문]\n${q}\n\n[답변]\n${a}\n\n위 대화의 제목을 한국어 8~20자 명사구로 출력해주세요.`,
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("title 요약 빈 응답");

  // 따옴표·마침표·markdown·줄바꿈 제거. 30자 안전 절단.
  const cleaned = text
    .replace(/^["'`「『]+|["'`」』]+$/g, "")
    .replace(/[.!?。…]+$/g, "")
    .split("\n")[0]
    .trim();
  return cleaned.length > 40 ? cleaned.slice(0, 40) + "…" : cleaned;
}
