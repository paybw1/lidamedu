// feat-2-029 — 판례 뷰어 ①빈칸 편집: 빈칸 제거(같은 자리 승인 후보는 rejected 동기화). staff 전용.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { removeCaseBlank } from "~/features/blanks/case-candidates.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/case-admin-remove-blank";

const schema = z.object({
  setId: z.string().uuid(),
  blankIdx: z.coerce.number().int().min(0),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    setId: fd.get("setId"),
    blankIdx: fd.get("blankIdx"),
  });
  if (!parsed.success)
    return { ok: false, error: "잘못된 입력입니다." } as const;

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  return removeCaseBlank(client, parsed.data.setId, parsed.data.blankIdx, user.id);
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
