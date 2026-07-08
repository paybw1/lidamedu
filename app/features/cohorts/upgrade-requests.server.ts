// 종합반 등업 신청 — 학생 신청(RLS client) → 운영자 승인(반 배정)/거절(adminClient).
// 승인 = cohort_members insert 가 곧 등업(등급 리졸버가 cohort 멤버십에서 파생).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { getDutyRecipientIds } from "~/features/admin/lib/duties.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

// ── 학생: 신청 ──────────────────────────────────────────────────────────────

export async function createUpgradeRequest(
  client: SupabaseClient<Database>,
  userId: string,
  message: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 이미 종합반이면 신청 불필요.
  const { data: cm } = await adminClient
    .from("cohort_members")
    .select("cohort_id, cohorts!inner(is_archived, deleted_at)")
    .eq("profile_id", userId);
  const activeMember = (cm ?? []).some(
    (r) => r.cohorts && !r.cohorts.is_archived && r.cohorts.deleted_at === null,
  );
  if (activeMember) {
    return { ok: false, error: "이미 종합반 수강생입니다." };
  }
  // 학생 소유 insert — RLS(user_id = auth.uid()) 강제. 대기 중 중복은 unique 인덱스가 차단.
  const { error } = await client.from("cohort_upgrade_requests").insert({
    user_id: userId,
    message: message?.trim() || null,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "이미 접수된 신청이 있습니다. 처리를 기다려 주세요." };
    }
    return { ok: false, error: error.message };
  }
  // 담당자(관리자 관리에서 지정, 없으면 admin+manager 전체) 알림 —
  // 실패해도 신청은 유효(응답 전 await, 헬퍼가 자체 삼킴).
  const recipientIds = await getDutyRecipientIds("upgrade_request");
  const { data: prof } = await adminClient
    .from("profiles")
    .select("name, member_no")
    .eq("profile_id", userId)
    .maybeSingle();
  await createUserNotifications({
    recipientIds,
    kind: "cohort_upgrade_requested",
    entityType: "cohort_upgrade_request",
    entityId: userId,
    title: "종합반 등업 신청",
    body: `${prof?.name ?? "학생"}(회원번호 ${prof?.member_no ?? "-"}) 님이 종합반 등업을 신청했습니다.`,
    href: "/admin/cohort-requests",
  });
  return { ok: true };
}

/** pricing 카드 상태 — 내 대기 중 신청 여부. */
export async function hasPendingUpgradeRequest(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data } = await client
    .from("cohort_upgrade_requests")
    .select("request_id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  return !!data;
}

// ── 운영자: 목록·승인·거절 ──────────────────────────────────────────────────

export interface UpgradeRequestRow {
  requestId: string;
  userId: string;
  userName: string | null;
  memberNo: number | null;
  phone: string | null;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  cohortName: string | null;
  adminNote: string | null;
  processedAt: string | null;
  processedByName: string | null;
  createdAt: string;
}

export async function listUpgradeRequests(): Promise<UpgradeRequestRow[]> {
  const { data, error } = await adminClient
    .from("cohort_upgrade_requests")
    .select(
      "request_id, user_id, message, status, admin_note, processed_at, created_at, applicant:profiles!user_id(name, member_no, phone_e164), processor:profiles!processed_by(name), cohorts(name)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    requestId: r.request_id,
    userId: r.user_id,
    userName: r.applicant?.name ?? null,
    memberNo: r.applicant?.member_no ?? null,
    phone: r.applicant?.phone_e164 ?? null,
    message: r.message,
    status: r.status as UpgradeRequestRow["status"],
    cohortName: r.cohorts?.name ?? null,
    adminNote: r.admin_note,
    processedAt: r.processed_at,
    processedByName: r.processor?.name ?? null,
    createdAt: r.created_at,
  }));
}

export async function approveUpgradeRequest(
  requestId: string,
  cohortId: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: req } = await adminClient
    .from("cohort_upgrade_requests")
    .select("request_id, user_id, status")
    .eq("request_id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "신청 없음" };
  if (req.status !== "pending")
    return { ok: false, error: "이미 처리된 신청입니다." };
  const { data: cohort } = await adminClient
    .from("cohorts")
    .select("cohort_id, name, is_archived, deleted_at")
    .eq("cohort_id", cohortId)
    .maybeSingle();
  if (!cohort || cohort.is_archived || cohort.deleted_at)
    return { ok: false, error: "배정할 수 없는 반입니다." };

  // 반 배정 = 등업 (이미 멤버면 통과 — 멱등).
  const { error: memErr } = await adminClient.from("cohort_members").insert({
    cohort_id: cohortId,
    profile_id: req.user_id,
    added_by: actorId,
  });
  if (memErr && memErr.code !== "23505")
    return { ok: false, error: memErr.message };

  const { error } = await adminClient
    .from("cohort_upgrade_requests")
    .update({
      status: "approved",
      cohort_id: cohortId,
      processed_at: new Date().toISOString(),
      processed_by: actorId,
    })
    .eq("request_id", requestId);
  if (error) return { ok: false, error: error.message };

  await createUserNotifications({
    recipientIds: [req.user_id],
    kind: "cohort_upgrade_processed",
    entityType: "cohort_upgrade_request",
    entityId: requestId,
    title: "종합반 등업 완료",
    body: `${cohort.name} 배정이 완료됐습니다. 상담·과제·반별 게시판이 열렸습니다.`,
    href: "/dashboard",
  });
  return { ok: true };
}

export async function rejectUpgradeRequest(
  requestId: string,
  note: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: req } = await adminClient
    .from("cohort_upgrade_requests")
    .select("request_id, user_id, status")
    .eq("request_id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "신청 없음" };
  if (req.status !== "pending")
    return { ok: false, error: "이미 처리된 신청입니다." };
  const { error } = await adminClient
    .from("cohort_upgrade_requests")
    .update({
      status: "rejected",
      admin_note: note,
      processed_at: new Date().toISOString(),
      processed_by: actorId,
    })
    .eq("request_id", requestId);
  if (error) return { ok: false, error: error.message };
  await createUserNotifications({
    recipientIds: [req.user_id],
    kind: "cohort_upgrade_processed",
    entityType: "cohort_upgrade_request",
    entityId: requestId,
    title: "종합반 등업 신청 안내",
    body: note
      ? `신청이 반려됐습니다 — ${note}`
      : "신청이 반려됐습니다. 자세한 내용은 학원으로 문의해 주세요.",
    href: "/pricing",
  });
  return { ok: true };
}
