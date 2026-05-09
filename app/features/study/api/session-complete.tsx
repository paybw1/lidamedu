// 퀴즈 세션 종료 — 시험 모드 끝내기 / 학습 모드 노드 완주 시 호출.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { completeQuizSession, getQuizSession } from "~/features/study/queries.server";

import type { Route } from "./+types/session-complete";

const schema = z.object({
  sessionId: z.string().uuid(),
  redirectTo: z.string().optional().nullable(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const parsed = schema.safeParse({
    sessionId: form.get("sessionId"),
    redirectTo: form.get("redirectTo") || null,
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  // 본인 세션인지 확인.
  const session = await getQuizSession(client, user.id, parsed.data.sessionId);
  if (!session) return data({ error: "Session not found" }, { status: 404 });

  await completeQuizSession(client, user.id, parsed.data.sessionId);

  if (parsed.data.redirectTo) {
    return redirect(parsed.data.redirectTo);
  }
  return data({ ok: true, sessionId: parsed.data.sessionId });
}
