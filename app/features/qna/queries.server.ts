import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  QnaQualityGrade,
  QnaStatus,
  QnaTargetType,
  QnaThreadDetail,
  QnaThreadSummary,
} from "./labels";

export type {
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
  target_id: string;
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

export async function createThread(
  client: SupabaseClient<Database>,
  asker_id: string,
  input: {
    targetType: QnaTargetType;
    targetId: string;
    title: string;
    questionMd: string;
  },
): Promise<QnaThreadDetail> {
  const { data, error } = await client
    .from("qna_threads")
    .insert({
      target_type: input.targetType,
      target_id: input.targetId,
      asker_id,
      title: input.title,
      question_md: input.questionMd,
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
  const { error } = await client
    .from("qna_threads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("thread_id", threadId);
  if (error) throw error;
}
