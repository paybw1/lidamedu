// feat-11-011 P0 — 내 담당(duty) 목록. 사이드바·명령 팔레트·허브가 "열 수 없는 메뉴"를
// 감추는 데 쓴다.
//
// ★왜 별도 라우트인가 — 관리자 화면에는 공통 layout 라우트가 없고(화면마다 AdminShell 을
//   직접 렌더한다), root 로더는 모든 요청에 도므로 여기에 DB 조회를 넣을 수 없다.
//   원장(admin)은 모든 duty 를 우회하므로 아예 호출하지 않는다.
// ★이건 표시용이다. 접근 차단은 각 화면 loader 의 hasDutyAccess 가 그대로 담당한다.

import { data } from "react-router";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/my-duties";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ duties: [] }, { status: 401 });

  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "instructor")) return data({ duties: [] }, { status: 403 });

  // ★자기 배정 조회에도 adminClient 를 쓴다 — staff_duty_assignments 는 원장만 읽는
  //   정책이라 요청 클라이언트로는 빈 배열이 돌아온다(메뉴가 통째로 사라진다).
  const { data: rows, error } = await adminClient
    .from("staff_duty_assignments")
    .select("duty")
    .eq("profile_id", user.id);
  if (error) return data({ duties: [] }, { status: 500 });

  return data({ duties: (rows ?? []).map((r) => r.duty) });
}
