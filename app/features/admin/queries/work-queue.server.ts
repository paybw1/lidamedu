// feat-7-032 운영 워크큐 — `/admin` 허브 상단 액션 카운터.
// RPC `admin_work_queue_counts` 가 콘텐츠·수강생 축 카운트를 한 번에 반환하고,
// 문의·등업·신고 등 도메인 큐는 경량 head-count 로 합산(adminClient — RLS 0-count 회피).
// 매출·운영(SLA·환불·배송·무통장)은 manager+ 전용 별도 집계(getManagerWorkQueue).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { getPendingRefundCount } from "~/features/orders/refund-requests.server";
import { getQnaSlaBreachCount } from "~/features/qna/sla.server";

export interface AdminWorkQueueCounts {
  newSignupsToday: number;
  aiNegativePending: number;
  relationGapsTotal: number;
  inactiveStudents7d: number;
  auditAnomaliesToday: number;
  problemsReviewPending: number;
  // 도메인 큐 — head-count 합산.
  csInquiriesPending: number;
  cohortUpgradePending: number;
  communityReportsPending: number;
}

export async function getAdminWorkQueue(
  client: SupabaseClient<Database>,
): Promise<AdminWorkQueueCounts> {
  const [rpcRes, csOpen, upgradePending, reportsPending] = await Promise.all([
    client.rpc("admin_work_queue_counts"),
    adminClient
      .from("cs_inquiries")
      .select("inquiry_id", { count: "exact", head: true })
      .eq("status", "open")
      .is("deleted_at", null),
    adminClient
      .from("cohort_upgrade_requests")
      .select("request_id", { count: "exact", head: true })
      .eq("status", "pending"),
    adminClient
      .from("community_reports")
      .select("report_id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  if (rpcRes.error) throw rpcRes.error;
  const row = (rpcRes.data ?? [])[0];
  return {
    newSignupsToday: Number(row?.new_signups_today ?? 0),
    aiNegativePending: Number(row?.ai_negative_pending ?? 0),
    relationGapsTotal: Number(row?.relation_gaps_total ?? 0),
    inactiveStudents7d: Number(row?.inactive_students_7d ?? 0),
    auditAnomaliesToday: Number(row?.audit_anomalies_today ?? 0),
    problemsReviewPending: Number(row?.problems_review_pending ?? 0),
    csInquiriesPending: csOpen.count ?? 0,
    cohortUpgradePending: upgradePending.count ?? 0,
    communityReportsPending: reportsPending.count ?? 0,
  };
}

// 매출·운영 워크큐 — SLA 위반 Q&A + 환불/배송/무통장 대기. manager+ 게이트(민감 링크·
// 집계)라 허브 loader 에서 역할 확인 후에만 호출한다. 전부 경량 head-count.
export interface ManagerWorkQueueCounts {
  qnaSlaBreaches: number;
  refundsPending: number;
  shipmentsPending: number;
  bankTransfersPending: number;
}

export async function getManagerWorkQueue(): Promise<ManagerWorkQueueCounts> {
  const [qnaSlaBreaches, refundsPending, shipmentsRes, bankRes] =
    await Promise.all([
      getQnaSlaBreachCount(),
      getPendingRefundCount(),
      // 배송 대기 = 아직 발송 전(preparing).
      adminClient
        .from("shipments")
        .select("*", { count: "exact", head: true })
        .eq("status", "preparing"),
      // 무통장 입금 대기 = 입금 미확인.
      adminClient
        .from("bank_transfers")
        .select("transfer_id", { count: "exact", head: true })
        .is("deposited_at", null),
    ]);
  return {
    qnaSlaBreaches,
    refundsPending,
    shipmentsPending: shipmentsRes.count ?? 0,
    bankTransfersPending: bankRes.count ?? 0,
  };
}
