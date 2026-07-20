// feat-6-007 — 신고 처리 액션 (manager+).

import { data } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import { resolveReport } from "../reports.server";

import type { Route } from "./+types/report-resolve";

const Schema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["resolved", "dismissed"]),
  actionNote: z.string().max(500).optional().nullable(),
  alsoDelete: z.enum(["true", "false"]).optional().default("false"),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "method-not-allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false, error: "unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager")) {
    return data({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const parsed = Schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    return data(
      { ok: false, error: "invalid-input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await resolveReport({
    reportId: parsed.data.reportId,
    status: parsed.data.status,
    managerId: user.id,
    actionNote: parsed.data.actionNote ?? null,
    alsoDelete: parsed.data.alsoDelete === "true",
  });
  if (!result.ok) {
    return data({ ok: false, error: result.error }, { status: 400 });
  }
  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
