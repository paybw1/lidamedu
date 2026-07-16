// feat-2-029 S5 — 판례 빈칸 후보 승인/거절/되돌리기 API. staff 전용.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  approveCaseCandidate,
  rejectCaseCandidate,
  revertCaseCandidate,
} from "~/features/blanks/case-candidates.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/case-candidate-review";

const schema = z.object({
  candidateId: z.string().uuid(),
  op: z.enum(["approve", "reject", "revert"]),
  // approve 전용 — 운영자가 인라인 수정한 빈칸 정답(원문 verbatim 이어야 함).
  answer: z.string().max(100).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    candidateId: fd.get("candidateId"),
    op: fd.get("op"),
    answer: fd.get("answer") ?? undefined,
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

  const { candidateId, op, answer } = parsed.data;
  const result =
    op === "approve"
      ? await approveCaseCandidate(client, candidateId, user.id, answer)
      : op === "reject"
        ? await rejectCaseCandidate(client, candidateId, user.id)
        : await revertCaseCandidate(client, candidateId);
  return result;
}
