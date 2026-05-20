// feat-9-003 — Claude Sonnet 4.6 답변 생성. 스트리밍 + 출처 인용.
//
// 입력: 사용자 질문 + hybridSearch 결과(SearchHit[]).
// 출력: AsyncGenerator<AnswerEvent> — 토큰 단위 text delta + 최종 citations + done.
//
// 멀티턴(직전 4턴) 은 feat-9-004 에서 도입. 이번 단계는 단일턴.

import Anthropic from "@anthropic-ai/sdk";

import { AI_QNA_MODEL } from "./constants";
import { type Citation, extractCitations } from "./citations";
import type { SearchHit } from "./hybrid-search.server";
import { buildContextItems, buildSystemPrompt } from "./system-prompt";

export type AnswerEvent =
  | { type: "text"; delta: string }
  | {
      type: "done";
      fullText: string;
      citations: Citation[];
      tokenUsage: { input: number; output: number };
    }
  | { type: "error"; message: string };

export interface AnswerOptions {
  /** 답변 최대 토큰. default 1024 (간결한 답변 유도). */
  maxTokens?: number;
  /** 모델 override — 평소엔 상수 사용. */
  model?: string;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface AnswerTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * 답변 스트리밍. 호출부는 `for await (const ev of answerQuestion(...))` 패턴.
 *
 * messages — Claude 에 보낼 turn 배열. 마지막은 반드시 현재 user 질문. 멀티턴이면
 * 직전 (assistant/user)... 가 앞에 붙는다 (`buildMultiturnMessages`).
 *
 * 흐름:
 *  1. 컨텍스트 빌드 ([1] [2] 라벨 부여) — hits 기반
 *  2. system prompt + messages 로 messages.stream
 *  3. content_block_delta(text_delta) 마다 yield {type:'text', delta}
 *  4. 스트림 종료 후 fullText 누적본에서 [N] 마커 → citations 추출 → yield done
 *  5. 예외 시 yield {type:'error'}
 */
export async function* answerQuestion(
  messages: ReadonlyArray<AnswerTurn>,
  hits: ReadonlyArray<SearchHit>,
  options: AnswerOptions = {},
): AsyncGenerator<AnswerEvent, void, unknown> {
  const items = buildContextItems(hits);
  const system = buildSystemPrompt(items);
  const model = options.model ?? AI_QNA_MODEL;
  const maxTokens = options.maxTokens ?? 1024;

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    yield {
      type: "error",
      message: "messages 의 마지막은 user 여야 합니다.",
    };
    return;
  }

  let fullText = "";
  let tokenUsage = { input: 0, output: 0 };

  try {
    const client = getClient();
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        // SDK 0.95.x — delta.type === 'text_delta' 일 때만 text.
        const delta = event.delta;
        if ("type" in delta && delta.type === "text_delta") {
          fullText += delta.text;
          yield { type: "text", delta: delta.text };
        }
      } else if (event.type === "message_start") {
        tokenUsage.input = event.message.usage?.input_tokens ?? 0;
      } else if (event.type === "message_delta") {
        // message_delta.usage 는 누적이 아니라 현 시점 output 토큰 수.
        if ("usage" in event && event.usage) {
          tokenUsage.output = event.usage.output_tokens ?? tokenUsage.output;
        }
      }
    }

    const citations = extractCitations(fullText, items);
    yield { type: "done", fullText, citations, tokenUsage };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    yield { type: "error", message };
  }
}
