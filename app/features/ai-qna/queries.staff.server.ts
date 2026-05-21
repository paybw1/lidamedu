// feat-9-005 — 운영자(staff) 전용 AI Q&A 조회/관리 쿼리.
//
// 피드백 큐(ai_messages) 는 ai_msg_owner_read RLS 와 사이클을 만들어 staff 정책이 제거됨.
// → 모든 함수는 supa-admin-client(service_role) 사용. 호출부에서 staff 권한 검증 필수.
// 단 ai_eval_items 는 자체 staff RLS 가 있어 사용자 client 도 가능하지만, 일관성을 위해 admin 사용.

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

// ── feat-9-005 v1.1 eval 데이터셋 CRUD ────────────────────────────────────

export interface EvalReferenceSource {
  sourceType: "article" | "case" | "problem";
  sourceId: string;
  headingPath?: string;
  note?: string;
}

export interface EvalItem {
  evalItemId: string;
  question: string;
  referenceAnswer: string;
  referenceSources: EvalReferenceSource[];
  sourceMessageId: string | null;
  lawCodes: string[];
  difficulty: number;
  tags: string[];
  status: "active" | "archived";
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToEvalItem(
  r: {
    eval_item_id: string;
    question: string;
    reference_answer: string;
    reference_sources: unknown;
    source_message_id: string | null;
    law_codes: string[] | null;
    difficulty: number;
    tags: string[] | null;
    status: string;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  },
): EvalItem {
  return {
    evalItemId: r.eval_item_id,
    question: r.question,
    referenceAnswer: r.reference_answer,
    referenceSources: parseEvalSources(r.reference_sources),
    sourceMessageId: r.source_message_id,
    lawCodes: r.law_codes ?? [],
    difficulty: r.difficulty,
    tags: r.tags ?? [],
    status: r.status === "archived" ? "archived" : "active",
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function parseEvalSources(raw: unknown): EvalReferenceSource[] {
  if (!Array.isArray(raw)) return [];
  const out: EvalReferenceSource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (
      (s.sourceType === "article" ||
        s.sourceType === "case" ||
        s.sourceType === "problem") &&
      typeof s.sourceId === "string"
    ) {
      out.push({
        sourceType: s.sourceType,
        sourceId: s.sourceId,
        headingPath: typeof s.headingPath === "string" ? s.headingPath : undefined,
        note: typeof s.note === "string" ? s.note : undefined,
      });
    }
  }
  return out;
}

export interface ListEvalItemsOptions {
  status?: "active" | "archived";
  lawCode?: string;
  tag?: string;
  search?: string;
  limit?: number;
}

export async function listEvalItems(
  opts: ListEvalItemsOptions = {},
): Promise<EvalItem[]> {
  let q = adminClient
    .from("ai_eval_items")
    .select(
      "eval_item_id, question, reference_answer, reference_sources, source_message_id, law_codes, difficulty, tags, status, notes, created_by, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.lawCode) q = q.contains("law_codes", [opts.lawCode]);
  if (opts.tag) q = q.contains("tags", [opts.tag]);
  if (opts.search && opts.search.trim().length > 0) {
    const s = opts.search.trim().replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${s}%`;
    q = q.or(`question.ilike.${pattern},reference_answer.ilike.${pattern}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToEvalItem);
}

export async function getEvalItem(
  evalItemId: string,
): Promise<EvalItem | null> {
  const { data, error } = await adminClient
    .from("ai_eval_items")
    .select(
      "eval_item_id, question, reference_answer, reference_sources, source_message_id, law_codes, difficulty, tags, status, notes, created_by, created_at, updated_at",
    )
    .eq("eval_item_id", evalItemId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToEvalItem(data) : null;
}

export interface UpsertEvalItemInput {
  question: string;
  referenceAnswer: string;
  referenceSources?: EvalReferenceSource[];
  sourceMessageId?: string | null;
  lawCodes?: string[];
  difficulty?: number;
  tags?: string[];
  notes?: string | null;
}

export async function createEvalItem(
  input: UpsertEvalItemInput,
  createdBy: string,
): Promise<{ ok: true; evalItemId: string } | { ok: false; error: string }> {
  const row = {
    question: input.question,
    reference_answer: input.referenceAnswer,
    reference_sources: (input.referenceSources ?? []) as unknown,
    source_message_id: input.sourceMessageId ?? null,
    law_codes: input.lawCodes ?? [],
    difficulty:
      input.difficulty != null && input.difficulty >= 1 && input.difficulty <= 5
        ? input.difficulty
        : 3,
    tags: input.tags ?? [],
    notes: input.notes ?? null,
    created_by: createdBy,
  };
  const { data, error } = await adminClient
    .from("ai_eval_items")
    // jsonb 컬럼(reference_sources) 의 generated 타입이 좁아 직접 array 가 호환 안 되는 경우 회피.
    .insert(row as never)
    .select("eval_item_id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "create failed" };
  return { ok: true, evalItemId: data.eval_item_id };
}

export async function updateEvalItem(
  evalItemId: string,
  patch: Partial<UpsertEvalItemInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.question !== undefined) update.question = patch.question;
  if (patch.referenceAnswer !== undefined)
    update.reference_answer = patch.referenceAnswer;
  if (patch.referenceSources !== undefined)
    update.reference_sources = patch.referenceSources;
  if (patch.sourceMessageId !== undefined)
    update.source_message_id = patch.sourceMessageId;
  if (patch.lawCodes !== undefined) update.law_codes = patch.lawCodes;
  if (patch.difficulty !== undefined && patch.difficulty >= 1 && patch.difficulty <= 5)
    update.difficulty = patch.difficulty;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await adminClient
    .from("ai_eval_items")
    .update(update)
    .eq("eval_item_id", evalItemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setEvalItemStatus(
  evalItemId: string,
  status: "active" | "archived",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient
    .from("ai_eval_items")
    .update({ status })
    .eq("eval_item_id", evalItemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * 👎 메시지에서 prefill 용 정보 추출 — 신규 eval 폼 진입 시 사용.
 * 메시지·부모 대화·직전 user 메시지 한 번에.
 */
export interface EvalPrefillFromMessage {
  messageId: string;
  conversationId: string;
  question: string | null;       // 직전 user 메시지
  assistantBody: string;          // 그 메시지 본문 — 강사 교정 베이스
  citations: Citation[];
  feedbackNote: string | null;
}

export async function getEvalPrefillFromMessage(
  messageId: string,
): Promise<EvalPrefillFromMessage | null> {
  const { data: msg } = await adminClient
    .from("ai_messages")
    .select(
      "message_id, conversation_id, body_md, citations, feedback_note, created_at",
    )
    .eq("message_id", messageId)
    .maybeSingle();
  if (!msg) return null;
  const { data: userMsgs } = await adminClient
    .from("ai_messages")
    .select("body_md, created_at")
    .eq("conversation_id", msg.conversation_id)
    .eq("role", "user")
    .lt("created_at", msg.created_at)
    .order("created_at", { ascending: false })
    .limit(1);
  const preceding = userMsgs?.[0]?.body_md ?? null;
  return {
    messageId: msg.message_id,
    conversationId: msg.conversation_id,
    question: preceding,
    assistantBody: msg.body_md,
    citations: parseCitations(msg.citations),
    feedbackNote: msg.feedback_note,
  };
}
