// POST /api/lms/playback-grant — 재생 판정 API (서버 권위, 설계 §3.5).
// 성공: { ok: true, grantId, expiresAt } — [벤더] 플레이어 임베드는 벤더 확정 후 grant 교환으로.
// 거부: { ok: false, reason, message }

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  PLAYBACK_DENY_MESSAGE,
  requestPlaybackGrant,
} from "~/features/lms/playback.server";

import type { Route } from "./+types/playback-grant";

const schema = z.object({ lessonId: z.string().uuid() });

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  const fd = await request.formData();
  const parsed = schema.safeParse({ lessonId: fd.get("lessonId") });
  if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });

  const judgement = await requestPlaybackGrant(client, {
    lessonId: parsed.data.lessonId,
    userId: user?.id ?? null,
    clientIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  });
  if (!judgement.ok) {
    return data(
      {
        ok: false as const,
        reason: judgement.reason,
        message: PLAYBACK_DENY_MESSAGE[judgement.reason],
      },
      { status: judgement.reason === "login_required" ? 401 : 403 },
    );
  }
  return data(judgement);
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
