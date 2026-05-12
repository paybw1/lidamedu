// staff_notifications — 강사용 in-app 알림 인박스.
// service_role(admin client) 로 fanout insert. 학생/강사 RLS 는 자기 행 SELECT/UPDATE.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export type StaffNotificationKind =
  Database["public"]["Enums"]["staff_notification_kind"];

export interface StaffNotificationInput {
  recipientIds: string[];
  kind: StaffNotificationKind;
  entityType: string;
  entityId: string;
  title: string;
  body?: string | null;
  href: string;
  payload?: Record<string, unknown> | null;
}

// 한 사건에 대해 여러 staff 에게 fanout. best-effort.
export async function createStaffNotifications(
  input: StaffNotificationInput,
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
    const { error } = await adminClient.from("staff_notifications").insert(rows);
    if (error) {
      console.error("[notif] staff fanout failed:", error.message);
    }
  } catch (err) {
    console.error("[notif] staff fanout threw:", err);
  }
}

// 본인 (수신자) 의 알림 — read 여부 별 카운트.
export interface StaffNotificationItem {
  notificationId: string;
  kind: StaffNotificationKind;
  entityType: string;
  entityId: string;
  title: string;
  body: string | null;
  href: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export async function listStaffNotifications(
  client: SupabaseClient<Database>,
  userId: string,
  options: { onlyUnread?: boolean; limit?: number } = {},
): Promise<{ items: StaffNotificationItem[]; unreadCount: number }> {
  const limit = Math.min(200, options.limit ?? 50);
  let q = client
    .from("staff_notifications")
    .select(
      "notification_id, kind, entity_type, entity_id, title, body, href, payload, read_at, created_at",
    )
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (options.onlyUnread) q = q.is("read_at", null);
  const { data, error } = await q;
  if (error) throw error;
  const items: StaffNotificationItem[] = (data ?? []).map((r) => ({
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
  // 미읽음 카운트 — 별도 head 쿼리.
  const { count } = await client
    .from("staff_notifications")
    .select("notification_id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  return { items, unreadCount: count ?? 0 };
}

export async function getStaffUnreadCount(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const { count } = await client
    .from("staff_notifications")
    .select("notification_id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

export async function markNotificationRead(
  client: SupabaseClient<Database>,
  userId: string,
  notificationId: string,
): Promise<void> {
  await client
    .from("staff_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("notification_id", notificationId)
    .eq("recipient_id", userId)
    .is("read_at", null);
}

export async function markAllNotificationsRead(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  await client
    .from("staff_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null);
}
