// 문제 풀이 시도 기록 API — 학습/시험 모드 모두 1행 = 1회 채점.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { recordProblemAttempt } from "~/features/study/queries.server";

import type { Route } from "./+types/attempt";

const schema = z.object({
  problemId: z.string().uuid(),
  selectedChoiceId: z.string().uuid().optional().nullable(),
  selectedChoiceIndex: z.coerce.number().int().min(1).max(20).optional().nullable(),
  selectedBoxItemId: z.string().uuid().optional().nullable(),
  oxAnswer: z.enum(["O", "X"]).optional().nullable(),
  isCorrect: z.union([z.literal("true"), z.literal("false")]).transform((v) => v === "true"),
  mode: z.enum(["study", "exam"]).optional(),
  timeSpentMs: z.coerce.number().int().nonnegative().optional().nullable(),
  sessionId: z.string().uuid().optional().nullable(),
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
    problemId: form.get("problemId"),
    selectedChoiceId: form.get("selectedChoiceId") || null,
    selectedChoiceIndex: form.get("selectedChoiceIndex"),
    selectedBoxItemId: form.get("selectedBoxItemId") || null,
    oxAnswer: form.get("oxAnswer") || null,
    isCorrect: form.get("isCorrect"),
    mode: form.get("mode") || undefined,
    timeSpentMs: form.get("timeSpentMs") || null,
    sessionId: form.get("sessionId") || null,
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  await recordProblemAttempt(client, user.id, {
    problemId: parsed.data.problemId,
    selectedChoiceId: parsed.data.selectedChoiceId ?? null,
    selectedChoiceIndex: parsed.data.selectedChoiceIndex ?? null,
    selectedBoxItemId: parsed.data.selectedBoxItemId ?? null,
    oxAnswer: parsed.data.oxAnswer ?? null,
    isCorrect: parsed.data.isCorrect,
    mode: parsed.data.mode,
    timeSpentMs: parsed.data.timeSpentMs ?? null,
    sessionId: parsed.data.sessionId ?? null,
  });

  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
