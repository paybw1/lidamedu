// user_notifications — 학생·강사 공용 in-app 알림 인박스.
// service_role(admin client) 로 fanout insert. 본인 RLS 가 자기 행 SELECT/UPDATE.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  STAFF_KINDS,
  STUDENT_KINDS,
  type NotificationKind,
} from "~/features/notifications/kinds";

// kind 분류 SSOT 는 kinds.ts (컴포넌트 공유) — 기존 import 호환 re-export.
export {
  STAFF_KINDS,
  STUDENT_KINDS,
  isStaffKind,
  isStudentKind,
  type NotificationKind,
} from "~/features/notifications/kinds";

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

// Back-compat alias — 기존 caller(qna 등)가 createStaffNotifications 를 import.
export const createStaffNotifications = createUserNotifications;

/** 특정 엔티티에 걸린 미읽음 알림을 (수신자 전원) 읽음 처리. 처리 완료된 요청 알림 자동 정리용. */
export async function markNotificationsReadByEntity(input: {
  kind: NotificationKind;
  entityType: string;
  entityId: string;
}): Promise<void> {
  try {
    await adminClient
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("kind", input.kind)
      .eq("entity_type", input.entityType)
      .eq("entity_id", input.entityId)
      .is("read_at", null);
  } catch (err) {
    console.error("[notif] markReadByEntity threw", err);
  }
}

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
  // 종류 단일 필터 (인박스 종류 탭). audience 와 병행 시 교집합.
  kind?: NotificationKind;
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
  if (options.kind) q = q.eq("kind", options.kind);
  else if (kinds) q = q.in("kind", kinds);
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
  // 미읽음 카운트 — 같은 audience 안에서 (kind 필터와 무관하게 전체 배지용).
  let countQ = client
    .from("user_notifications")
    .select("notification_id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (kinds) countQ = countQ.in("kind", kinds);
  const { count } = await countQ;
  return { items, unreadCount: count ?? 0 };
}

/** 종류별 미읽음 카운트 — 인박스 종류 탭 배지용. */
export async function getUnreadCountsByKind(
  client: SupabaseClient<Database>,
  userId: string,
  audience: "staff" | "student",
): Promise<Partial<Record<NotificationKind, number>>> {
  const kinds = audience === "staff" ? STAFF_KINDS : STUDENT_KINDS;
  const { data, error } = await client
    .from("user_notifications")
    .select("kind")
    .eq("recipient_id", userId)
    .is("read_at", null)
    .in("kind", kinds)
    .limit(2000);
  if (error || !data) return {};
  const out: Partial<Record<NotificationKind, number>> = {};
  for (const r of data) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
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
  kind?: NotificationKind,
): Promise<void> {
  let q = client
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (kind) q = q.eq("kind", kind);
  else if (audience === "staff") q = q.in("kind", STAFF_KINDS);
  else if (audience === "student") q = q.in("kind", STUDENT_KINDS);
  await q;
}

// 기존 호환 alias (이전 export 이름).
export type StaffNotificationKind = NotificationKind;
export type StaffNotificationItem = NotificationItem;
export async function listStaffNotifications(
  client: SupabaseClient<Database>,
  userId: string,
  options: {
    onlyUnread?: boolean;
    limit?: number;
    kind?: NotificationKind;
  } = {},
): Promise<{ items: NotificationItem[]; unreadCount: number }> {
  return listUserNotifications(client, userId, {
    ...options,
    audience: "staff",
  });
}
