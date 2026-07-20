// feat §A — 응시 중 "다시 볼 문제" 플래그 toggle.
// intent=toggle: sessionId + problemId → 없으면 INSERT, 있으면 DELETE.
// RLS 가 user_id = auth.uid() 강제 — 본인 세션만 가능.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/quiz-flag";

const schema = z.object({
  sessionId: z.string().uuid(),
  problemId: z.string().uuid(),
  next: z.union([z.literal("true"), z.literal("false")]),
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

  const fd = await request.formData();
  const parsed = schema.safeParse({
    sessionId: fd.get("sessionId"),
    problemId: fd.get("problemId"),
    next: fd.get("next"),
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }
  const { sessionId, problemId, next } = parsed.data;

  if (next === "true") {
    const { error } = await client
      .from("user_quiz_flags")
      .insert({ session_id: sessionId, problem_id: problemId, user_id: user.id });
    // 23505 = duplicate PK (이미 플래그됨 — 멱등)
    if (error && error.code !== "23505") {
      return data({ error: error.message }, { status: 400 });
    }
  } else {
    const { error } = await client
      .from("user_quiz_flags")
      .delete()
      .eq("session_id", sessionId)
      .eq("problem_id", problemId)
      .eq("user_id", user.id);
    if (error) return data({ error: error.message }, { status: 400 });
  }
  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
