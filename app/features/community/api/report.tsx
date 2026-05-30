// feat-6-007 — 게시글·댓글 신고 API (인증 사용자).
// 같은 신고자×같은 타겟 unique 인덱스로 중복 차단.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/report";

const Schema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
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

  const parsed = Schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    return data(
      { ok: false, error: "invalid-input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { error } = await client.from("community_reports").insert({
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    reporter_id: user.id,
    reason: parsed.data.reason,
  });
  if (error) {
    // unique 위반(중복 신고) 별도 메시지.
    if (error.code === "23505") {
      return data({ ok: false, error: "already-reported" }, { status: 409 });
    }
    return data({ ok: false, error: error.message }, { status: 400 });
  }
  return data({ ok: true });
}
