// SRS v2 ③ — GET /api/srs/queue
// 오늘의 복습 큐 (due + new 혼합). 사용자별 설정 반영.

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getReviewQueue } from "~/features/srs/srs.server";

import type { Route } from "./+types/queue";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const subject = url.searchParams.get("subject");
  const sourceType = type === "article" || type === "case" ? type : null;
  const queue = await getReviewQueue(client, user.id, {
    sourceType,
    subject: subject || null,
  });
  return data(queue);
}
