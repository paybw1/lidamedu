// 운영자가 채점 화면에서 한 답안에 대해 Claude AI 채점 초안을 요청.
// 결과는 fetcher.data 로 반환되고, UI 가 score / feedback 필드에 prefill.
// 자동 저장은 안 함 — 강사가 검토·수정 후 직접 저장.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { generateGradingDraft } from "~/features/gs/lib/ai-grader.server";
import {
  ensureAnswerRow,
  getGsRound,
  listAnswersForSubmission,
  listGsQuestions,
} from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/ai-draft";

const schema = z.object({
  submissionId: z.string().uuid(),
  questionId: z.string().uuid(),
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
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const parsed = schema.safeParse({
    submissionId: fd.get("submissionId"),
    questionId: fd.get("questionId"),
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  // 답안 + 문제 fetch.
  const answer = await ensureAnswerRow(
    client,
    parsed.data.submissionId,
    parsed.data.questionId,
  );
  const allAnswers = await listAnswersForSubmission(
    client,
    parsed.data.submissionId,
  );
  const _ans = allAnswers.find((a) => a.questionId === parsed.data.questionId);

  // 답안의 첨부에서 OCR 텍스트 합치기.
  const attachments = (_ans ?? answer).attachments;
  const ocrTexts: string[] = [];
  const warnings: string[] = [];
  for (const att of attachments) {
    if (att.ocrText && att.ocrText.trim().length > 0) {
      ocrTexts.push(`[${att.fileName}]\n${att.ocrText}`);
    } else if (att.mime.startsWith("image/")) {
      warnings.push(`${att.fileName}: OCR 텍스트 없음`);
    }
    if (att.ocrLevel === "bad") {
      warnings.push(`${att.fileName}: 판독률 부족`);
    }
  }
  const studentAnswerText = ocrTexts.join("\n\n---\n\n");

  // 회차 + 문제 메타.
  const submissionRow = await client
    .from("gs_submissions")
    .select("round_id")
    .eq("submission_id", parsed.data.submissionId)
    .maybeSingle();
  if (!submissionRow.data) {
    return data({ error: "Submission not found" }, { status: 404 });
  }
  const round = await getGsRound(client, submissionRow.data.round_id);
  if (!round) return data({ error: "Round not found" }, { status: 404 });
  const questions = await listGsQuestions(client, round.roundId);
  const question = questions.find(
    (q) => q.questionId === parsed.data.questionId,
  );
  if (!question) {
    return data({ error: "Question not found" }, { status: 404 });
  }

  const draft = await generateGradingDraft({
    questionTitle: question.title,
    questionBody: question.bodyMd,
    modelAnswer: question.modelAnswerMd,
    maxScore: question.maxScore,
    studentAnswerText,
    legibilityWarnings: warnings,
  });

  if (!draft) {
    return data(
      {
        error:
          "AI 초안 생성 실패 — ANTHROPIC_API_KEY 설정 또는 OCR 텍스트 부족 여부를 확인하세요.",
      },
      { status: 500 },
    );
  }

  return data({ ok: true, draft });
}
