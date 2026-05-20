// feat-9-004 실사용자용 AI Q&A SSE endpoint.
//
// POST /api/ai-qna/ask
//   - body (multipart 또는 form-urlencoded):
//       question        : 사용자 질문 (필수)
//       conversationId  : 기존 대화 ID (없으면 새 대화 생성)
//       anchorType      : article|case|problem (옵션, 새 대화일 때만 사용)
//       anchorId        : 앵커 source_id (옵션)
//       lawCodes        : "patent,trademark" 콤마 list (옵션, 기본은 question 파서)
//   - SSE 응답:
//       data: {"type":"conversation","conversationId":"...","title":"..."}
//       data: {"type":"search","hits":[...]}
//       data: {"type":"text","delta":"..."} (반복)
//       data: {"type":"done","messageId":"...","citations":[...],"tokenUsage":{...}}
//       data: {"type":"error","message":"..."}
//
// 인증: 로그인 사용자만. RLS 가 본인 대화만 R/W 강제.
// 저장: 사용자 메시지는 검색 시작 전 INSERT, assistant 메시지는 done 시점에 INSERT.
//       (스트림 중간 에러 시 사용자 메시지만 남고 assistant 미저장 — 다음 질문 시 history 에 포함되어도 답변 빠진 채.)
//       실용상 충분. 향후 retry/edit 추가 가능.

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import {
  appendAssistantMessage,
  appendUserMessage,
  autoTitleFromQuestion,
  buildMultiturnMessages,
  createConversation,
  getConversationWithMessages,
  setConversationTitle,
  type ConversationAnchor,
} from "~/features/ai-qna/conversations.server";
import type { Citation } from "~/features/ai-qna/lib/citations";
import { AI_QNA_MODEL } from "~/features/ai-qna/lib/constants";
import { answerQuestion } from "~/features/ai-qna/lib/answer.server";
import { hybridSearch } from "~/features/ai-qna/lib/hybrid-search.server";

import type { Route } from "./+types/ask";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const question = String(fd.get("question") ?? "").trim();
  if (!question) return data({ error: "question 필수" }, { status: 400 });
  if (question.length > 4000)
    return data({ error: "질문은 4000자 이내" }, { status: 400 });

  const incomingConvId = String(fd.get("conversationId") ?? "").trim();
  const anchorTypeRaw = String(fd.get("anchorType") ?? "").trim();
  const anchorId = String(fd.get("anchorId") ?? "").trim();
  const anchor: ConversationAnchor | null =
    (anchorTypeRaw === "article" ||
      anchorTypeRaw === "case" ||
      anchorTypeRaw === "problem") &&
    anchorId.length > 0
      ? { sourceType: anchorTypeRaw, sourceId: anchorId }
      : null;
  const lawCodesParam = String(fd.get("lawCodes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // 대화 확보 — 없으면 신규.
  let conversationId = incomingConvId;
  let isNew = false;
  let history: Awaited<ReturnType<typeof getConversationWithMessages>> = null;
  if (conversationId) {
    history = await getConversationWithMessages(client, conversationId);
    if (!history) {
      return data({ error: "conversation not found" }, { status: 404 });
    }
  } else {
    conversationId = await createConversation(client, user.id, {
      title: autoTitleFromQuestion(question),
      anchor,
    });
    isNew = true;
  }

  // 사용자 메시지 저장 (검색 전).
  await appendUserMessage(client, conversationId, question);

  // 멀티턴 컨텍스트 — 직전 history (이번 사용자 메시지 제외).
  const priorMessages = history ? history.messages : [];
  const claudeMessages = buildMultiturnMessages(priorMessages, question);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      try {
        send({
          type: "conversation",
          conversationId,
          isNew,
          anchor,
        });

        // 1) 하이브리드 검색.
        const search = await hybridSearch(client, question, {
          lawCodesOverride:
            lawCodesParam.length > 0 ? lawCodesParam : undefined,
        });
        send({
          type: "search",
          parsed: search.parsed,
          semanticAvailable: search.semanticAvailable,
          perPathCounts: search.perPathCounts,
          hits: search.hits.map((h, i) => ({
            label: i + 1,
            chunkId: h.chunkId,
            sourceType: h.sourceType,
            sourceId: h.sourceId,
            headingPath: h.headingPath,
          })),
        });

        // 2) Claude 스트리밍.
        let fullText = "";
        let citations: Citation[] = [];
        let tokenUsage = { input: 0, output: 0 };
        let errored = false;

        for await (const ev of answerQuestion(claudeMessages, search.hits)) {
          if (ev.type === "text") {
            fullText += ev.delta;
            send({ type: "text", delta: ev.delta });
          } else if (ev.type === "done") {
            citations = ev.citations;
            tokenUsage = ev.tokenUsage;
            break;
          } else if (ev.type === "error") {
            errored = true;
            send({ type: "error", message: ev.message });
            break;
          }
        }

        if (!errored) {
          // 3) assistant 메시지 저장 — runAfterResponse 가 아니라 응답 안에 보장
          //    (사용자가 새로고침 시 즉시 보이도록).
          const messageId = await appendAssistantMessage(
            client,
            conversationId,
            {
              bodyMd: fullText,
              citations,
              retrievalMeta: {
                parsed: search.parsed,
                perPathCounts: search.perPathCounts,
                hitIds: search.hits.map((h) => h.chunkId),
              },
              tokenUsage: { ...tokenUsage, model: AI_QNA_MODEL },
            },
          );
          send({
            type: "done",
            messageId,
            citations,
            tokenUsage,
            fullText,
          });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        send({ type: "error", message });
      } finally {
        // 대화 제목이 신규 + 기본 truncate 라 그대로 유지. (LLM 요약 제목은 v1.1)
        if (isNew) {
          runAfterResponse(
            setConversationTitle(
              client,
              conversationId,
              autoTitleFromQuestion(question),
            ),
          );
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
