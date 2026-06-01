// feat §B2 — 특정 회차 오답 묶음 → wrong-note 세션 생성 후 첫 문제 redirect.
//   기존 /api/study/session-from-wrong 는 전역 오답 큐(subject 단위). 본 API 는 한 회차 한정.
//
// Q2 보강: scope_payload 에 sourceSessionId / sourcePackId / sourceExamAttemptId 보존 →
//   추후 "이 오답들을 SRS 복습 큐에 추가" 기능을 데이터 재작업 없이 얹을 수 있다.
//   problem_ids 는 quiz_sessions.problem_ids 그대로 freeze.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  createQuizSession,
  getQuizSession,
} from "~/features/study/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/session-from-attempts";

const PER_PROBLEM_LIMIT_SEC = 90;

const schema = z.object({
  sourceSessionId: z.string().uuid(),
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
    sourceSessionId: form.get("sourceSessionId"),
    mode: form.get("mode") || undefined,
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  // 원본 세션 본인 소유 검증 + lawCode 추론.
  const sourceSession = await getQuizSession(
    client,
    user.id,
    parsed.data.sourceSessionId,
  );
  if (!sourceSession) {
    return data({ error: "Source session not found" }, { status: 404 });
  }

  // 그 회차의 오답 problemIds — user_problem_attempts 에서 isCorrect=false 만.
  const { data: attempts, error: aErr } = await client
    .from("user_problem_attempts")
    .select("problem_id, is_correct, attempted_at")
    .eq("user_id", user.id)
    .eq("session_id", parsed.data.sourceSessionId)
    .order("attempted_at", { ascending: false });
  if (aErr) return data({ error: aErr.message }, { status: 500 });

  // 동일 문제 최신 시도만.
  const seen = new Set<string>();
  const wrongIds: string[] = [];
  for (const r of attempts ?? []) {
    if (seen.has(r.problem_id)) continue;
    seen.add(r.problem_id);
    if (r.is_correct === false) wrongIds.push(r.problem_id);
  }
  // 원본 problem_ids 순서 보존.
  const ordered = sourceSession.problemIds.filter((pid) => wrongIds.includes(pid));
  if (ordered.length === 0) {
    return data(
      { error: "이 회차에 오답이 없습니다." },
      { status: 400 },
    );
  }

  const lawCodeParsed = lawSubjectSlugSchema.safeParse(sourceSession.lawCode);
  const lawCode: LawSubjectSlug | undefined = lawCodeParsed.success
    ? lawCodeParsed.data
    : undefined;
  if (!lawCode) {
    return data({ error: "lawCode 추론 실패" }, { status: 400 });
  }

  // 새 세션 생성. scope_payload 에 sourceSessionId 메타 보존 (SRS 연결 자리).
  //   sourcePackId / sourceExamAttemptId 는 sourceSessionId 로 lookup 가능 — 단순화.
  const newSessionId = await createQuizSession(client, user.id, {
    mode: parsed.data.mode,
    lawCode,
    scopeType: "wrong-note",
    scopePayload: {
      sourceSessionId: parsed.data.sourceSessionId,
      sourceExamAttemptId: sourceSession.examAttemptId ?? null,
      originLabel: "이번 회차 오답",
    },
    problemIds: ordered,
    timeLimitSec:
      parsed.data.mode === "exam"
        ? Math.max(60, ordered.length * PER_PROBLEM_LIMIT_SEC)
        : null,
  });

  const params = new URLSearchParams();
  params.set("session", newSessionId);
  params.set("mode", parsed.data.mode);
  return redirect(
    `/subjects/${lawCode}/problems/${ordered[0]}?${params.toString()}`,
  );
}
