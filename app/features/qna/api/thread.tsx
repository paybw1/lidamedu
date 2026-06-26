import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { getStaffRole } from "~/features/laws/queries.server";

import {
  generateInstantAnswer,
  shouldAnswerInstantly,
} from "../ai-answer.server";
import {
  qnaQualityGradeSchema,
  qnaSubjectSchema,
  qnaTargetTypeSchema,
} from "../labels";
import { notifyNewAnswer, notifyNewQuestion } from "../notify.server";
import {
  answerThread,
  closeThread,
  createThread,
  getThreadDetail,
  setAiVerdict,
  softDeleteThread,
} from "../queries.server";

import type { Route } from "./+types/thread";

const createSchema = z.object({
  intent: z.literal("create"),
  targetType: qnaTargetTypeSchema,
  // study_method 는 대상 콘텐츠가 없어 targetId 미전송. 콘텐츠 Q&A 는 필수(아래 action 에서 검사).
  targetId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  questionMd: z.string().min(1).max(10000),
  // 과목 분류 — study_method 필수. 콘텐츠 Q&A 는 대상에서 도출(미전송).
  subject: qnaSubjectSchema.optional(),
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

// 강사의 AI 답변 정오 평가 — 시험 대비라 binary(정확/부정확).
const verdictSchema = z.object({
  intent: z.literal("verdict"),
  threadId: z.string().uuid(),
  messageId: z.string().uuid(),
  verdict: z.enum(["correct", "incorrect"]),
});

const schema = z.discriminatedUnion("intent", [
  createSchema,
  answerSchema,
  closeSchema,
  deleteSchema,
  verdictSchema,
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
    const { targetType, targetId, subject } = parsed.data;
    // 공부방법은 과목 필수, 콘텐츠 Q&A 는 대상 필수.
    if (targetType === "study_method") {
      if (!subject) {
        return data(
          { ok: false, error: "subject-required" },
          { status: 400, headers },
        );
      }
    } else if (!targetId) {
      return data(
        { ok: false, error: "target-required" },
        { status: 400, headers },
      );
    }
    const thread = await createThread(client, user.id, {
      targetType,
      targetId: targetId ?? null,
      title: parsed.data.title,
      questionMd: parsed.data.questionMd,
      subject: subject ?? null,
    });

    const notifyTask = notifyNewQuestion(
      {
        threadId: thread.threadId,
        targetType: thread.targetType,
        title: thread.title,
        questionMd: thread.questionMd,
        askerName: thread.askerName,
      },
      user.id,
    );
    runAfterResponse(notifyTask);

    // 통합 Q&A 즉답 — 등급 토글/쿼터/캡 통과 시 Haiku RAG 답변을 background 로 생성.
    //   결정은 동기(요청 client 로 본인 쿼터 확인), 생성은 응답 후 background(adminClient).
    //   미통과(토글 OFF·쿼터/캡 초과)면 AI 없이 강사 대기 — 질문은 이미 정상 등록됨.
    const decision = await shouldAnswerInstantly(client, adminClient, user.id);
    if (decision.ok) {
      runAfterResponse(
        generateInstantAnswer(adminClient, {
          threadId: thread.threadId,
          questionMd: thread.questionMd,
          subject: thread.subject,
        }),
      );
    }

    return data({ ok: true, thread, aiPending: decision.ok }, { headers });
  }

  if (parsed.data.intent === "answer") {
    const thread = await answerThread(client, user.id, parsed.data.threadId, {
      answerMd: parsed.data.answerMd,
      qualityGrade: parsed.data.qualityGrade,
    });

    const notifyTask = notifyNewAnswer({
      threadId: thread.threadId,
      targetType: thread.targetType,
      title: thread.title,
      answerMd: thread.answerMd ?? "",
      qualityGrade: parsed.data.qualityGrade,
      askerProfileId: thread.askerId,
      answererName: thread.answererName,
    });
    runAfterResponse(notifyTask);

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

  if (parsed.data.intent === "verdict") {
    // 강사 전용 — RLS(staff)가 1차 방어지만 액션 게이트로 명시(역할 체크는 서버에서).
    const role = await getStaffRole(client, user.id);
    if (!role) {
      return data({ ok: false, error: "forbidden" }, { status: 403, headers });
    }
    await setAiVerdict(client, user.id, {
      threadId: parsed.data.threadId,
      messageId: parsed.data.messageId,
      verdict: parsed.data.verdict,
    });
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
