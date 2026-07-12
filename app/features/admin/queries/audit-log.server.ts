// 감사 로그 헬퍼 (feat-7-015).
// service_role(admin client) 로 insert — RLS 우회. caller 가 staff 인지 검증해야 함.
// 실패해도 본 action 흐름은 진행 — best-effort.

import adminClient from "~/core/lib/supa-admin-client.server";
import type { UserRole } from "~/core/lib/roles";
import { getDutyRecipientIds } from "~/features/admin/lib/duties.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

export interface AuditEventInput {
  actorId: string | null;
  actorRole?: UserRole | null;
  action: string; // 예: 'case.delete'
  entityType: string; // 예: 'case'
  entityId: string;
  metadata?: Record<string, unknown> | null;
}

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const { error } = await adminClient.from("audit_logs").insert({
      actor_id: input.actorId,
      actor_role: input.actorRole ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      metadata: (input.metadata ?? null) as never,
    });
    if (error) {
      console.error("[audit] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[audit] insert threw:", err);
  }
}

// 고위험 감사 이벤트 — 기록 + audit_alert 담당자에게 실시간 경보(인박스).
// 권한 변경·계정 완전삭제처럼 사후 확인이 늦으면 위험한 작업에만 사용한다.
// best-effort: 알림 실패해도 본 흐름·감사 기록은 유지.
export async function alertSecurityEvent(
  input: AuditEventInput & { summary: string },
): Promise<void> {
  await logAuditEvent(input);
  try {
    const recipients = await getDutyRecipientIds("audit_alert");
    // 행위자 본인은 제외(자기 작업 경보 불필요).
    const targets = recipients.filter((id) => id !== input.actorId);
    if (targets.length === 0) return;
    await createUserNotifications({
      recipientIds: targets,
      kind: "security_alert",
      entityType: input.entityType,
      entityId: input.entityId,
      title: "감사 이상 경보",
      body: input.summary,
      href: "/admin/audit-logs",
      payload: { action: input.action, actorId: input.actorId },
    });
  } catch (err) {
    console.error("[audit] security alert threw:", err);
  }
}

export interface AuditLogListOptions {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogItem {
  logId: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// admin read — RLS 가 admin 만 허용해주는 가운데 client 인자는 server-bound supa-client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export type AuditAnomalyType = "bulk_delete" | "role_change";
export type AuditAnomalySeverity = "high" | "medium" | "low";

export interface AuditAnomalyItem {
  anomalyType: AuditAnomalyType;
  severity: AuditAnomalySeverity;
  bucketStart: string;
  actorId: string | null;
  actorName: string | null;
  entityType: string;
  eventCount: number;
  sampleLogId: string;
  detail: Record<string, unknown> | null;
}

export async function listAuditAnomalies(
  client: SupabaseClient<Database>,
  hours = 24,
): Promise<AuditAnomalyItem[]> {
  const { data, error } = await client.rpc("admin_audit_anomalies", {
    p_hours: hours,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    anomalyType: r.anomaly_type as AuditAnomalyType,
    severity: r.severity as AuditAnomalySeverity,
    bucketStart: r.bucket_start,
    actorId: r.actor_id,
    actorName: r.actor_name,
    entityType: r.entity_type,
    eventCount: Number(r.event_count),
    sampleLogId: r.sample_log_id,
    detail: (r.detail as Record<string, unknown> | null) ?? null,
  }));
}

export async function listAuditLogs(
  client: SupabaseClient<Database>,
  options: AuditLogListOptions = {},
): Promise<{ items: AuditLogItem[]; total: number }> {
  const limit = Math.min(200, Math.max(10, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  let q = client
    .from("audit_logs")
    .select(
      "log_id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at, profiles:actor_id(name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (options.actorId) q = q.eq("actor_id", options.actorId);
  if (options.action) q = q.eq("action", options.action);
  if (options.entityType) q = q.eq("entity_type", options.entityType);
  if (options.entityId) q = q.eq("entity_id", options.entityId);
  if (options.q) {
    const pattern = `%${options.q.replaceAll("%", "")}%`;
    q = q.or(
      `action.ilike.${pattern},entity_type.ilike.${pattern},entity_id.ilike.${pattern}`,
    );
  }
  const { data, error, count } = await q;
  if (error) throw error;
  const items: AuditLogItem[] = (data ?? []).map((r) => ({
    logId: r.log_id,
    actorId: r.actor_id,
    actorName:
      (r as { profiles?: { name?: string | null } | null }).profiles?.name ?? null,
    actorRole: r.actor_role,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: r.created_at,
  }));
  return { items, total: count ?? items.length };
}
