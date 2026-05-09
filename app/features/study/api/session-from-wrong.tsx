// 현재 오답 큐 → quiz_session(scope_type='wrong-note') 일괄 생성 후 첫 문제 redirect.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  createQuizSession,
  listWrongAttempts,
} from "~/features/study/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/session-from-wrong";

const PER_PROBLEM_LIMIT_SEC = 90;

const schema = z.object({
  subject: z
    .enum(LAW_SUBJECT_SLUGS as unknown as [LawSubjectSlug, ...LawSubjectSlug[]])
    .optional(),
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
    subject: form.get("subject") || undefined,
    mode: form.get("mode") || undefined,
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  const wrongs = await listWrongAttempts(
    client,
    user.id,
    parsed.data.subject,
  );
  if (wrongs.length === 0) {
    return data({ error: "오답이 없습니다" }, { status: 400 });
  }
  const problemIds = wrongs.map((w) => w.problemId);

  // scope 의 lawCode 는 첫 문제의 lawCode 기준 (혼합 과목인 경우 필터된 값을 사용).
  const lawCode = parsed.data.subject ?? wrongs[0].lawCode;

  const sessionId = await createQuizSession(client, user.id, {
    mode: parsed.data.mode,
    lawCode,
    scopeType: "wrong-note",
    scopePayload: {
      requestedAt: new Date().toISOString(),
      filteredSubject: parsed.data.subject ?? null,
    },
    problemIds,
    timeLimitSec:
      parsed.data.mode === "exam"
        ? Math.max(60, problemIds.length * PER_PROBLEM_LIMIT_SEC)
        : null,
  });

  const params = new URLSearchParams();
  params.set("session", sessionId);
  params.set("mode", parsed.data.mode);
  return redirect(
    `/subjects/${lawCode}/problems/${problemIds[0]}?${params.toString()}`,
  );
}
