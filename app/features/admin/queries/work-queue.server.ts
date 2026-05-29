// feat-7-032 운영 워크큐 — `/admin` 허브 상단 액션 카운터.
// RPC `admin_work_queue_counts` 가 6개 카운트 한 번에 반환.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export interface AdminWorkQueueCounts {
  newSignupsToday: number;
  subjectivePending: number;
  aiNegativePending: number;
  relationGapsTotal: number;
  inactiveStudents7d: number;
  auditAnomaliesToday: number;
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
  };
}
