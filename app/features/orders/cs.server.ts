// feat-11-004 4d — CS 처리 이력 공통 원장(cs_actions). 각 도메인 원장 행을 참조(이중 저장 금지).
import adminClient from "~/core/lib/supa-admin-client.server";

export type CsActionKind =
  | "device_reset"
  | "multiplier_credit"
  | "multiplier_reset"
  | "period_extend"
  | "enrollment_block"
  | "enrollment_grant"
  | "enrollment_revoke"
  | "pause_admin"
  | "refund_assist"
  | "memo";

export async function recordCsAction(input: {
  userId: string;
  actorId: string;
  kind: CsActionKind;
  refTable?: string | null;
  refId?: string | null;
  note: string;
}): Promise<void> {
  const { error } = await adminClient.from("cs_actions").insert({
    user_id: input.userId,
    actor_id: input.actorId,
    kind: input.kind,
    ref_table: input.refTable ?? null,
    ref_id: input.refId ?? null,
    note: input.note,
  });
  if (error) console.error("[cs] record failed:", error.message);
}

export interface CsActionRow {
  actionId: string;
  kind: CsActionKind;
  actorName: string | null;
  note: string;
  createdAt: string;
}

export async function listCsActionsForUser(
  userId: string,
  limit = 50,
): Promise<CsActionRow[]> {
  const { data } = await adminClient
    .from("cs_actions")
    .select("action_id, kind, note, created_at, actor:profiles!cs_actions_actor_id_fkey(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    actionId: r.action_id,
    kind: r.kind as CsActionKind,
    actorName: (r.actor as { name: string | null } | null)?.name ?? null,
    note: r.note,
    createdAt: r.created_at,
  }));
}
