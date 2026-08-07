// 주관식 관련판례 '메인 판례' 지정/해제 (staff 전용) — 문제 뷰어 판례 배지 팝업의 지정 버튼.
// 메인 판례는 설문별로 복수 지정 가능 — main_case_number 에 ", " 구분 목록으로 저장하고
// 같은 사건번호 재요청 시 토글(있으면 제거, 없으면 추가). caseNumber="" → 전체 해제(null).

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

  const caseNumber = parsed.data.caseNumber.trim();
  const { data: row, error: readError } = await client
    .from("problems")
    .select("main_case_number")
    .eq("problem_id", parsed.data.problemId)
    .single();
  if (readError) return data({ error: readError.message }, { status: 400 });

  let next: string | null;
  if (!caseNumber) {
    next = null; // 전체 해제
  } else {
    const list = (row.main_case_number ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = list.includes(caseNumber)
      ? list.filter((n) => n !== caseNumber)
      : [...list, caseNumber];
    next = merged.length ? merged.join(", ") : null;
  }

  const { error } = await client
    .from("problems")
    .update({ main_case_number: next })
    .eq("problem_id", parsed.data.problemId);
  if (error) return data({ error: error.message }, { status: 400 });

  return data({ ok: true, mainCaseNumber: next });
}

// GET(브라우저 직접 접근) — POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
