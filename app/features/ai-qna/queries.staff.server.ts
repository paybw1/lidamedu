// feat-9-005 — 운영자(staff) 전용 AI Q&A 조회 쿼리.
// RLS 가 staff 에게 'feedback IS NOT NULL' 메시지 + 그 부모 대화만 노출하도록 정책 추가됨
// (feat_9_005_ai_messages_feedback_note 마이그레이션). 여기는 서버 측 형 정리 + 직전 user 메시지 매칭.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { Citation } from "./lib/citations";

export interface NegativeFeedbackItem {
  messageId: string;
  conversationId: string;
  userId: string;
  /** assistant 답변 본문. */
  assistantBody: string;
  /** 같은 대화에서 직전 user 메시지(질문). 못 찾으면 null. */
  precedingQuestion: string | null;
  citations: Citation[];
  feedback: number;
  feedbackNote: string | null;
  feedbackAt: string | null;
  createdAt: string;
}

/**
 * 👎 메시지 list — 최근순. limit 100 default.
 *
 * RLS 가 staff & feedback IS NOT NULL 인 메시지/대화만 노출. user_id 는 ai_conversations join 으로.
 */
export async function listNegativeFeedback(
  client: SupabaseClient<Database>,
  limit = 100,
): Promise<NegativeFeedbackItem[]> {
  const { data: msgs, error } = await client
    .from("ai_messages")
    .select(
      "message_id, conversation_id, body_md, citations, feedback, feedback_note, feedback_at, created_at, ai_conversations!inner(user_id)",
    )
    .eq("feedback", -1)
    .order("feedback_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  if (!msgs || msgs.length === 0) return [];

  // 직전 user 메시지 — 같은 conversation 의 created_at < assistant.created_at 중 최신.
  const conversationIds = [...new Set(msgs.map((m) => m.conversation_id))];
  const { data: userMsgs } = await client
    .from("ai_messages")
    .select("conversation_id, role, body_md, created_at")
    .in("conversation_id", conversationIds)
    .eq("role", "user")
    .order("created_at", { ascending: true });

  const byConv = new Map<string, { body_md: string; created_at: string }[]>();
  for (const u of userMsgs ?? []) {
    const arr = byConv.get(u.conversation_id) ?? [];
    arr.push({ body_md: u.body_md, created_at: u.created_at });
    byConv.set(u.conversation_id, arr);
  }

  return msgs.map((m) => {
    const list = byConv.get(m.conversation_id) ?? [];
    // assistant created_at 이전의 마지막 user 메시지.
    let preceding: string | null = null;
    for (const u of list) {
      if (u.created_at < m.created_at) preceding = u.body_md;
      else break;
    }
    return {
      messageId: m.message_id,
      conversationId: m.conversation_id,
      userId: m.ai_conversations.user_id,
      assistantBody: m.body_md,
      precedingQuestion: preceding,
      citations: parseCitations(m.citations),
      feedback: m.feedback as number,
      feedbackNote: m.feedback_note,
      feedbackAt: m.feedback_at,
      createdAt: m.created_at,
    };
  });
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
