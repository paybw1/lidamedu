// 감사 로그 헬퍼 (feat-7-015).
// service_role(admin client) 로 insert — RLS 우회. caller 가 staff 인지 검증해야 함.
// 실패해도 본 action 흐름은 진행 — best-effort.

import adminClient from "~/core/lib/supa-admin-client.server";
import type { UserRole } from "~/core/lib/roles";

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
