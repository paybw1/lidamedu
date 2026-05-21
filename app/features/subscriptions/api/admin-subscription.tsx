// feat-7-014 — 운영자 수강권 액션 endpoint. manager+ 권한.
// intent: grant / extend / cancel.

import { data } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  cancelSubscriptionAdmin,
  extendSubscription,
  grantManualSubscription,
} from "~/features/subscriptions/admin-queries.server";

import type { Route } from "./+types/admin-subscription";

const grantSchema = z.object({
  userId: z.string().uuid(),
  planCode: z.string().min(1).max(64),
  durationDays: z.coerce.number().int().min(1).max(3650),
});
const extendSchema = z.object({
  subscriptionId: z.string().uuid(),
  addDays: z.coerce.number().int().min(1).max(3650),
});
const cancelSchema = z.object({
  subscriptionId: z.string().uuid(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const { data: prof } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!roleAtLeast(prof?.role, "manager")) {
    return data({ error: "Forbidden — manager+" }, { status: 403 });
  }

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "grant") {
    const parsed = grantSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    const res = await grantManualSubscription(parsed.data);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data(res);
  }
  if (intent === "extend") {
    const parsed = extendSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    const res = await extendSubscription(
      parsed.data.subscriptionId,
      parsed.data.addDays,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data(res);
  }
  if (intent === "cancel") {
    const parsed = cancelSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    const res = await cancelSubscriptionAdmin(parsed.data.subscriptionId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data(res);
  }
  return data({ error: "Unknown intent" }, { status: 400 });
}
