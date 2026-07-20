// feat-2-029 — 판례 뷰어 ①빈칸 편집: 드래그 선택 → '기출 유래' 세트에 빈칸 추가. staff 전용.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { appendBlankToAutoSet } from "~/features/blanks/case-candidates.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/case-admin-add-blank";

const schema = z.object({
  caseId: z.string().uuid(),
  target: z.enum(["summary", "reasoning", "comment"]),
  itemIndex: z.coerce.number().int().min(0).optional(),
  answer: z.string().min(1).max(100),
  // 드래그 위치(섹션 텍스트 내 오프셋) — 같은 표현 다회 등장 disambiguation.
  cumOffset: z.coerce.number().int().min(0).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    caseId: fd.get("caseId"),
    target: fd.get("target"),
    itemIndex: fd.get("itemIndex") ?? undefined,
    answer: fd.get("answer"),
    cumOffset: fd.get("cumOffset") ?? undefined,
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

  const { caseId, target, itemIndex, answer, cumOffset } = parsed.data;
  return appendBlankToAutoSet(client, user.id, {
    caseId,
    target,
    itemIndex: target === "summary" ? (itemIndex ?? 0) : null,
    answer,
    cumOffset: cumOffset ?? null,
  });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
