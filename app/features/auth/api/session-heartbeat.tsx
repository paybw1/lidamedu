/**
 * 단일 세션 하트비트 — feat-000-016 2단계.
 *
 * private 영역의 SessionHeartbeat 컴포넌트가 주기적으로 폴한다. 이 세션이 다른 기기의
 * 더 새 로그인에 밀려났으면(superseded) true 를 돌려주고, 클라이언트가 reload 하면
 * private.layout 의 enforceSingleSession 이 이 기기를 로그아웃시킨다(유휴 기기 즉시 추방).
 * 읽기 전용(여기서 추방하지 않음 — 추방은 레이아웃 한 곳에 집중).
 */
import type { Route } from "./+types/session-heartbeat";

import { data } from "react-router";

import { isSessionSuperseded } from "~/core/lib/single-session.server";
import makeServerClient from "~/core/lib/supa-client.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  // 세션이 끊겼으면 클라가 reload → /login 으로. (superseded 와 동일 처리)
  if (!user) return data({ superseded: true }, { headers });
  const superseded = await isSessionSuperseded(client, user, request);
  return data({ superseded }, { headers });
}
