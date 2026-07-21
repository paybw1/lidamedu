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
  addInstructorMessage,
  addStudentMessage,
  answerThread,
  closeThread,
  createThread,
  getThreadDetail,
  listThreadMessages,
  retargetThread,
  setAiVerdict,
  softDeleteThread,
} from "../queries.server";
import { resolveProblemByDisplayNo } from "../lib/target-resolve.server";

import type { Route } from "./+types/thread";

const createSchema = z.object({
  intent: z.literal("create"),
  targetType: qnaTargetTypeSchema,
  // study_method 는 대상 콘텐츠가 없어 targetId 미전송. 콘텐츠 Q&A 는 필수(아래 action 에서 검사).
  targetId: z.string().uuid().optional(),
  // 쟁점(단원) 분류 — 조문이 여러 쟁점에 걸릴 때 사용자가 고른 단원. 대상은 조문 유지,
  // 분류(node_id)만 이 값으로. (질문의 대상을 단원으로 바꾸는 옛 방식은 폐기 — 조문 뷰어 미노출 문제)
  nodeId: z.string().uuid().optional(),
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

// 질문·답변 본문 수정 — 강사·관리자 전용(아카이브 정비 포함). 답변이 없는 스레드는 answerMd 생략.
const editSchema = z.object({
  intent: z.literal("edit"),
  threadId: z.string().uuid(),
  title: z.string().min(1).max(200),
  questionMd: z.string().min(1).max(10000),
  answerMd: z.string().max(10000).optional(),
});

// 강사의 AI 답변 정오 평가 — 시험 대비라 binary(정확/부정확).
const verdictSchema = z.object({
  intent: z.literal("verdict"),
  threadId: z.string().uuid(),
  messageId: z.string().uuid(),
  verdict: z.enum(["correct", "incorrect"]),
});

// 질문자 후속 질문(멀티턴) — AI 가 대화 이력을 이어받아 재응답.
const replySchema = z.object({
  intent: z.literal("reply"),
  threadId: z.string().uuid(),
  bodyMd: z.string().min(1).max(4000),
});

// 강사 추가 답변 — 정식 답변 이후 보충 설명·정정을 타임라인에 이어붙임(staff 전용).
// qualityGrade 동봉 시 스레드의 질문 수준 평가를 갱신(추가 답변 시 재평가 허용).
const instructorReplySchema = z.object({
  intent: z.literal("instructor_reply"),
  threadId: z.string().uuid(),
  bodyMd: z.string().min(1).max(10000),
  qualityGrade: qnaQualityGradeSchema.optional(),
});

// 타임라인 메시지(추가 질문·강사 추가 답변) 본문 수정 — 강사·관리자 전용. AI 메시지 제외.
const editMessageSchema = z.object({
  intent: z.literal("edit_message"),
  threadId: z.string().uuid(),
  messageId: z.string().uuid(),
  bodyMd: z.string().min(1).max(10000),
});

// 질문자의 AI 답변 도움됐어요 피드백 — 👍 1 / 👎 -1 / 해제 0.
const feedbackSchema = z.object({
  intent: z.literal("feedback"),
  messageId: z.string().uuid(),
  feedback: z.coerce.number().int().min(-1).max(1),
});

// 대상 재지정 — 잘못 매칭된 질문을 문제 고유번호(P-코드=display_no)로 다른 문제에 다시 연결(staff).
//   입력은 "P-5978" / "5978" 모두 허용 — 숫자만 추출.
const retargetSchema = z.object({
  intent: z.literal("retarget"),
  threadId: z.string().uuid(),
  displayNo: z.preprocess(
    (v) => Number(String(v ?? "").replace(/[^0-9]/g, "")),
    z.number().int().min(1),
  ),
});

const schema = z.discriminatedUnion("intent", [
  createSchema,
  answerSchema,
  closeSchema,
  deleteSchema,
  editSchema,
  verdictSchema,
  replySchema,
  instructorReplySchema,
  editMessageSchema,
  feedbackSchema,
  retargetSchema,
]);

// 멀티턴 이력 — 최초 질문 + 타임라인(후속=user, AI/강사=assistant) + 강사 정식답변.
// Anthropic messages 는 user/assistant 교대가 필요해 연속 같은 role 은 병합한다.
function buildHistoryTurns(
  questionMd: string,
  answerMd: string | null,
  messages: ReadonlyArray<{ role: string; bodyMd: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  const raw: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: questionMd },
  ];
  for (const m of messages) {
    raw.push({
      role: m.role === "student" ? "user" : "assistant",
      content: m.bodyMd,
    });
  }
  if (answerMd) raw.push({ role: "assistant", content: answerMd });
  const merged: typeof raw = [];
  for (const t of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) {
      last.content = `${last.content}\n\n${t.content}`;
    } else {
      merged.push({ ...t });
    }
  }
  return merged;
}

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
      nodeId: parsed.data.nodeId ?? null,
    });

    const notifyTask = notifyNewQuestion(
      {
        threadId: thread.threadId,
        targetType: thread.targetType,
        targetId: thread.targetId,
        subject: thread.subject,
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

  if (parsed.data.intent === "reply") {
    // 후속 질문은 질문자 본인만 — 공개 스레드의 채팅화 방지.
    const thread = await getThreadDetail(client, parsed.data.threadId);
    if (!thread) {
      return data({ ok: false, error: "not-found" }, { status: 404, headers });
    }
    if (thread.askerId !== user.id) {
      return data({ ok: false, error: "forbidden" }, { status: 403, headers });
    }
    if (thread.status === "closed") {
      return data({ ok: false, error: "closed" }, { status: 400, headers });
    }

    // 이력은 insert 전에 확보 — 새 후속 질문은 questionMd 파라미터로 전달된다.
    const prior = await listThreadMessages(client, thread.threadId);
    const history = buildHistoryTurns(
      thread.questionMd,
      thread.answerMd,
      prior,
    );
    await addStudentMessage(
      client,
      user.id,
      thread.threadId,
      parsed.data.bodyMd,
    );

    // 후속 질문(재질의)도 담당 강사에게 알림 — 최초 질문(create)과 동일 라우팅.
    //   그동안 reply 는 알림을 걸지 않아 재질의가 강사에게 전달되지 않았다(카톡·이메일·인박스 모두).
    //   질문 본문은 이번 후속 질문(bodyMd)으로, 링크·제목은 스레드 기준.
    runAfterResponse(
      notifyNewQuestion(
        {
          threadId: thread.threadId,
          targetType: thread.targetType,
          targetId: thread.targetId,
          subject: thread.subject,
          title: thread.title,
          questionMd: parsed.data.bodyMd,
          askerName: thread.askerName,
        },
        user.id,
      ),
    );

    const decision = await shouldAnswerInstantly(client, adminClient, user.id);
    if (decision.ok) {
      runAfterResponse(
        generateInstantAnswer(adminClient, {
          threadId: thread.threadId,
          questionMd: parsed.data.bodyMd,
          subject: thread.subject,
          history,
        }),
      );
    }
    return data({ ok: true, aiPending: decision.ok }, { headers });
  }

  if (parsed.data.intent === "instructor_reply") {
    // 강사·관리자 전용 — 정식 답변을 덮지 않고 추가 답변(instructor 메시지)으로 이어붙인다.
    const role = await getStaffRole(client, user.id);
    if (!role) {
      return data({ ok: false, error: "forbidden" }, { status: 403, headers });
    }
    const thread = await getThreadDetail(client, parsed.data.threadId);
    if (!thread) {
      return data({ ok: false, error: "not-found" }, { status: 404, headers });
    }
    await addInstructorMessage(
      client,
      user.id,
      thread.threadId,
      parsed.data.bodyMd,
    );
    // 질문 수준 재평가(선택) — 추가 답변과 함께 갱신. staff RLS 가 방어.
    const grade = parsed.data.qualityGrade ?? thread.qualityGrade ?? "mid";
    if (
      parsed.data.qualityGrade &&
      parsed.data.qualityGrade !== thread.qualityGrade
    ) {
      const { error: gradeErr } = await client
        .from("qna_threads")
        .update({ quality_grade: parsed.data.qualityGrade })
        .eq("thread_id", thread.threadId);
      if (gradeErr) {
        return data(
          { ok: false, error: gradeErr.message },
          { status: 400, headers },
        );
      }
    }
    // 질문자에게 새 답변 알림(인앱+이메일) — 정식 답변과 동일 채널.
    runAfterResponse(
      notifyNewAnswer({
        threadId: thread.threadId,
        targetType: thread.targetType,
        title: thread.title,
        answerMd: parsed.data.bodyMd,
        qualityGrade: grade,
        askerProfileId: thread.askerId,
        answererName: thread.answererName,
      }),
    );
    return data({ ok: true }, { headers });
  }

  if (parsed.data.intent === "edit_message") {
    // 강사·관리자 전용 — RLS(staff update)가 1차 방어지만 액션 게이트로 명시.
    const role = await getStaffRole(client, user.id);
    if (!role) {
      return data({ ok: false, error: "forbidden" }, { status: 403, headers });
    }
    const { data: rows, error } = await client
      .from("qna_messages")
      .update({ body_md: parsed.data.bodyMd })
      .eq("message_id", parsed.data.messageId)
      .eq("thread_id", parsed.data.threadId)
      .neq("role", "ai")
      .is("deleted_at", null)
      .select("message_id");
    if (error) {
      return data({ ok: false, error: error.message }, { status: 400, headers });
    }
    if (!rows?.length) {
      return data({ ok: false, error: "not-found" }, { status: 404, headers });
    }
    return data({ ok: true }, { headers });
  }

  if (parsed.data.intent === "feedback") {
    // 질문자 검증·컬럼 한정은 SECURITY DEFINER RPC 가 수행(AI 메시지는 author 없음).
    const { error } = await client.rpc("set_qna_ai_feedback", {
      p_message_id: parsed.data.messageId,
      p_feedback: parsed.data.feedback,
    });
    if (error) {
      return data({ ok: false, error: error.message }, { status: 400, headers });
    }
    return data({ ok: true }, { headers });
  }

  if (parsed.data.intent === "retarget") {
    // 강사·관리자 전용 — 잘못 매칭된 질문을 문제 고유번호(P-코드)로 다른 문제에 재연결.
    const role = await getStaffRole(client, user.id);
    if (!role) {
      return data({ ok: false, error: "forbidden" }, { status: 403, headers });
    }
    const resolved = await resolveProblemByDisplayNo(
      client,
      parsed.data.displayNo,
    );
    if (!resolved) {
      return data(
        { ok: false, error: "problem-not-found" },
        { status: 404, headers },
      );
    }
    const r = await retargetThread(client, parsed.data.threadId, {
      targetType: "problem",
      targetId: resolved.targetId,
    });
    if (!r.ok) {
      return data(
        { ok: false, error: r.error ?? "update-failed" },
        { status: 400, headers },
      );
    }
    return data({ ok: true, label: resolved.label }, { headers });
  }

  if (parsed.data.intent === "edit") {
    // 강사·관리자 전용 — RLS(staff)가 1차 방어지만 액션 게이트로 명시.
    const role = await getStaffRole(client, user.id);
    if (!role) {
      return data({ ok: false, error: "forbidden" }, { status: 403, headers });
    }
    const existing = await getThreadDetail(client, parsed.data.threadId);
    if (!existing) {
      return data({ ok: false, error: "not-found" }, { status: 404, headers });
    }
    const answerMd = parsed.data.answerMd?.trim();
    const { error } = await client
      .from("qna_threads")
      .update({
        title: parsed.data.title,
        question_md: parsed.data.questionMd,
        // 기존 답변이 있는 스레드만 답변 수정(빈 값으로 답변 삭제는 미지원 — 삭제는 스레드 단위).
        ...(existing.answerMd && answerMd ? { answer_md: answerMd } : {}),
      })
      .eq("thread_id", parsed.data.threadId)
      .is("deleted_at", null);
    if (error) {
      return data({ ok: false, error: error.message }, { status: 400, headers });
    }
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

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
