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

import adminClient from "~/core/lib/supa-admin-client.server";
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
import {
  GATE_REFUSAL_TEXT,
  gateModeFromEnv,
  postSearchGate,
  preSearchGate,
} from "~/features/ai-qna/lib/domain-gate.server";
import { hybridSearch } from "~/features/ai-qna/lib/hybrid-search.server";
import { summarizeConversationTitle } from "~/features/ai-qna/lib/title.server";
import {
  capBlockedMessage,
  checkGlobalCap,
  recordUsage,
} from "~/features/ai-qna/lib/usage-tracker.server";
import { getQuotaState } from "~/features/ai-qna/settings.server";

/** assistant 메시지 결과 상태 — 차감·이상탐지 정합성용. */
type AnswerStatus =
  | "success"
  | "refusal_no_evidence"   // 모델이 자체 거절 (시스템 프롬프트 3·5·7)
  | "refusal_gate"          // 도메인 게이트 차단 (LLM 호출 없음)
  | "error";

function detectModelRefusal(text: string): boolean {
  return (
    /제공된\s*자료로는\s*확실히\s*답하기\s*어렵습니다/.test(text)
    || /자연과학\s*질문은\s*현재\s*AI\s*Q&A\s*가\s*지원하지\s*않습니다/.test(text)
  );
}

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

  // feat-9-006 한도 체크 — 답변 토큰 생성 전.
  // 초과 시 user 메시지·신규 대화 생성 없이 즉시 거절(SSE 가 아니라 일반 JSON 으로 — 클라가 모달).
  const quota = await getQuotaState(client, user.id);
  if (quota.exceeded) {
    return data(
      {
        error: "quota_exceeded",
        tier: quota.tier,
        dailyLimit: quota.dailyLimit,
        usedToday: quota.usedToday,
        // 사용자 안내 문구 — 화면 단의 모달이 사용.
        message:
          quota.tier === "tier1"
            ? `오늘 사용한 ${quota.usedToday}회로 일일 한도(${quota.dailyLimit}회)에 도달했습니다. 내일 다시 이용하거나 강사 Q&A 를 이용해 주세요.`
            : `오늘 사용한 ${quota.usedToday}회로 무료 한도(${quota.dailyLimit}회)에 도달했습니다. 상위 요금제로 업그레이드하거나 강사 Q&A 를 이용해 주세요.`,
      },
      { status: 429 },
    );
  }

  // v4-③ 전역 일일 토큰·비용 가드 — 사용자 한도와 별개로 플랫폼 전체 폭주 차단.
  // 환경변수 AI_QNA_DAILY_*_CAP 미설정 시 통과 (운영 default).
  const globalCap = await checkGlobalCap(adminClient);
  if (globalCap.blocked) {
    return data(
      {
        error: "global_cap_exceeded",
        reason: globalCap.reason,
        cap: globalCap.cap,
        current: globalCap.current,
        message: capBlockedMessage(globalCap),
      },
      { status: 429 },
    );
  }

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

      // finally 의 LLM 제목 요약이 접근할 outer scope 변수.
      let savedFullText = "";
      let savedErrored = false;

      try {
        send({
          type: "conversation",
          conversationId,
          isNew,
          anchor,
        });

        // v4-② 보조 안전망 — 도메인 게이트(default OFF, env 로 토글).
        // 시스템 프롬프트 7번(도메인 일치 원칙) 이 1차 방어, 게이트는 모델 회귀 감지용 옵션.
        const gateMode = gateModeFromEnv();
        const preGate = preSearchGate(question, gateMode);
        if (preGate && !preGate.pass) {
          const refusalText = `${GATE_REFUSAL_TEXT}\n\n※ 본 답변은 참고용이며, 최신 법령·원문 확인이 필요합니다.`;
          savedFullText = refusalText;
          savedErrored = false;
          send({ type: "text", delta: refusalText });
          const messageId = await appendAssistantMessage(
            client,
            conversationId,
            {
              bodyMd: refusalText,
              citations: [],
              retrievalMeta: { gate: { stage: "pre", decision: preGate } },
              tokenUsage: {
                input: 0,
                output: 0,
                model: AI_QNA_MODEL,
                status: "refusal_gate" satisfies AnswerStatus,
              },
            },
          );
          send({
            type: "done",
            messageId,
            citations: [],
            tokenUsage: { input: 0, output: 0 },
            fullText: refusalText,
          });
          return;
        }

        // 1) 하이브리드 검색 — 운영자 quota.maxContextChunks 캡 적용.
        const search = await hybridSearch(client, question, {
          topK: quota.quotas.maxContextChunks,
          lawCodesOverride:
            lawCodesParam.length > 0 ? lawCodesParam : undefined,
        });

        // v4-② 검색 후 게이트.
        const postGate = postSearchGate(question, search.hits, gateMode);
        if (!postGate.pass) {
          const refusalText = `${GATE_REFUSAL_TEXT}\n\n※ 본 답변은 참고용이며, 최신 법령·원문 확인이 필요합니다.`;
          savedFullText = refusalText;
          savedErrored = false;
          send({ type: "text", delta: refusalText });
          const messageId = await appendAssistantMessage(
            client,
            conversationId,
            {
              bodyMd: refusalText,
              citations: [],
              retrievalMeta: {
                parsed: search.parsed,
                perPathCounts: search.perPathCounts,
                hitIds: search.hits.map((h) => h.chunkId),
                gate: { stage: "post", decision: postGate },
              },
              tokenUsage: {
                input: 0,
                output: 0,
                model: AI_QNA_MODEL,
                status: "refusal_gate" satisfies AnswerStatus,
              },
            },
          );
          send({
            type: "done",
            messageId,
            citations: [],
            tokenUsage: { input: 0, output: 0 },
            fullText: refusalText,
          });
          return;
        }
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

        for await (const ev of answerQuestion(claudeMessages, search.hits, {
          maxTokens: quota.quotas.maxOutputTokens,
        })) {
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
        // finally 의 LLM 제목 요약을 위해 outer scope 에 복사.
        savedFullText = fullText;
        savedErrored = errored;

        if (!errored) {
          // 3) assistant 메시지 저장 — runAfterResponse 가 아니라 응답 안에 보장
          //    (사용자가 새로고침 시 즉시 보이도록).
          // v4-② 결과 상태 분류 — 모델 거절(시스템 프롬프트 3·5·7) 발화 시 refusal_no_evidence.
          //   본 분류는 향후 차감 로직에서 "거절 호출은 무료" 정합성 근거.
          const status: AnswerStatus = detectModelRefusal(fullText)
            ? "refusal_no_evidence"
            : "success";
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
              tokenUsage: { ...tokenUsage, model: AI_QNA_MODEL, status },
            },
          );
          // v4-③ 전역 사용량 기록 — 차감 정합성상 refusal_* 은 cost 0 (input/output 본인이 0이면 skip).
          //   거절도 모델 호출이 발생했으면 input/output 토큰이 있으므로 그대로 누적 (정직한 비용 추적).
          //   게이트 차단(refusal_gate) 은 위쪽 분기에서 LLM 호출 0 으로 처리됨.
          runAfterResponse(
            recordUsage(adminClient, AI_QNA_MODEL, tokenUsage.input, tokenUsage.output),
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
        // feat-9-004 잔여 ④ — 신규 대화의 제목을 Claude Haiku 로 요약.
        // 정상 답변이 있을 때만 시도. 실패 시 createConversation 의 truncate 제목 그대로 유지.
        if (isNew && !savedErrored && savedFullText.length > 0) {
          runAfterResponse(
            (async () => {
              try {
                const summarized = await summarizeConversationTitle(
                  question,
                  savedFullText,
                );
                if (summarized && summarized.length > 0) {
                  await setConversationTitle(client, conversationId, summarized);
                }
              } catch (e) {
                // Haiku 실패는 silent — truncate 제목 fallback.
                console.warn(
                  "[ai-qna/ask] title 요약 실패:",
                  e instanceof Error ? e.message : e,
                );
              }
            })(),
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

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
