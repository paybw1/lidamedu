// feat-7-041 #1 — 약점 단원 역추적(지연 로드 리소스 라우트). 한 단원 → 약한 반·학생.
// manager+ 전용 — 개인 식별 노출이라 전체 학습현황과 동일 게이트(약관 제7조 근거).
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { getWeakNodeBreakdown } from "~/features/admin/queries/all-students-overview.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-weak-node-detail";

function isLawSlug(v: string): v is LawSubjectSlug {
  return (LAW_SUBJECT_SLUGS as readonly string[]).includes(v);
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role || !roleAtLeast(role, "manager")) {
    throw data("Forbidden", { status: 403 });
  }
  const { lawCode, nodeId } = params;
  if (!lawCode || !isLawSlug(lawCode) || !nodeId) {
    throw data("Bad request", { status: 400 });
  }
  return getWeakNodeBreakdown(lawCode, nodeId);
}
