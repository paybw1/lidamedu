// 탈퇴 관리 액션 (admin 전용): withdraw / cancel / delete.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
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
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (role !== "admin") throw data("Forbidden — admin only", { status: 403 });

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
  return redirect("/admin/withdrawals");
}
