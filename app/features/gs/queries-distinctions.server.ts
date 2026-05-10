// 우수 답안 마킹 + 포인트 원장.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export interface Distinction {
  distinctionId: string;
  roundId: string;
  submissionId: string;
  questionId: string | null; // null = 회차 종합
  reason: string | null;
  isPublished: boolean;
  isAnonymous: boolean;
  pointsAwarded: number;
  createdAt: string;
}

function mapDistinction(
  r: Database["public"]["Tables"]["gs_distinguished_answers"]["Row"],
): Distinction {
  return {
    distinctionId: r.distinction_id,
    roundId: r.round_id,
    submissionId: r.submission_id,
    questionId: r.question_id,
    reason: r.reason,
    isPublished: r.is_published,
    isAnonymous: r.is_anonymous,
    pointsAwarded: Number(r.points_awarded),
    createdAt: r.created_at,
  };
}

export async function listDistinctionsForRound(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<Distinction[]> {
  const { data, error } = await client
    .from("gs_distinguished_answers")
    .select("*")
    .eq("round_id", roundId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapDistinction);
}

// 학생용 — 공개된 우수 답안만 + 답안 본문/첨부와 작성자 익명화 처리는 호출 측에서.
export async function listPublishedDistinctionsForRound(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<Distinction[]> {
  const { data, error } = await client
    .from("gs_distinguished_answers")
    .select("*")
    .eq("round_id", roundId)
    .eq("is_published", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapDistinction);
}

export async function markDistinguished(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    roundId: string;
    submissionId: string;
    questionId: string | null;
    reason: string | null;
    isPublished: boolean;
    isAnonymous: boolean;
    pointsAwarded: number;
  },
): Promise<Distinction> {
  const { data, error } = await client
    .from("gs_distinguished_answers")
    .insert({
      round_id: input.roundId,
      submission_id: input.submissionId,
      question_id: input.questionId,
      reason: input.reason,
      is_published: input.isPublished,
      is_anonymous: input.isAnonymous,
      points_awarded: input.pointsAwarded,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  const dist = mapDistinction(data);

  // 포인트 동시 지급 — 답안 작성자에게.
  if (dist.pointsAwarded > 0) {
    const { data: sub } = await client
      .from("gs_submissions")
      .select("user_id")
      .eq("submission_id", dist.submissionId)
      .maybeSingle();
    if (sub) {
      await awardPoints(client, userId, {
        userId: sub.user_id,
        amount: dist.pointsAwarded,
        source:
          dist.questionId == null
            ? "distinguished_round"
            : "distinguished_question",
        sourceRef: dist.distinctionId,
        description:
          dist.questionId == null
            ? "회차 종합 우수 답안"
            : "문항 우수 답안",
      });
    }
  }
  return dist;
}

export async function updateDistinction(
  client: SupabaseClient<Database>,
  distinctionId: string,
  patch: Partial<{
    reason: string | null;
    isPublished: boolean;
    isAnonymous: boolean;
  }>,
): Promise<void> {
  const upd: Record<string, unknown> = {};
  if (patch.reason !== undefined) upd.reason = patch.reason;
  if (patch.isPublished !== undefined) upd.is_published = patch.isPublished;
  if (patch.isAnonymous !== undefined) upd.is_anonymous = patch.isAnonymous;
  if (Object.keys(upd).length === 0) return;
  const { error } = await client
    .from("gs_distinguished_answers")
    .update(upd)
    .eq("distinction_id", distinctionId);
  if (error) throw error;
}

// 마킹 해제 — 지급된 포인트는 자동 회수(원래 amount 만큼 음수 ledger 추가).
export async function unmarkDistinguished(
  client: SupabaseClient<Database>,
  distinctionId: string,
  graderId: string,
): Promise<void> {
  const { data: dist } = await client
    .from("gs_distinguished_answers")
    .select("*")
    .eq("distinction_id", distinctionId)
    .maybeSingle();
  if (!dist) return;
  if (Number(dist.points_awarded) > 0) {
    const { data: sub } = await client
      .from("gs_submissions")
      .select("user_id")
      .eq("submission_id", dist.submission_id)
      .maybeSingle();
    if (sub) {
      await awardPoints(client, graderId, {
        userId: sub.user_id,
        amount: -Number(dist.points_awarded),
        source: "distinction_revoked",
        sourceRef: dist.distinction_id,
        description: "우수 답안 마킹 해제로 인한 포인트 회수",
      });
    }
  }
  await client
    .from("gs_distinguished_answers")
    .delete()
    .eq("distinction_id", distinctionId);
}

// ---- 포인트 ----

export interface PointsLedgerRow {
  ledgerId: string;
  userId: string;
  amount: number;
  source: string;
  sourceRef: string | null;
  description: string | null;
  createdAt: string;
}

function mapLedger(
  r: Database["public"]["Tables"]["gs_points_ledger"]["Row"],
): PointsLedgerRow {
  return {
    ledgerId: r.ledger_id,
    userId: r.user_id,
    amount: Number(r.amount),
    source: r.source,
    sourceRef: r.source_ref,
    description: r.description,
    createdAt: r.created_at,
  };
}

export async function awardPoints(
  client: SupabaseClient<Database>,
  granterId: string,
  input: {
    userId: string;
    amount: number;
    source: string;
    sourceRef?: string | null;
    description?: string | null;
  },
): Promise<void> {
  if (input.amount === 0) return;
  const { error } = await client.from("gs_points_ledger").insert({
    user_id: input.userId,
    amount: input.amount,
    source: input.source,
    source_ref: input.sourceRef ?? null,
    description: input.description ?? null,
    created_by: granterId,
  });
  if (error) throw error;
}

export async function listOwnPointsLedger(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<PointsLedgerRow[]> {
  const { data, error } = await client
    .from("gs_points_ledger")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapLedger);
}

export async function listPointsLedgerForUser(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<PointsLedgerRow[]> {
  // staff 가 다른 학생 이력 조회 — RLS 정책이 차단.
  const { data, error } = await client
    .from("gs_points_ledger")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapLedger);
}

export async function getMyPointsBalance(
  client: SupabaseClient<Database>,
): Promise<{ balance: number; txCount: number }> {
  const { data, error } = await client.rpc("gs_my_points_balance");
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    balance: Number(row?.balance ?? 0),
    txCount: Number(row?.tx_count ?? 0),
  };
}

export interface TopBalance {
  userId: string;
  userName: string | null;
  balance: number;
  txCount: number;
}

export async function listTopPointsBalances(
  client: SupabaseClient<Database>,
  limit = 100,
): Promise<TopBalance[]> {
  const { data, error } = await client.rpc("gs_points_top_balances", {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    balance: Number(r.balance ?? 0),
    txCount: Number(r.tx_count ?? 0),
  }));
}
