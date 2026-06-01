// feat-9-004 AI Q&A 대화 CRUD + 멀티턴 컨텍스트.
// 사용자 학습 데이터 — 본인만 R/W (RLS). soft delete (deleted_at).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { Citation } from "./lib/citations";
import { AI_QNA_MULTITURN_LIMIT } from "./lib/constants";

// ── 타입 ─────────────────────────────────────────────────────────────────

export interface ConversationAnchor {
  sourceType: "article" | "case" | "problem";
  sourceId: string;
}

export interface ConversationSummary {
  conversationId: string;
  title: string | null;
  anchor: ConversationAnchor | null;
  createdAt: string;
  updatedAt: string;
  /** UI 미리보기용 — 마지막 메시지 본문 일부. */
  lastSnippet: string | null;
  /** 메시지 수. */
  messageCount: number;
}

export interface ConversationMessage {
  messageId: string;
  conversationId: string;
  role: "user" | "assistant";
  bodyMd: string;
  citations: Citation[];
  feedback: number | null;
  feedbackNote: string | null;
  createdAt: string;
}

// ── 조회 ─────────────────────────────────────────────────────────────────

/** 본인 대화 목록 (최근 updated_at desc, soft delete 제외). UI 좌측 list 용. */
export async function listMyConversations(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 50,
): Promise<ConversationSummary[]> {
  const { data: convs, error } = await client
    .from("ai_conversations")
    .select("conversation_id, title, anchor, created_at, updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!convs || convs.length === 0) return [];

  const ids = convs.map((c) => c.conversation_id);
  // 메시지 수 + 마지막 본문 snippet — 단순 group by 가 PostgREST 에서 어렵다.
  // last assistant message 한 건씩 fetch (간이).
  const { data: lastMsgs } = await client
    .from("ai_messages")
    .select("conversation_id, role, body_md, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false })
    .limit(ids.length * 3); // 안전 여유
  const snippetByConv = new Map<string, string>();
  const countByConv = new Map<string, number>();
  for (const m of lastMsgs ?? []) {
    countByConv.set(
      m.conversation_id,
      (countByConv.get(m.conversation_id) ?? 0) + 1,
    );
    if (!snippetByConv.has(m.conversation_id)) {
      const snip =
        m.body_md.length > 80 ? m.body_md.slice(0, 80) + "…" : m.body_md;
      snippetByConv.set(m.conversation_id, snip);
    }
  }

  return convs.map((c) => ({
    conversationId: c.conversation_id,
    title: c.title,
    anchor: parseAnchor(c.anchor),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    lastSnippet: snippetByConv.get(c.conversation_id) ?? null,
    messageCount: countByConv.get(c.conversation_id) ?? 0,
  }));
}

/** 단일 대화 + 모든 메시지. 본인만 RLS 통과. */
export async function getConversationWithMessages(
  client: SupabaseClient<Database>,
  conversationId: string,
): Promise<{
  conversation: ConversationSummary;
  messages: ConversationMessage[];
} | null> {
  const { data: conv } = await client
    .from("ai_conversations")
    .select("conversation_id, title, anchor, created_at, updated_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!conv) return null;

  const { data: msgs } = await client
    .from("ai_messages")
    .select(
      "message_id, conversation_id, role, body_md, citations, feedback, feedback_note, created_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  const messages = (msgs ?? []).map((m) => ({
    messageId: m.message_id,
    conversationId: m.conversation_id,
    role: m.role as "user" | "assistant",
    bodyMd: m.body_md,
    citations: parseCitations(m.citations),
    feedback: m.feedback,
    feedbackNote: m.feedback_note,
    createdAt: m.created_at,
  }));

  return {
    conversation: {
      conversationId: conv.conversation_id,
      title: conv.title,
      anchor: parseAnchor(conv.anchor),
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      lastSnippet: messages.length > 0 ? messages[messages.length - 1].bodyMd.slice(0, 80) : null,
      messageCount: messages.length,
    },
    messages,
  };
}

// ── 생성/추가/삭제 ────────────────────────────────────────────────────────

export async function createConversation(
  client: SupabaseClient<Database>,
  userId: string,
  opts: { title?: string | null; anchor?: ConversationAnchor | null } = {},
): Promise<string> {
  const { data, error } = await client
    .from("ai_conversations")
    .insert({
      user_id: userId,
      title: opts.title ?? null,
      anchor: opts.anchor
        ? {
            source_type: opts.anchor.sourceType,
            source_id: opts.anchor.sourceId,
          }
        : null,
    })
    .select("conversation_id")
    .single();
  if (error || !data) throw error ?? new Error("createConversation failed");
  return data.conversation_id;
}

export async function appendUserMessage(
  client: SupabaseClient<Database>,
  conversationId: string,
  bodyMd: string,
): Promise<string> {
  const { data, error } = await client
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      body_md: bodyMd,
    })
    .select("message_id")
    .single();
  if (error || !data) throw error ?? new Error("appendUserMessage failed");
  return data.message_id;
}

export interface AssistantMessageInsert {
  bodyMd: string;
  citations: Citation[];
  retrievalMeta?: unknown;
  tokenUsage?: {
    input: number;
    output: number;
    model: string;
    /**
     * v4-② 결과 상태 — 향후 차감 로직 정합성 근거.
     *   success              : 정상 답변
     *   refusal_no_evidence  : 모델 자체 거절 (시스템 프롬프트 3·5·7) — LLM 호출됨
     *   refusal_gate         : 도메인 게이트 차단 — LLM 호출 없음
     *   error                : 스트림 도중 에러
     * 차감 규칙(향후): success 만 차감. refusal_* 는 무료.
     */
    status?: "success" | "refusal_no_evidence" | "refusal_gate" | "error";
  };
}

