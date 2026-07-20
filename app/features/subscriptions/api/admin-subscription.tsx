// feat-7-014 — 운영자 수강권 액션 endpoint. manager+ 권한.
// intent: grant / extend / cancel / find_user. 조정은 사유(note) 필수 — 감사 로그 기록.

import { data } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  cancelSubscriptionAdmin,
  extendSubscription,
  grantManualSubscription,
  searchStudentsForGrant,
} from "~/features/subscriptions/admin-queries.server";

import type { Route } from "./+types/admin-subscription";

const noteSchema = z
  .string()
  .trim()
  .min(2, "조정 사유를 입력하세요 (2자 이상)")
  .max(500);
const grantSchema = z.object({
  userId: z.string().uuid(),
  planCode: z.string().min(1).max(64),
  durationDays: z.coerce.number().int().min(1).max(3650),
  note: noteSchema,
});
const extendSchema = z.object({
  subscriptionId: z.string().uuid(),
  addDays: z.coerce.number().int().min(1).max(3650),
  note: noteSchema,
});
const cancelSchema = z.object({
  subscriptionId: z.string().uuid(),
  note: noteSchema,
});
const findUserSchema = z.object({
  q: z.string().trim().min(1).max(60),
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

  if (intent === "find_user") {
    const parsed = findUserSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data({ error: "검색어를 입력하세요.", candidates: [] });
    const candidates = await searchStudentsForGrant(parsed.data.q);
    return data({ candidates });
  }
  if (intent === "grant") {
    const parsed = grantSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    const res = await grantManualSubscription({
      ...parsed.data,
      actorId: user.id,
    });
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
      parsed.data.note,
      user.id,
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
    const res = await cancelSubscriptionAdmin(
      parsed.data.subscriptionId,
      parsed.data.note,
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data(res);
  }
  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
