// feat-2-026 — 과목별 SRS due 객관식 묶음 → quiz_session 생성 후 첫 문제 redirect.
//   /study/srs MCQ 섹션의 "복습 시작" 진입. 표 행 단건 scatter 대신 묶음으로 모아
//   problem-viewer 에서 prev/next 로 순회 풀이(채점·SRS 갱신은 기존 흐름 재사용).
//
//   세션 = 단일 과목(createQuizSession lawCode XOR science) → subject 필수.
//   due 는 getDueProblems(전과목, overdue 우선)에서 과목 필터 — 정렬 순서 보존.
//   scope_type 은 'srs' enum 이 없어 'filter' 재사용 + scopePayload 로 출처/복귀 구분.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { createQuizSession } from "~/features/study/queries.server";
import { getDueProblems } from "~/features/study/srs.server";
import { lawSubjectSlugSchema } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/session-from-srs";

const PER_PROBLEM_LIMIT_SEC = 90;
const DUE_FETCH_LIMIT = 500;

const schema = z.object({
  subject: lawSubjectSlugSchema,
  mode: z.enum(["study", "exam"]).default("study"),
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
    subject: form.get("subject"),
    mode: form.get("mode") || undefined,
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }
  const { subject, mode } = parsed.data;

  // 전과목 due(overdue 가장 오래된 것 우선) 중 이 과목만. 정렬 순서 그대로 세션에 freeze.
  const due = await getDueProblems(client, user.id, DUE_FETCH_LIMIT);
  const problemIds = due
    .filter((d) => d.lawCode === subject)
    .map((d) => d.problemId);
  if (problemIds.length === 0) {
    return data({ error: "지금 복습할 항목이 없습니다." }, { status: 400 });
  }

  const sessionId = await createQuizSession(client, user.id, {
    mode,
    lawCode: subject,
    scopeType: "filter",
    scopePayload: {
      source: "srs",
      originLabel: "복습 풀이",
      backHref: "/study/srs",
      requestedAt: new Date().toISOString(),
    },
    problemIds,
    timeLimitSec:
      mode === "exam"
        ? Math.max(60, problemIds.length * PER_PROBLEM_LIMIT_SEC)
        : null,
  });

  const params = new URLSearchParams();
  params.set("session", sessionId);
  params.set("mode", mode);
  return redirect(
    `/subjects/${subject}/problems/${problemIds[0]}?${params.toString()}`,
  );
}
