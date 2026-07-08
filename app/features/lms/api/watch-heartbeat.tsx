// POST /api/lms/watch-heartbeat — 시청 구간 보고 (설계 §4.3).
// 플레이어가 15~30초 주기로 (grantId, clientSeq, from, to, position) 보고.
// 서버가 검증·멱등 처리 후 배수 차감(맛보기·무료 예외). 응답에 잔여 초 — 플레이어가 소진 임박 안내.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { reportWatchInterval } from "~/features/lms/watch.server";

import type { Route } from "./+types/watch-heartbeat";

const schema = z.object({
  grantId: z.string().uuid(),
  clientSeq: z.coerce.number().int().min(0),
  fromSeconds: z.coerce.number().int().min(0),
  toSeconds: z.coerce.number().int().min(1),
  positionSeconds: z.coerce.number().int().min(0).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  const fd = await request.formData();
  const parsed = schema.safeParse({
    grantId: fd.get("grantId"),
    clientSeq: fd.get("clientSeq"),
    fromSeconds: fd.get("fromSeconds"),
    toSeconds: fd.get("toSeconds"),
    positionSeconds: fd.get("positionSeconds") ?? undefined,
  });
  if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });

  const result = await reportWatchInterval({
    grantId: parsed.data.grantId,
    userId: user?.id ?? null,
    clientSeq: parsed.data.clientSeq,
    fromSeconds: parsed.data.fromSeconds,
    toSeconds: parsed.data.toSeconds,
    positionSeconds: parsed.data.positionSeconds ?? null,
  });
  if (!result.ok) {
    return data(result, {
      status: result.reason === "not_owner" ? 403 : 400,
    });
  }
  return data(result);
}
