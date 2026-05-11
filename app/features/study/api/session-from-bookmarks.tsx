// 즐겨찾기 객관식 문제 → quiz_session(scope_type='bookmark') 일괄 생성 후 첫 문제 redirect.
// 오답노트의 session-from-wrong 과 같은 패턴.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { listBookmarkedProblems } from "~/features/annotations/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";
import { createQuizSession } from "~/features/study/queries.server";

import type { Route } from "./+types/session-from-bookmarks";

const PER_PROBLEM_LIMIT_SEC = 90;

const schema = z.object({
  subject: z
    .enum(LAW_SUBJECT_SLUGS as unknown as [LawSubjectSlug, ...LawSubjectSlug[]])
    .optional(),
  minStar: z.coerce.number().int().min(1).max(5).optional(),
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
    minStar: form.get("minStar") || undefined,
    mode: form.get("mode") || undefined,
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  const refs = await listBookmarkedProblems(client, user.id, {
    lawCode: parsed.data.subject,
    minStar: parsed.data.minStar,
  });
  if (refs.length === 0) {
    return data({ error: "즐겨찾기한 문제가 없습니다" }, { status: 400 });
  }
  const problemIds = refs.map((r) => r.problemId);

  // 혼합 과목인 경우 첫 문제의 lawCode 를 세션 대표 과목으로 사용.
  const lawCode = (parsed.data.subject ?? refs[0].lawCode) as LawSubjectSlug;

  const sessionId = await createQuizSession(client, user.id, {
    mode: parsed.data.mode,
    lawCode,
    scopeType: "bookmark",
    scopePayload: {
      requestedAt: new Date().toISOString(),
      filteredSubject: parsed.data.subject ?? null,
      minStar: parsed.data.minStar ?? 1,
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
