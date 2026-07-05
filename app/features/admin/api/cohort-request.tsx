// 종합반 등업 신청 처리 action — 승인(반 배정) / 반려. manager+.
import { data } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  approveUpgradeRequest,
  rejectUpgradeRequest,
} from "~/features/cohorts/upgrade-requests.server";

import type { Route } from "./+types/cohort-request";

const approveSchema = z.object({
  requestId: z.string().uuid(),
  cohortId: z.string().uuid(),
});
const rejectSchema = z.object({
  requestId: z.string().uuid(),
  note: z.string().trim().min(2).max(300),
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
  if (intent === "approve") {
    const parsed = approveSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });
    const res = await approveUpgradeRequest(
      parsed.data.requestId,
      parsed.data.cohortId,
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }
  if (intent === "reject") {
    const parsed = rejectSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data({ error: "반려 사유를 입력하세요 (2자 이상)" }, { status: 400 });
    const res = await rejectUpgradeRequest(
      parsed.data.requestId,
      parsed.data.note,
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }
  return data({ error: "Unknown intent" }, { status: 400 });
}
