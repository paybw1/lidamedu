// feat-7-042 — 오프라인 테스트 온라인 응시 시작 (학생).
// 접근 증명 = RLS: offline_tests/questions 는 자기 반 멤버만 조회된다.
// 객관식만으로 구성된 테스트 한정 — 세션(source='offline_test_online')을 만들어
// 기존 문제 뷰어 러너(법률/자연과학)로 진입. 결과는 운영자가 결과 입력 화면에서
// "온라인 응시 불러오기"로 스냅샷에 반영한다.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getOfflineTestWithQuestions } from "~/features/offline-tests/queries.server";
import { createQuizSession } from "~/features/study/queries.server";
import { scienceSubjectPath } from "~/features/subjects/lib/science";

import type { Route } from "./+types/offline-test-online";

const PER_PROBLEM_LIMIT_SEC = 90;

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
  const parsed = z
    .object({
      testId: z.string().uuid(),
      assignmentId: z.string().uuid(),
    })
    .safeParse({
      testId: fd.get("testId"),
      assignmentId: fd.get("assignmentId"),
    });
  if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });

  // RLS 멤버 read — 조회되지 않으면 이 반 학생이 아니다(fail-closed).
  const test = await getOfflineTestWithQuestions(client, parsed.data.testId);
  if (!test || test.assignmentId !== parsed.data.assignmentId) {
    return data({ error: "테스트를 찾을 수 없습니다" }, { status: 404 });
  }
  if (
    test.questions.length === 0 ||
    test.questions.some((q) => q.questionType !== "mcq")
  ) {
    return data(
      { error: "객관식만으로 구성된 테스트만 온라인 응시할 수 있습니다" },
      { status: 400 },
    );
  }

  const problemIds = [...test.questions]
    .sort((a, b) => a.ord - b.ord)
    .map((q) => q.problemId)
    .filter((v): v is string => !!v);

  const sessionId = await createQuizSession(client, user.id, {
    mode: "exam",
    ...(test.lawCode
      ? { lawCode: test.lawCode }
      : { scienceSubject: test.scienceSubject ?? undefined }),
    scopeType: "filter",
    scopePayload: {
      source: "offline_test_online",
      testId: test.testId,
      title: test.title,
      backHref: `/assignments/${test.assignmentId}`,
    },
    problemIds,
    timeLimitSec: test.durationMin
      ? test.durationMin * 60
      : Math.max(60, problemIds.length * PER_PROBLEM_LIMIT_SEC),
  });

  const firstHref = test.scienceSubject
    ? `/subjects/science/${scienceSubjectPath(test.scienceSubject)}/problems/${problemIds[0]}?session=${sessionId}`
    : `/subjects/${test.lawCode}/problems/${problemIds[0]}?session=${sessionId}`;
  return redirect(firstHref);
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
