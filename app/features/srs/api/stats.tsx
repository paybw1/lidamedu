// SRS v2 ③ — GET /api/srs/stats
// 본인 학습 통계 — retention, byDay(30일), 향후 7일 예측, 총 항목.

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStats } from "~/features/srs/srs.server";

import type { Route } from "./+types/stats";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "unauthorized" }, { status: 401 });
  const stats = await getStats(client, user.id);
  return data(stats);
}
