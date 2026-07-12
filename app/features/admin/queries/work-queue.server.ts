// feat-7-032 운영 워크큐 — `/admin` 허브 상단 액션 카운터.
// RPC `admin_work_queue_counts` 가 콘텐츠·수강생 축 7개 카운트를 한 번에 반환.
// 매출·운영(SLA 위반·환불 대기)은 manager+ 전용 별도 집계(getManagerWorkQueue).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { getPendingRefundCount } from "~/features/orders/refund-requests.server";
import { getQnaSlaBreachCount } from "~/features/qna/sla.server";

export interface AdminWorkQueueCounts {
  newSignupsToday: number;
  subjectivePending: number;
  aiNegativePending: number;
  relationGapsTotal: number;
  inactiveStudents7d: number;
  auditAnomaliesToday: number;
  problemsReviewPending: number;
}

export async function getAdminWorkQueue(
  client: SupabaseClient<Database>,
): Promise<AdminWorkQueueCounts> {
  const { data, error } = await client.rpc("admin_work_queue_counts");
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    newSignupsToday: Number(row?.new_signups_today ?? 0),
    subjectivePending: Number(row?.subjective_pending ?? 0),
    aiNegativePending: Number(row?.ai_negative_pending ?? 0),
    relationGapsTotal: Number(row?.relation_gaps_total ?? 0),
    inactiveStudents7d: Number(row?.inactive_students_7d ?? 0),
    auditAnomaliesToday: Number(row?.audit_anomalies_today ?? 0),
    problemsReviewPending: Number(row?.problems_review_pending ?? 0),
  };
}

// 매출·운영 워크큐 — SLA 위반 Q&A + 환불 대기. manager+ 게이트(민감 링크·집계)라
// 허브 loader 에서 역할 확인 후에만 호출한다. 두 카운트는 경량 head-count.
export interface ManagerWorkQueueCounts {
  qnaSlaBreaches: number;
  refundsPending: number;
}

export async function getManagerWorkQueue(): Promise<ManagerWorkQueueCounts> {
  const [qnaSlaBreaches, refundsPending] = await Promise.all([
    getQnaSlaBreachCount(),
    getPendingRefundCount(),
  ]);
  return { qnaSlaBreaches, refundsPending };
}
