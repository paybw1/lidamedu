// /api/mcq-exam/start — 통합 1차 모의고사 응시 시작 (feat-10-005).
// mcq_exam_attempts 한 행만 생성하고 시험 러너로 redirect.
// 교시별 quiz_session 생성은 러너 → /api/mcq-pack/start 단일 경로가 담당한다.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  createExamAttempt,
  getExamById,
  getExamPapers,
} from "~/features/mcq-exams/queries.server";

import type { Route } from "./+types/start";

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
  const examId = String(fd.get("examId") ?? "");
  if (!z.string().uuid().safeParse(examId).success) {
    return data({ error: "Invalid examId" }, { status: 400 });
  }

  // RLS: 학생은 published 시험만 보인다.
  const exam = await getExamById(client, examId);
  if (!exam) return data({ error: "Exam not found" }, { status: 404 });

  const papers = await getExamPapers(client, examId);
  if (papers.length === 0) {
    return data({ error: "교시가 구성되지 않은 시험입니다." }, { status: 400 });
  }

  await createExamAttempt(client, examId, user.id);
  return redirect(`/latest/mcq/exam/${examId}`);
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
