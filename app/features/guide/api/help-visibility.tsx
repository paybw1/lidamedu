// 화면 안 "?" 도움 버튼 노출 판정 — 사용자 결정(2026-07-05):
//   · staff = 항상 노출
//   · 학생 = "구독 시작 + 3개월"까지만 노출. 기준일 = 가장 최근 수강권 시작일(started_at),
//     수강권이 없으면 가입일(profiles.created_at, 체험 시작). 이후엔 숨김 — 가이드 자체는
//     /guide 허브에서 계속 볼 수 있다.
// 클라이언트(GuideHelpButton)가 1회 조회 후 24시간 localStorage 캐시.

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/help-visibility";

const EXPOSURE_MONTHS = 3;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return Response.json({ show: false });

  const role = await getStaffRole(client, user.id);
  if (role) return Response.json({ show: true });

  // 기준일 — 최근 수강권 시작일 우선, 없으면 가입일. (본인 행 RLS 조회)
  const [{ data: sub }, { data: profile }] = await Promise.all([
    client
      .from("user_subscriptions")
      .select("started_at")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("profiles")
      .select("created_at")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  const baseIso = sub?.started_at ?? profile?.created_at ?? null;
  // 기준일을 알 수 없으면 보수적으로 노출(도움 버튼은 무해).
  if (!baseIso) return Response.json({ show: true });

  const until = new Date(baseIso);
  until.setMonth(until.getMonth() + EXPOSURE_MONTHS);
  return Response.json({ show: Date.now() < until.getTime() });
}
