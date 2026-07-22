import type { Route } from "./+types/private.layout";

import { Outlet, data, redirect } from "react-router";

import { CommandPalette } from "~/core/components/command-palette";
import { SessionHeartbeat } from "~/core/components/session-heartbeat";
import { getStaffRole } from "~/features/laws/queries.server";
import { requireAccessApproval } from "../lib/require-approval.server";
import { requireServiceDataConsent } from "../lib/require-consent.server";
import { requireProfileInfo } from "../lib/require-profile.server";
import { enforceSingleSession } from "../lib/single-session.server";
import makeServerClient from "../lib/supa-client.server";

export async function loader({ request }: Route.LoaderArgs) {
  // headers 는 supabase 가 refresh_token 으로 access_token 을 자동 갱신할 때
  // setAll 콜백으로 누적되는 Set-Cookie 들. 응답에 반드시 전달해야 브라우저가
  // 새 cookie 를 저장하고 다음 요청이 살아있는 세션으로 동작.
  // 빠뜨리면 갱신된 토큰이 휘발돼 access 만료 즉시 /login 무한 redirect.
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login", { headers });
  }

  // feat-000-016 — 단일 세션 강제. 다른 기기에서 더 새 로그인이 발생했으면(학생 한정)
  // 이 기기 세션만 종료하고 /login?reason=other-device 로. 통과 시 무동작.
  await enforceSingleSession(client, user, request, headers);

  // 접근 승인 게이트 — 미승인 학생은 /pending-approval 로. 동의 게이트보다 먼저.
  await requireAccessApproval(client, user, request, headers);

  // feat-8-026 — 학습 데이터 활용 미동의 학생은 /consent 로. staff/동의자/allow-list 통과.
  await requireServiceDataConsent(client, user, request, headers);

  // feat-8-030 — 필수정보(회원명·휴대전화·주소) 미입력 학생은 /onboarding/profile 로.
  //   ★승인·동의 다음(마지막)에 호출 — 여기 도달 = 앞 게이트 통과, 되받아침 없음.
  await requireProfileInfo(client, user, request, headers);

  // ★운영자 영역 방어선 — /admin/* 하위 화면은 스태프 전용. 개별 화면이 가드를
  // 빠뜨려도(신규 화면 실수 등) 비스태프는 여기서 차단되어 허브(학생 안내)로 돌아간다.
  // /admin 허브 자체는 자체적으로 학생 안내를 렌더하므로 제외. 세밀한 권한(manager/duty)은
  // 각 화면 loader 의 requireManager/requireDuty 가 추가로 강제.
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/admin/")) {
    const role = await getStaffRole(client, user.id);
    if (!role) throw redirect("/admin", { headers });
  }

  return data({}, { headers });
}

export default function PrivateLayout() {
  return (
    <>
      <CommandPalette />
      <SessionHeartbeat />
      <Outlet />
    </>
  );
}
