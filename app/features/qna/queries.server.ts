import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  QnaCitation,
  QnaMessage,
  QnaQualityGrade,
  QnaStatus,
  QnaTargetType,
  QnaThreadDetail,
  QnaThreadSummary,
} from "./labels";

export type {
  QnaCitation,
  QnaMessage,
  QnaQualityGrade,
  QnaStatus,
  QnaTargetType,
  QnaThreadDetail,
  QnaThreadSummary,
} from "./labels";

const SUMMARY_COLUMNS = `
  thread_id,
  target_type,
  target_id,
  subject,
  asker_id,
  answerer_id,
  title,
  status,
  quality_grade,
  created_at,
  answered_at,
  updated_at,
  asker:profiles!qna_threads_asker_id_fkey ( profile_id, name ),
  answerer:profiles!qna_threads_answerer_id_fkey ( profile_id, name )
`;

const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, question_md, answer_md`;

type RawSummaryRow = {
  thread_id: string;
  target_type: QnaTargetType;
  target_id: string | null;
  subject: string | null;
  asker_id: string;
  answerer_id: string | null;
  title: string;
  status: QnaStatus;
  quality_grade: QnaQualityGrade | null;
  created_at: string;
  answered_at: string | null;
  updated_at: string;
  asker: { profile_id: string; name: string } | null;
  answerer: { profile_id: string; name: string } | null;
};

type RawDetailRow = RawSummaryRow & {
  question_md: string;
  answer_md: string | null;
};

function toSummary(row: RawSummaryRow): QnaThreadSummary {
  return {
    threadId: row.thread_id,
    targetType: row.target_type,
    targetId: row.target_id,
    subject: row.subject,
    askerId: row.asker_id,
    askerName: row.asker?.name ?? null,
    answererId: row.answerer_id,
    answererName: row.answerer?.name ?? null,
    title: row.title,
    status: row.status,
    qualityGrade: row.quality_grade,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
    updatedAt: row.updated_at,
  };
}

function toDetail(row: RawDetailRow): QnaThreadDetail {
  return {
    ...toSummary(row),
    questionMd: row.question_md,
    answerMd: row.answer_md,
  };
}

// 엔티티 단위(조문/판례/문제) 패널용 — 해당 target 의 스레드 목록.
export async function listThreadsForTarget(
  client: SupabaseClient<Database>,
  targetType: QnaTargetType,
  targetId: string,
  limit = 20,
): Promise<QnaThreadSummary[]> {
  const { data, error } = await client
    .from("qna_threads")
    .select(SUMMARY_COLUMNS)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as RawSummaryRow[] | null ?? []).map(toSummary);
}

export interface ListFilter {
  scope: "all" | "asked-by-me" | "answered-by-me" | "open";
  query?: string;
  targetType?: QnaTargetType;
  /** 과목 분류 필터(law_code 류). */
  subject?: string;
  limit?: number;
}

// 통합 목록(검색/필터). RLS 가 가시성 처리하므로 추가 권한 체크 불요.
export async function listThreads(
  client: SupabaseClient<Database>,
  userId: string,
  filter: ListFilter,
): Promise<QnaThreadSummary[]> {
  let q = client
    .from("qna_threads")
    .select(SUMMARY_COLUMNS)
    .is("deleted_at", null);

  if (filter.targetType) q = q.eq("target_type", filter.targetType);
  if (filter.subject) q = q.eq("subject", filter.subject);

  if (filter.scope === "asked-by-me") {
    q = q.eq("asker_id", userId);
  } else if (filter.scope === "answered-by-me") {
    q = q.eq("answerer_id", userId);
  } else if (filter.scope === "open") {
    q = q.eq("status", "open");
  }

  if (filter.query && filter.query.trim().length > 0) {
    const term = filter.query.trim().replace(/[,()]/g, " ");
    // title / question_md / answer_md ILIKE OR
    q = q.or(
      `title.ilike.%${term}%,question_md.ilike.%${term}%,answer_md.ilike.%${term}%`,
    );
  }

  q = q.order("created_at", { ascending: false }).limit(filter.limit ?? 50);

  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as RawSummaryRow[] | null ?? []).map(toSummary);
}

// 스레드 타임라인 메시지(AI 즉답·강사·학생 후속). 공개 읽기(RLS), soft-delete 제외.
function parseCitations(raw: unknown): QnaCitation[] {
  if (!Array.isArray(raw)) return [];
  const out: QnaCitation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (
      typeof c.label === "number" &&
      typeof c.sourceType === "string" &&
      typeof c.sourceId === "string"
    ) {
      out.push({
        label: c.label,
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        headingPath: typeof c.headingPath === "string" ? c.headingPath : "",
      });
    }
  }
  return out;
}

type RawMessageRow = {
  message_id: string;
  thread_id: string;
  role: QnaMessage["role"];
  author_id: string | null;
  body_md: string;
  citations: unknown;
  verifies_message_id: string | null;
  verdict: string | null;
  verified_at: string | null;
  feedback: number | null;
  created_at: string;
  author: { profile_id: string; name: string } | null;
  verifier: { profile_id: string; name: string } | null;
};

export async function listThreadMessages(
  client: SupabaseClient<Database>,
  threadId: string,
): Promise<QnaMessage[]> {
  const { data, error } = await client
    .from("qna_messages")
    .select(
      `message_id, thread_id, role, author_id, body_md, citations,
       verifies_message_id, verdict, verified_at, feedback, created_at,
       author:profiles!qna_messages_author_id_fkey ( profile_id, name ),
       verifier:profiles!qna_messages_verified_by_fkey ( profile_id, name )`,
    )
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as unknown as RawMessageRow[] | null) ?? []).map((r) => ({
    messageId: r.message_id,
    threadId: r.thread_id,
    role: r.role,
    authorId: r.author_id,
    authorName: r.author?.name ?? null,
    bodyMd: r.body_md,
    citations: parseCitations(r.citations),
    verifiesMessageId: r.verifies_message_id,
    verdict: r.verdict === "correct" || r.verdict === "incorrect" ? r.verdict : null,
    verifiedByName: r.verifier?.name ?? null,
    verifiedAt: r.verified_at,
    feedback: r.feedback,
    createdAt: r.created_at,
  }));
}

/**
 * 강사의 AI 답변 정오 평가. staff 만(RLS + 액션 게이트). AI 메시지에 verdict 부착하고
 * 스레드 상태를 조정한다 — 정확→verified, 부정확→ai_answered(강사 정정답변 폼 재노출).
 * 그 사이 강사 정식답변(answer_md)으로 answered/closed 된 스레드는 상태를 건드리지 않음.
 */
export async function setAiVerdict(
  client: SupabaseClient<Database>,
  verifierId: string,
  input: { threadId: string; messageId: string; verdict: "correct" | "incorrect" },
): Promise<void> {
  const { error: msgError } = await client
    .from("qna_messages")
    .update({
      verdict: input.verdict,
      verified_by: verifierId,
      verified_at: new Date().toISOString(),
    })
    .eq("message_id", input.messageId)
    .eq("thread_id", input.threadId)
    .eq("role", "ai")
    .is("deleted_at", null);
  if (msgError) throw msgError;

  if (input.verdict === "correct") {
    const { error } = await client
      .from("qna_threads")
      .update({ status: "verified" })
      .eq("thread_id", input.threadId)
      .is("deleted_at", null)
      .in("status", ["ai_answered", "verified"]);
    if (error) throw error;
  } else {
    // 부정확 — verified 였다면 ai_answered 로 되돌려 강사 정정답변 폼을 다시 띄운다.
    const { error } = await client
      .from("qna_threads")
      .update({ status: "ai_answered" })
      .eq("thread_id", input.threadId)
      .is("deleted_at", null)
      .eq("status", "verified");
    if (error) throw error;
  }
}

export async function getThreadDetail(
  client: SupabaseClient<Database>,
  threadId: string,
): Promise<QnaThreadDetail | null> {
  const { data, error } = await client
    .from("qna_threads")
    .select(DETAIL_COLUMNS)
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toDetail(data as unknown as RawDetailRow);
}

// 콘텐츠 대상(조문/판례/문제)의 과목(law_code) 도출 — 과목 분류 필터용.
async function resolveSubjectForTarget(
  client: SupabaseClient<Database>,
  targetType: QnaTargetType,
  targetId: string,
): Promise<string | null> {
  if (targetType === "article") {
    const { data } = await client
      .from("articles")
      .select("laws(law_code)")
      .eq("article_id", targetId)
      .maybeSingle();
    return data?.laws?.law_code ?? null;
  }
  if (targetType === "case") {
    const { data } = await client
      .from("cases")
      .select("subject_laws")
      .eq("case_id", targetId)
      .maybeSingle();
    return data?.subject_laws?.[0] ?? null;
  }
  if (targetType === "problem") {
    const { data } = await client
      .from("problems")
      .select("laws(law_code)")
      .eq("problem_id", targetId)
      .maybeSingle();
    return data?.laws?.law_code ?? null;
  }
  return null;
}

export async function createThread(
  client: SupabaseClient<Database>,
  asker_id: string,
  input: {
    targetType: QnaTargetType;
    /** study_method 는 null(콘텐츠 앵커 없음). */
    targetId: string | null;
    title: string;
    questionMd: string;
    /** study_method 필수. 콘텐츠 대상은 미지정 시 대상에서 도출. */
    subject?: string | null;
  },
): Promise<QnaThreadDetail> {
  const subject =
    input.targetType === "study_method"
      ? (input.subject ?? null)
      : input.targetId
        ? await resolveSubjectForTarget(
            client,
            input.targetType,
            input.targetId,
          )
        : (input.subject ?? null);
  const { data, error } = await client
    .from("qna_threads")
    .insert({
      target_type: input.targetType,
      target_id: input.targetType === "study_method" ? null : input.targetId,
      asker_id,
      title: input.title,
      question_md: input.questionMd,
      subject,
    })
    .select(DETAIL_COLUMNS)
    .single();
  if (error) throw error;
  return toDetail(data as unknown as RawDetailRow);
}

export async function answerThread(
  client: SupabaseClient<Database>,
  answerer_id: string,
  threadId: string,
  input: { answerMd: string; qualityGrade: QnaQualityGrade },
): Promise<QnaThreadDetail> {
  const { data, error } = await client
    .from("qna_threads")
    .update({
      answerer_id,
      answer_md: input.answerMd,
      quality_grade: input.qualityGrade,
      status: "answered",
      answered_at: new Date().toISOString(),
    })
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .select(DETAIL_COLUMNS)
    .single();
  if (error) throw error;
  return toDetail(data as unknown as RawDetailRow);
}

export async function closeThread(
  client: SupabaseClient<Database>,
  threadId: string,
): Promise<void> {
  const { error } = await client
    .from("qna_threads")
    .update({ status: "closed" })
    .eq("thread_id", threadId)
    .is("deleted_at", null);
  if (error) throw error;
}

export async function softDeleteThread(
  client: SupabaseClient<Database>,
  threadId: string,
): Promise<void> {
  // soft-delete 는 SECURITY DEFINER RPC 로 — SELECT 정책(deleted_at IS NULL)이
  // UPDATE 새 행을 막아 직접 UPDATE 는 RLS(42501)로 실패. RPC 가 asker/answerer/staff
  // 검사 후 우회.
  const { error } = await client.rpc("soft_delete_qna_thread", {
    p_id: threadId,
  });
  if (error) throw error;
}
