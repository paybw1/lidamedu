// feat-9-005 — 운영자(staff) 전용 AI Q&A 조회 쿼리.
//
// RLS staff 정책은 무한 재귀 문제로 제거됨 (ai_msg_owner_read 가 ai_conversations 를 참조해
// ai_conv_staff_review 의 ai_messages 참조와 사이클). 대신 service_role admin client 로 직접 조회.
// 호출부는 반드시 staff 권한을 미리 확인하고 호출할 것 (queries.staff.server.ts 라는 이름이 표시).

import adminClient from "~/core/lib/supa-admin-client.server";

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
 * 호출부에서 staff 권한 검증 후 호출.
 */
export async function listNegativeFeedback(
  limit = 100,
): Promise<NegativeFeedbackItem[]> {
  const { data: msgs, error } = await adminClient
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
  const { data: userMsgs } = await adminClient
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
