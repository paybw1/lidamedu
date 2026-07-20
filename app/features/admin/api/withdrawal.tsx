// 탈퇴 관리 액션 (admin 전용): withdraw / cancel / delete.

import { data, redirect } from "react-router";
import { z } from "zod";

import { requireAdmin } from "~/core/lib/admin-guard.server";
import {
  alertSecurityEvent,
  logAuditEvent,
} from "~/features/admin/queries/audit-log.server";
import {
  cancelWithdrawal,
  deleteWithdrawnUser,
  processWithdrawal,
} from "~/features/admin/queries/withdrawals.server";

import type { Route } from "./+types/withdrawal";

const schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("withdraw"),
    userId: z.string().uuid(),
    reason: z.string().max(300).optional().or(z.literal("")),
  }),
  z.object({ intent: z.literal("cancel"), withdrawalId: z.string().uuid() }),
  z.object({ intent: z.literal("delete"), withdrawalId: z.string().uuid() }),
]);

export async function action({ request }: Route.ActionArgs) {
  const { user, role } = await requireAdmin(request);

  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success)
    return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
  const v = parsed.data;

  const res =
    v.intent === "withdraw"
      ? await processWithdrawal(v.userId, v.reason || null, user.id)
      : v.intent === "cancel"
        ? await cancelWithdrawal(v.withdrawalId)
        : await deleteWithdrawnUser(v.withdrawalId, user.id);
  if (!res.ok) return data({ error: res.error }, { status: 400 });

  // 감사 기록 — 계정 탈퇴/취소/완전삭제는 회원 데이터·PII 를 다루는 민감 작업.
  // 특히 hard_delete 는 비가역(auth 계정 cascade)이라 반드시 흔적을 남긴다.
  if (v.intent === "withdraw") {
    await logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "user.withdraw",
      entityType: "user",
      entityId: v.userId,
      metadata: { reason: v.reason || null },
    });
  } else if (v.intent === "cancel") {
    await logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "user.withdraw_cancel",
      entityType: "user_withdrawal",
      entityId: v.withdrawalId,
    });
  } else {
    // 완전삭제=비가역 PII cascade → 감사 기록 + 실시간 경보(감사 담당자).
    await alertSecurityEvent({
      actorId: user.id,
      actorRole: role,
      action: "user.hard_delete",
      entityType: "user_withdrawal",
      entityId: v.withdrawalId,
      metadata: { irreversible: true },
      summary: "회원 계정이 완전 삭제되었습니다(비가역). 즉시 확인이 필요합니다.",
    });
  }
  return redirect("/admin/withdrawals");
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