/**
 * 시스템 프롬프트의 가드레일 ③⑤ 거절 정형 문장을 감지해 refusal_kind 분류.
 * 가드레일 변경 시 문장도 갱신.
 *
 * ⑤ 자연과학 거절: "자연과학 질문은 현재 AI Q&A 가 지원하지 않습니다. 강사 Q&A 를 이용해 주세요."
 * ③ 근거 부족 거절: "제공된 자료로는 확실히 답하기 어렵습니다. 강사 Q&A 를 이용해 주세요."
 */
export function classifyRefusal(
  bodyMd: string,
): "unsupported_science" | "insufficient_grounds" | null {
  if (bodyMd.includes("자연과학 질문은 현재 AI Q&A")) return "unsupported_science";
  if (bodyMd.includes("제공된 자료로는 확실히 답하기 어렵습니다"))
    return "insufficient_grounds";
  return null;
}

export async function appendAssistantMessage(
  client: SupabaseClient<Database>,
  conversationId: string,
  payload: AssistantMessageInsert,
): Promise<string> {
  const refusalKind = classifyRefusal(payload.bodyMd);
  const { data, error } = await client
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      body_md: payload.bodyMd,
      citations: payload.citations as unknown as Database["public"]["Tables"]["ai_messages"]["Insert"]["citations"],
      retrieval_meta: payload.retrievalMeta as
        | Database["public"]["Tables"]["ai_messages"]["Insert"]["retrieval_meta"]
        | undefined,
      token_usage: payload.tokenUsage as
        | Database["public"]["Tables"]["ai_messages"]["Insert"]["token_usage"]
        | undefined,
      refusal_kind: refusalKind,
    })
    .select("message_id")
    .single();
  if (error || !data) throw error ?? new Error("appendAssistantMessage failed");
  return data.message_id;
}

/** soft delete — deleted_at 만 설정. 메시지는 그대로 (RLS 가 conversation deleted_at 무관하게 conv user_id 만 체크 — 단 listMyConversations 는 deleted_at IS NULL 필터). */
export async function softDeleteConversation(
  client: SupabaseClient<Database>,
  conversationId: string,
): Promise<void> {
  const { error } = await client
    .from("ai_conversations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("conversation_id", conversationId);
  if (error) throw error;
}

/** 첫 사용자 질문에서 제목 추정 — 60자 절단. */
export function autoTitleFromQuestion(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ");
  return trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed;
}

export async function setConversationTitle(
  client: SupabaseClient<Database>,
  conversationId: string,
  title: string,
): Promise<void> {
  const { error } = await client
    .from("ai_conversations")
    .update({ title })
    .eq("conversation_id", conversationId);
  if (error) throw error;
}

/** 메시지에 피드백 (👍=1 / 👎=-1 / 0=clear). 👎 시 자유 사유 note 옵션. */
export async function setMessageFeedback(
  client: SupabaseClient<Database>,
  messageId: string,
  feedback: 1 | -1 | 0,
  note: string | null = null,
): Promise<void> {
  const update: Database["public"]["Tables"]["ai_messages"]["Update"] = {
    feedback: feedback === 0 ? null : feedback,
    feedback_note: feedback === -1 ? note : null,
    feedback_at: feedback === 0 ? null : new Date().toISOString(),
  };
  const { error } = await client
    .from("ai_messages")
    .update(update)
    .eq("message_id", messageId)
    .eq("role", "assistant");
  if (error) throw error;
}

// ── 멀티턴 빌더 ───────────────────────────────────────────────────────────

export interface ClaudeTurnMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * 직전 N 턴(메시지 단위)을 Claude messages 배열로 변환 + 현재 질문을 마지막 user 로 append.
 * AI_QNA_MULTITURN_LIMIT(=4) 메시지가 기본. 더 옛 메시지는 잘라낸다.
 */
export function buildMultiturnMessages(
  history: ReadonlyArray<ConversationMessage>,
  currentQuestion: string,
): ClaudeTurnMessage[] {
  const recent = history.slice(-AI_QNA_MULTITURN_LIMIT);
  const turns: ClaudeTurnMessage[] = recent.map((m) => ({
    role: m.role,
    content: m.bodyMd,
  }));
  turns.push({ role: "user", content: currentQuestion });
  // Claude 는 첫 메시지가 user 여야 한다. 첫 메시지가 assistant 면 제거.
  while (turns.length > 0 && turns[0].role !== "user") {
    turns.shift();
  }
  return turns;
}

// ── helpers ──────────────────────────────────────────────────────────────

function parseAnchor(raw: unknown): ConversationAnchor | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { source_type?: unknown; source_id?: unknown };
  if (
    (obj.source_type === "article" ||
      obj.source_type === "case" ||
      obj.source_type === "problem") &&
    typeof obj.source_id === "string"
  ) {
    return { sourceType: obj.source_type, sourceId: obj.source_id };
  }
  return null;
}

function parseCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  const out: Citation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (
      typeof c.label === "number" &&
      typeof c.chunkId === "string" &&
      (c.sourceType === "article" ||
        c.sourceType === "case" ||
        c.sourceType === "problem") &&
      typeof c.sourceId === "string"
    ) {
      out.push({
        label: c.label,
        chunkId: c.chunkId,
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        headingPath: typeof c.headingPath === "string" ? c.headingPath : "",
      });
    }
  }
  return out;
}
