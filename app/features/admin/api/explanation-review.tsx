// feat-3-305 기출 해설 검수 API. intents:
//   approve      → RPC approve_explanation_draft (초안 content_md 를 problems.explanation_md 로 복사 + status=approved)
//   reject       → 초안 status=rejected (+ note)
//   bulk-approve → 다중 draftId 일괄 승인
// 게이트: staff(instructor/manager/admin) 만. RLS 보호된 supa-client 사용(RPC 가 auth.uid() 로 staff 확인).
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/explanation-review";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "approve") {
    const id = z.string().uuid().safeParse(fd.get("draftId"));
    if (!id.success) return data({ error: "Invalid draftId" }, { status: 400 });
    const { error } = await client.rpc("approve_explanation_draft", {
      p_draft_id: id.data,
    });
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "reject") {
    const schema = z.object({
      draftId: z.string().uuid(),
      reason: z.string().max(2000).optional(),
    });
    const parsed = schema.safeParse({
      draftId: fd.get("draftId"),
      reason: fd.get("reason") ?? undefined,
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const { error } = await client
      .from("problem_explanation_drafts")
      .update({
        status: "rejected",
        note: parsed.data.reason ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("draft_id", parsed.data.draftId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "bulk-approve") {
    const ids = String(fd.get("draftIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => z.string().uuid().safeParse(s).success);
    if (ids.length === 0) return data({ error: "no valid ids" }, { status: 400 });
    let count = 0;
    for (const id of ids) {
      const { error } = await client.rpc("approve_explanation_draft", {
        p_draft_id: id,
      });
      if (!error) count++;
    }
    return data({ ok: true, count });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
