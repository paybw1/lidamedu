// feat-2-023c — 학생 암기카드 필터 설정 저장(중요도 하한 + 즐겨찾기만).
// srs_user_settings self upsert(RLS user_id = auth.uid()) — 요청 클라이언트.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { updateUserFilterSettings } from "~/features/srs/srs.server";

import type { Route } from "./+types/settings";

const schema = z.object({
  importanceMin: z.coerce.number().int().min(0).max(3),
  bookmarkedOnly: z.boolean(),
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
    importanceMin: fd.get("importanceMin"),
    bookmarkedOnly: fd.get("bookmarkedOnly") === "1",
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  const res = await updateUserFilterSettings(client, user.id, {
    importanceMin: parsed.data.importanceMin,
    bookmarkedOnly: parsed.data.bookmarkedOnly,
  });
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
