// 판례 목록 노출 토글 (원장 지시 2026-08-21). staff(instructor/admin) 전용.
//   POST /api/admin/case-listing  { caseId, listVisible: "true" | "false" }
//
// 노출 규칙 자체는 scripts/precedents/apply-case-list-visibility.mjs 가 소유한다.
// 여기서 손으로 바꾸면 list_visible_pinned=true 를 함께 세워, 다음 백필 때
// 규칙이 이 판례를 다시 덮지 않게 한다.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/case-listing";

const schema = z.object({
  caseId: z.string().uuid(),
  listVisible: z.enum(["true", "false"]),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "method-not-allowed" }, { status: 405 });
  }

  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }
  const role = await getStaffRole(client, user.id);
  if (!role) {
    return data({ ok: false, error: "forbidden" }, { status: 403, headers });
  }

  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    return data({ ok: false, error: "invalid-input" }, { status: 400, headers });
  }
  const listVisible = parsed.data.listVisible === "true";

  // cases 쓰기는 RLS instructor-admin-write 정책으로 staff 에게 허용.
  const { data: rows, error } = await client
    .from("cases")
    .update({ list_visible: listVisible, list_visible_pinned: true })
    .eq("case_id", parsed.data.caseId)
    .is("deleted_at", null)
    .select("case_id");
  if (error) {
    return data({ ok: false, error: error.message }, { status: 400, headers });
  }
  if ((rows?.length ?? 0) === 0) {
    return data(
      { ok: false, error: "대상을 찾을 수 없습니다." },
      { status: 404, headers },
    );
  }

  return data({ ok: true, listVisible }, { headers });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
