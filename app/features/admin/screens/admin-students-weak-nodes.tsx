// feat-7-041 ⑥ — 전체 공통 약점 단원(지연 로드 리소스 라우트). 무거운 집계라 화면에서
// useFetcher 로 on-demand 호출. manager+ 전용(전체 학습현황과 동일 게이트).
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { getAllStudentsWeakNodes } from "~/features/admin/queries/all-students-overview.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-students-weak-nodes";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role || !roleAtLeast(role, "manager")) {
    throw data("Forbidden", { status: 403 });
  }
  const weakness = await getAllStudentsWeakNodes({ limit: 8 });
  return weakness;
}
