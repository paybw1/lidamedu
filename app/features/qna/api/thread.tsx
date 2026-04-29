import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import {
  qnaQualityGradeSchema,
  qnaTargetTypeSchema,
} from "../labels";
import { notifyNewAnswer, notifyNewQuestion } from "../notify.server";
import {
  answerThread,
  closeThread,
  createThread,
  getThreadDetail,
  softDeleteThread,
} from "../queries.server";

import type { Route } from "./+types/thread";

const createSchema = z.object({
  intent: z.literal("create"),
  targetType: qnaTargetTypeSchema,
  targetId: z.string().uuid(),
  title: z.string().min(1).max(200),
  questionMd: z.string().min(1).max(10000),
});

const answerSchema = z.object({
  intent: z.literal("answer"),
  threadId: z.string().uuid(),
  answerMd: z.string().min(1).max(10000),
  qualityGrade: qnaQualityGradeSchema,
});

const closeSchema = z.object({
  intent: z.literal("close"),
  threadId: z.string().uuid(),
});

const deleteSchema = z.object({
  intent: z.literal("delete"),
  threadId: z.string().uuid(),
});

const schema = z.discriminatedUnion("intent", [
  createSchema,
  answerSchema,
  closeSchema,
  deleteSchema,
]);

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "method-not-allowed" }, { status: 405 });
  }

  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }

  const formData = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return data(
      { ok: false, error: "invalid-input", issues: parsed.error.issues },
      { status: 400, headers },
    );
  }

  if (parsed.data.intent === "create") {
    const thread = await createThread(client, user.id, {
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      title: parsed.data.title,
      questionMd: parsed.data.questionMd,
    });

    notifyNewQuestion(
      {
        threadId: thread.threadId,
        targetType: thread.targetType,
        title: thread.title,
        questionMd: thread.questionMd,
        askerName: thread.askerName,
      },
      user.id,
    ).catch(() => {});

    return data({ ok: true, thread }, { headers });
  }

  if (parsed.data.intent === "answer") {
    const thread = await answerThread(client, user.id, parsed.data.threadId, {
      answerMd: parsed.data.answerMd,
      qualityGrade: parsed.data.qualityGrade,
    });

    notifyNewAnswer({
      threadId: thread.threadId,
      targetType: thread.targetType,
      title: thread.title,
      answerMd: thread.answerMd ?? "",
      qualityGrade: parsed.data.qualityGrade,
      askerProfileId: thread.askerId,
      answererName: thread.answererName,
    }).catch(() => {});

    return data({ ok: true, thread }, { headers });
  }

  if (parsed.data.intent === "close") {
    // RLS 검증을 위해 먼저 detail 조회 (권한이 없으면 null 반환)
    const existing = await getThreadDetail(client, parsed.data.threadId);
    if (!existing) {
      return data({ ok: false, error: "not-found" }, { status: 404, headers });
    }
    await closeThread(client, parsed.data.threadId);
    return data({ ok: true }, { headers });
  }

  // delete (soft)
  const existing = await getThreadDetail(client, parsed.data.threadId);
  if (!existing) {
    return data({ ok: false, error: "not-found" }, { status: 404, headers });
  }
  await softDeleteThread(client, parsed.data.threadId);
  return data({ ok: true }, { headers });
}
