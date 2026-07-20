// 학생 개인별 정오문제 숨김 토글 (user_ox_hidden). 본인만 해당 지문을 안 보이게 함.
// staff 전체 숨김(/api/problems/ox-review-update 의 oxHidden)과 별개 — 이건 아무 로그인
// 사용자나 자기 자신에 대해서만 적용. RLS(auth.uid()=user_id)로 소유권 강제.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/ox-user-hide";

const schema = z.object({
  refType: z.enum(["choice", "box"]),
  refId: z.string().uuid(),
  hidden: z.union([z.literal("true"), z.literal("false")]),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const parsed = schema.safeParse({
    refType: fd.get("refType"),
    refId: fd.get("refId"),
    hidden: fd.get("hidden") == null ? undefined : String(fd.get("hidden")),
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  const targetType =
    parsed.data.refType === "choice" ? "problem_choice" : "problem_box_item";

  if (parsed.data.hidden === "true") {
    // 이미 있으면 무시(PK 충돌) — upsert with ignoreDuplicates.
    const { error } = await client.from("user_ox_hidden").upsert(
      {
        user_id: user.id,
        target_type: targetType,
        target_id: parsed.data.refId,
      },
      { onConflict: "user_id,target_type,target_id", ignoreDuplicates: true },
    );
    if (error) return data({ error: "Failed" }, { status: 500 });
  } else {
    const { error } = await client
      .from("user_ox_hidden")
      .delete()
      .eq("user_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", parsed.data.refId);
    if (error) return data({ error: "Failed" }, { status: 500 });
  }

  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
