// 주관식 관련판례 '메인 판례' 지정/해제 (staff 전용) — 문제 뷰어 판례 배지 팝업의 지정 버튼.
// caseNumber="" → 해제(null). 지정 시 배지 그룹에서 맨 앞 정렬 + ★ 강조 표시.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/main-case";

const schema = z.object({
  problemId: z.string().uuid(),
  caseNumber: z.string().max(120),
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
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const parsed = schema.safeParse({
    problemId: fd.get("problemId"),
    caseNumber: fd.get("caseNumber"),
  });
  if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });

  const caseNumber = parsed.data.caseNumber.trim() || null;
  const { error } = await client
    .from("problems")
    .update({ main_case_number: caseNumber })
    .eq("problem_id", parsed.data.problemId);
  if (error) return data({ error: error.message }, { status: 400 });

  return data({ ok: true, mainCaseNumber: caseNumber });
}

// GET(브라우저 직접 접근) — POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
