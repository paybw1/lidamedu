// user_notifications — 학생·강사 공용 in-app 알림 인박스.
// service_role(admin client) 로 fanout insert. 본인 RLS 가 자기 행 SELECT/UPDATE.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export type NotificationKind =
  Database["public"]["Enums"]["staff_notification_kind"];

// 강사용 kinds (인박스에서 staff 필터링).
const STAFF_KINDS: NotificationKind[] = [
  "subjective_review_request",
  "qna_new_question",
  "cohort_inactive_alert",
  "exam_certificate_submitted",
  "bug_report_created",
  "cohort_upgrade_requested",
  "lecture_note_abuse",
];

// 학생용 kinds.
const STUDENT_KINDS: NotificationKind[] = [
  "subjective_review_completed",
  "qna_new_answer",
  "announcement",
  "student_note_shared",
  "exam_result_reminder",
  "trial_expiry_warning",
  "trial_ended",
  "cohort_upgrade_processed",
  "bug_report_resolved",
];

export function isStaffKind(k: NotificationKind): boolean {
  return STAFF_KINDS.includes(k);
}
export function isStudentKind(k: NotificationKind): boolean {
  return STUDENT_KINDS.includes(k);
}

export interface NotificationInput {
  recipientIds: string[];
  kind: NotificationKind;
  entityType: string;
  entityId: string;
  title: string;
  body?: string | null;
  href: string;
  payload?: Record<string, unknown> | null;
}

export async function createUserNotifications(
  input: NotificationInput,
): Promise<void> {
  if (input.recipientIds.length === 0) return;
  try {
    const rows = input.recipientIds.map((rid) => ({
      recipient_id: rid,
      kind: input.kind,
      entity_type: input.entityType,
      entity_id: input.entityId,
      title: input.title,
      body: input.body ?? null,
      href: input.href,
      payload: (input.payload ?? null) as never,
    }));
    const { error } = await adminClient.from("user_notifications").insert(rows);
    if (error) {
      console.error("[notif] fanout failed:", error.message);
    }
  } catch (err) {
    console.error("[notif] fanout threw:", err);
  }
}

// Back-compat alias — 기존 caller(notify-review, qna) 가 createStaffNotifications 를 import.
export const createStaffNotifications = createUserNotifications;

export interface NotificationItem {
  notificationId: string;
  kind: NotificationKind;
  entityType: string;
  entityId: string;
  title: string;
  body: string | null;
  href: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

interface ListOptions {
  onlyUnread?: boolean;
  limit?: number;
  // 학생/강사 인박스 분리 — 어느 카테고리 kinds 만 가져올지.
  audience?: "staff" | "student";
}

export async function listUserNotifications(
  client: SupabaseClient<Database>,
  userId: string,
  options: ListOptions = {},
): Promise<{ items: NotificationItem[]; unreadCount: number }> {
  const limit = Math.min(200, options.limit ?? 50);
  const kinds =
    options.audience === "staff"
      ? STAFF_KINDS
      : options.audience === "student"
        ? STUDENT_KINDS
        : null;
  let q = client
    .from("user_notifications")
    .select(
      "notification_id, kind, entity_type, entity_id, title, body, href, payload, read_at, created_at",
    )
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (options.onlyUnread) q = q.is("read_at", null);
  if (kinds) q = q.in("kind", kinds);
  const { data, error } = await q;
  if (error) throw error;
  const items: NotificationItem[] = (data ?? []).map((r) => ({
    notificationId: r.notification_id,
    kind: r.kind,
    entityType: r.entity_type,
    entityId: r.entity_id,
    title: r.title,
    body: r.body,
    href: r.href,
    payload: (r.payload as Record<string, unknown> | null) ?? null,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
  // 미읽음 카운트 — 같은 audience 안에서.
  let countQ = client
    .from("user_notifications")
    .select("notification_id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (kinds) countQ = countQ.in("kind", kinds);
  const { count } = await countQ;
  return { items, unreadCount: count ?? 0 };
}

export async function getUnreadCount(
  client: SupabaseClient<Database>,
  userId: string,
  audience?: "staff" | "student",
): Promise<number> {
  let q = client
    .from("user_notifications")
    .select("notification_id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (audience === "staff") q = q.in("kind", STAFF_KINDS);
  else if (audience === "student") q = q.in("kind", STUDENT_KINDS);
  const { count } = await q;
  return count ?? 0;
}

// 기존 alias — staff 인박스 카운트만.
export async function getStaffUnreadCount(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  return getUnreadCount(client, userId, "staff");
}

export async function markNotificationRead(
  client: SupabaseClient<Database>,
  userId: string,
  notificationId: string,
): Promise<void> {
  await client
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("notification_id", notificationId)
    .eq("recipient_id", userId)
    .is("read_at", null);
}

export async function markAllNotificationsRead(
  client: SupabaseClient<Database>,
  userId: string,
  audience?: "staff" | "student",
): Promise<void> {
  let q = client
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (audience === "staff") q = q.in("kind", STAFF_KINDS);
  else if (audience === "student") q = q.in("kind", STUDENT_KINDS);
  await q;
}

// 기존 호환 alias (이전 export 이름).
export type StaffNotificationKind = NotificationKind;
export type StaffNotificationItem = NotificationItem;
export async function listStaffNotifications(
  client: SupabaseClient<Database>,
  userId: string,
  options: { onlyUnread?: boolean; limit?: number } = {},
): Promise<{ items: NotificationItem[]; unreadCount: number }> {
  return listUserNotifications(client, userId, {
    ...options,
    audience: "staff",
  });
}
