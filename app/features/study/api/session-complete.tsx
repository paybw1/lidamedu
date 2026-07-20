// 퀴즈 세션 종료 — 시험 모드 끝내기 / 학습 모드 노드 완주 시 호출.
// feat-10-005: 통합 시험 교시 세션이면 응시(mcq_exam_attempts)를 마무리하고 러너로 복귀.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { finalizeExamAttemptIfComplete } from "~/features/mcq-exams/queries.server";
import {
  completeQuizSession,
  getQuizSession,
} from "~/features/study/queries.server";

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

  // 통합 시험 교시 세션이면 — 응시 마무리(전 교시 완료 시 completed_at 설정) 후
  // 팩 결과 화면 대신 시험 러너로 복귀한다.
  if (session.examAttemptId) {
    const fin = await finalizeExamAttemptIfComplete(
      client,
      session.examAttemptId,
    );
    if (fin) {
      return redirect(`/latest/mcq/exam/${fin.examId}`);
    }
  }

  if (parsed.data.redirectTo) {
    return redirect(parsed.data.redirectTo);
  }
  return data({ ok: true, sessionId: parsed.data.sessionId });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
