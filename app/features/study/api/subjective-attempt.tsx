// 주관식 답안 autosave + 자기채점 제출.
// intent=autosave : answer_md 만 갱신 (submitted_at 유지).
// intent=submit   : answer_md + self_score + submitted_at 갱신.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { upsertSubjectiveAttempt } from "~/features/study/queries.server";

import type { Route } from "./+types/subjective-attempt";

const baseSchema = z.object({
  problemId: z.string().uuid(),
  answerMd: z.string().max(20000),
});

const submitSchema = baseSchema.extend({
  selfScore: z.coerce.number().int().min(0).max(100).nullable().optional(),
  selfScoreNote: z.string().max(2000).nullable().optional(),
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
  const intent = String(fd.get("intent") ?? "autosave");

  if (intent === "autosave") {
    const parsed = baseSchema.safeParse({
      problemId: fd.get("problemId"),
      answerMd: fd.get("answerMd") ?? "",
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const attempt = await upsertSubjectiveAttempt(
      client,
      user.id,
      parsed.data.problemId,
      { answerMd: parsed.data.answerMd },
    );
    return data({ ok: true, attempt });
  }

  if (intent === "submit") {
    const parsed = submitSchema.safeParse({
      problemId: fd.get("problemId"),
      answerMd: fd.get("answerMd") ?? "",
      selfScore: fd.get("selfScore"),
      selfScoreNote: (fd.get("selfScoreNote") as string | null) || null,
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const attempt = await upsertSubjectiveAttempt(
      client,
      user.id,
      parsed.data.problemId,
      {
        answerMd: parsed.data.answerMd,
        submit: {
          selfScore: parsed.data.selfScore ?? null,
          selfScoreNote: parsed.data.selfScoreNote ?? null,
        },
      },
    );
    return data({ ok: true, attempt });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}
