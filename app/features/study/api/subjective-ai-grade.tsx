// feat-2-032 S3 — 학생 2차 3단계 훈련(논점·목차·포섭) AI 채점 초안. 본인이 자기 기록에 대해 요청.
//   근거 = 문제 발문 + 모범답안 + 실제 채점위원 채점평(problem_grading_notes) + 3축 루브릭.
//   결과를 user_subjective_attempts.ai_* 에 저장하고 반환. 강사 확정(reviewer_*)과 별개 초안.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { gradeEssayDraft } from "~/features/study/lib/essay-ai-grader.server";

import type { Route } from "./+types/subjective-ai-grade";

const schema = z.object({
  problemId: z.string().uuid(),
  // 화면에 보이는 현재 3단계 내용(자동저장 레이스 방지). 없으면 저장된 값 사용.
  issuesMd: z.string().max(20000).optional(),
  outlineMd: z.string().max(20000).optional(),
  analysisMd: z.string().max(20000).optional(),
});
// 3단계를 합쳐 이 길이 미만이면 채점 무의미(비용 낭비 방지).
const MIN_ANSWER_LEN = 50;

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
  const parsed = schema.safeParse({
    problemId: fd.get("problemId"),
    issuesMd: (fd.get("issuesMd") as string | null) ?? undefined,
    outlineMd: (fd.get("outlineMd") as string | null) ?? undefined,
    analysisMd: (fd.get("analysisMd") as string | null) ?? undefined,
  });
  if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
  const problemId = parsed.data.problemId;

  // 본인 기록(최근) — RLS 로 본인 것만. 화면 값(form)이 오면 그것을 채점(레이스 방지).
  const { data: attempt } = await client
    .from("user_subjective_attempts")
    .select("attempt_id, issues_md, outline_md, analysis_md")
    .eq("user_id", user.id)
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const stages = {
    issuesMd: parsed.data.issuesMd ?? attempt?.issues_md ?? "",
    outlineMd: parsed.data.outlineMd ?? attempt?.outline_md ?? "",
    analysisMd: parsed.data.analysisMd ?? attempt?.analysis_md ?? "",
  };
  const filledLen = (
    stages.issuesMd +
    stages.outlineMd +
    stages.analysisMd
  ).trim().length;
  if (filledLen < MIN_ANSWER_LEN) {
    return data(
      { error: "조금 더 작성한 뒤 채점을 요청하세요." },
      { status: 400 },
    );
  }

  // 문제 + 채점평. 문제·채점평 read 는 공개.
  const { data: prob } = await client
    .from("problems")
    .select("body_md, model_answer_md, subjective_topic, format, exam_round")
    .eq("problem_id", problemId)
    .maybeSingle();
  if (!prob || prob.format !== "subjective") {
    return data({ error: "주관식 문제가 아닙니다." }, { status: 400 });
  }
  const { data: notes } = await client
    .from("problem_grading_notes")
    .select("body_md")
    .eq("problem_id", problemId)
    .eq("source", "examiner")
    .order("display_order", { ascending: true });
  const gradingNotesMd =
    (notes ?? []).map((n) => n.body_md).join("\n\n---\n\n") || null;

  const draft = await gradeEssayDraft({
    questionLabel: prob.subjective_topic ?? null,
    questionBody: prob.body_md ?? "",
    modelAnswer: prob.model_answer_md ?? null,
    gradingNotesMd,
    studentStages: stages,
    userId: user.id,
  });
  if (!draft) {
    return data(
      { error: "AI 채점을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  // 저장 — 저장된 attempt 가 있으면 거기에 초안 기록(RLS 본인). 없으면 결과만 반환.
  if (attempt) {
    await client
      .from("user_subjective_attempts")
      .update({
        ai_overall_score: draft.overall,
        ai_axis_scores: draft.axisScores,
        ai_feedback_md: draft.feedbackMd,
        ai_graded_at: new Date().toISOString(),
      })
      .eq("attempt_id", attempt.attempt_id);
  }

  return data({ ok: true, draft });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
