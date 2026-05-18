// 운영자 채점 상세 — 한 학생의 제출에 대해 문항별 점수·피드백 입력 후 마무리.
//
// 답안지 모델: submission 단위 N페이지. 각 문항마다 매핑된 페이지들(순서대로)을 합본 갤러리로 표시.
// 보조 패널: 전체 답안지 페이지 인덱스 (페이지 번호 클릭 시 anchor 스크롤).

import {
  CheckCircle2Icon,
  EyeIcon,
  FileTextIcon,
  RotateCcwIcon,
  SaveIcon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { data, useFetcher } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Separator } from "~/core/components/ui/separator";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, Field } from "~/features/admin/components/admin-ui";
import {
  type GsAnswerRecord,
  type GsPage,
  type GsQuestion,
  finalizeGrading,
  getAttachmentSignedUrl,
  getGradingDetail,
  getGsRound,
  unsealGrading,
  updateAnswerGrading,
} from "~/features/gs/queries.server";
import { listPeerReviewsForSubmission } from "~/features/gs/queries-peer.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-grade";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.detail
      ? `${loaderData.detail.studentName ?? "학생"} 채점 | Lidam Patent Attorney Academy`
      : "GS 채점 | Lidam Patent Attorney Academy",
  },
];

const gradeSchema = z.object({
  intent: z.literal("grade-answer"),
  submissionId: z.string().uuid(),
  questionId: z.string().uuid(),
  score: z.string().optional(),
  feedbackMd: z.string().optional(),
  rubricScores: z.string().optional(),
});
const finalizeSchema = z.object({
  intent: z.literal("finalize"),
  submissionId: z.string().uuid(),
});
const reopenSchema = z.object({
  intent: z.literal("reopen"),
  submissionId: z.string().uuid(),
});

export async function loader({ params, request }: Route.LoaderArgs) {
  const { roundId, submissionId } = params;
  if (!roundId || !submissionId)
    throw data("Missing params", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const [round, detail, peerReviews] = await Promise.all([
    getGsRound(client, roundId),
    getGradingDetail(client, submissionId),
    listPeerReviewsForSubmission(client, submissionId),
  ]);
  if (!round) throw data("Round not found", { status: 404 });
  if (!detail || detail.submission.roundId !== roundId)
    throw data("Submission not found", { status: 404 });

  // 페이지 첨부 signed url prefetch.
  const attUrls: Record<string, string> = {};
  for (const p of detail.pages) {
    const url = await getAttachmentSignedUrl(client, p.attachment.path, 1200);
    if (url) attUrls[p.attachment.path] = url;
  }

  // Map 을 직렬화 가능한 객체로 변환.
  const answersByQ: Record<string, GsAnswerRecord> = {};
  detail.answersByQuestion.forEach((v, k) => {
    answersByQ[k] = v;
  });
  const pagesByQ: Record<string, GsPage[]> = {};
  detail.pagesByQuestion.forEach((v, k) => {
    pagesByQ[k] = v;
  });

  // 문항별 동료 채점 묶기 — reviewer 익명화.
  const peerByQ: Record<
    string,
    { score: number | null; feedbackMd: string | null }[]
  > = {};
  for (const pr of peerReviews) {
    for (const a of pr.answers) {
      const list = peerByQ[a.questionId] ?? [];
      list.push({ score: a.score, feedbackMd: a.feedbackMd });
      peerByQ[a.questionId] = list;
    }
  }
  const peerStats = {
    submissions: peerReviews.length,
  };

  return {
    round,
    detail: {
      submission: detail.submission,
      studentName: detail.studentName,
      questions: detail.questions,
      answersByQ,
      pagesByQ,
      pages: detail.pages,
    },
    attUrls,
    peerByQ,
    peerStats,
    role,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const { roundId, submissionId } = params;
  if (!roundId || !submissionId)
    return { ok: false, error: "Missing params" } as const;
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;
  const role = await getStaffRole(client, user.id);
  if (!role) return { ok: false, error: "Forbidden" } as const;

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "grade-answer") {
    const parsed = gradeSchema.safeParse({
      intent,
      submissionId: fd.get("submissionId"),
      questionId: fd.get("questionId"),
      score: fd.get("score") ?? undefined,
      feedbackMd: fd.get("feedbackMd") ?? undefined,
      rubricScores: fd.get("rubricScores") ?? undefined,
    });
    if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
    const scoreStr = parsed.data.score?.trim() ?? "";
    const score: number | null = scoreStr === "" ? null : Number(scoreStr);
    if (score != null && !Number.isFinite(score))
      return { ok: false, error: "score must be number" } as const;
    const feedback =
      parsed.data.feedbackMd === undefined
        ? undefined
        : parsed.data.feedbackMd === ""
          ? null
          : parsed.data.feedbackMd;

    let rubricScoresPayload:
      | Record<string, { score: number; note?: string }>
      | undefined;
    if (parsed.data.rubricScores) {
      try {
        const obj = JSON.parse(parsed.data.rubricScores);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          const out: Record<string, { score: number; note?: string }> = {};
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            if (!v || typeof v !== "object") continue;
            const o = v as Record<string, unknown>;
            const s = typeof o.score === "number" ? o.score : null;
            if (s == null || !Number.isFinite(s)) continue;
            out[k] = { score: s };
            if (typeof o.note === "string") out[k].note = o.note;
          }
          rubricScoresPayload = out;
        }
      } catch {
        return { ok: false, error: "Invalid rubricScores" } as const;
      }
    }

    await updateAnswerGrading(
      client,
      parsed.data.submissionId,
      parsed.data.questionId,
      { score, feedbackMd: feedback, rubricScores: rubricScoresPayload },
    );
    return { ok: true } as const;
  }

  if (intent === "finalize") {
    const parsed = finalizeSchema.safeParse({
      intent,
      submissionId: fd.get("submissionId"),
    });
    if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
    const result = await finalizeGrading(
      client,
      parsed.data.submissionId,
      user.id,
    );
    return { ok: true, totalScore: result.totalScore } as const;
  }

  if (intent === "reopen") {
    const parsed = reopenSchema.safeParse({
      intent,
      submissionId: fd.get("submissionId"),
    });
    if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
    await unsealGrading(client, parsed.data.submissionId);
    return { ok: true } as const;
  }

  return { ok: false, error: "Unknown intent" } as const;
}

export default function AdminGsGrade({ loaderData }: Route.ComponentProps) {
  const { round, detail, attUrls, peerByQ, peerStats, role } = loaderData;
  const { submission, studentName, questions, answersByQ, pagesByQ, pages } =
    detail;
  const finalizeFetcher = useFetcher<typeof action>();

  const totalGraded = questions.reduce((sum, q) => {
    const a = answersByQ[q.questionId];
    return sum + (a?.score ?? 0);
  }, 0);
  const allGraded = questions.every(
    (q) => answersByQ[q.questionId]?.score != null,
  );
  const isFinalized = submission.gradedAt != null;
  const maxTotal = questions.reduce((s, q) => s + q.maxScore, 0);

  return (
    <AdminShell
      cluster="gs"
      role={role}
      title={
        <>
          {studentName ?? "이름 미설정"}{" "}
          <span className="text-muted-foreground text-base font-normal">
            · {submission.userId.slice(0, 8)}
          </span>
        </>
      }
      desc={`${round.title} · ${LAW_SUBJECTS[round.subject]?.name ?? round.subject} · 제출 ${formatDateTime(submission.submittedAt)}`}
      headerRight={
        isFinalized ? (
          <Chip tone="emerald">
            <CheckCircle2Icon className="size-3" /> 채점 완료 · {submission.totalScore}점
          </Chip>
        ) : (
          <Chip tone="amber">미완료 · 누적 {totalGraded}점</Chip>
        )
      }
      width={960}
    >
      {/* 답안지 페이지 인덱스 */}
      {pages.length > 0 ? (
        <div className="bg-card border-border mb-5 rounded-xl border p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.06em] uppercase">
              답안지 페이지 ({pages.length} / {round.expectedPages})
            </span>
            {pages.map((p) => (
              <a
                key={p.pageId}
                href={`#page-${p.pageNumber}`}
                className="border-input hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]"
                title={
                  p.questionIds.length === 0
                    ? "매핑 없음 (메모/여백)"
                    : `매핑: ${p.questionIds.length}개 문항`
                }
              >
                {p.pageNumber}
                {p.questionIds.length === 0 ? (
                  <span className="text-muted-foreground">·</span>
                ) : null}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {peerStats.submissions > 0 ? (
        <p className="text-muted-foreground mb-4 text-xs">
          동료 채점 제출 {peerStats.submissions}건이 도착했습니다 — 각 문항 카드에
          평균과 개별 피드백이 표시됩니다.
        </p>
      ) : null}

      {/* 문항별 채점 카드 */}
      <div className="space-y-5">
        {questions.map((q) => (
          <QuestionGradeCard
            key={q.questionId}
            question={q}
            answer={answersByQ[q.questionId] ?? null}
            mappedPages={pagesByQ[q.questionId] ?? []}
            attUrls={attUrls}
            submissionId={submission.submissionId}
            disabled={isFinalized}
            peerReviews={peerByQ[q.questionId] ?? []}
          />
        ))}
      </div>

      {/* 매핑 안된 페이지 (메모/여백) */}
      {pages.filter((p) => p.questionIds.length === 0).length > 0 ? (
        <div className="bg-muted/30 border-border mt-6 rounded-xl border p-4 shadow-sm">
          <p className="text-muted-foreground mb-3 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
            매핑되지 않은 페이지 (메모/여백)
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pages
              .filter((p) => p.questionIds.length === 0)
              .map((p) => (
                <PageView
                  key={p.pageId}
                  page={p}
                  url={attUrls[p.attachment.path]}
                />
              ))}
          </div>
        </div>
      ) : null}

      <Separator className="my-6" />

      {/* 채점 마무리 카드 */}
      <div className="bg-card border-border rounded-xl border p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs">현재 누적 점수</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">
              {totalGraded}
              <span className="text-muted-foreground ml-1 text-sm font-normal">
                점 / {maxTotal}점
              </span>
            </p>
          </div>
          {!isFinalized ? (
            <finalizeFetcher.Form method="post">
              <input type="hidden" name="intent" value="finalize" />
              <input
                type="hidden"
                name="submissionId"
                value={submission.submissionId}
              />
              <Button
                type="submit"
                data-testid="grade-finalize"
                disabled={!allGraded || finalizeFetcher.state !== "idle"}
                className="rounded-full bg-rose-600 text-white hover:bg-rose-700"
                onClick={(e) => {
                  if (
                    !confirm(
                      "채점을 마무리하면 학생에게 결과가 공개됩니다. 진행할까요?",
                    )
                  )
                    e.preventDefault();
                }}
              >
                <CheckCircle2Icon className="size-4" /> 채점 마무리
              </Button>
            </finalizeFetcher.Form>
          ) : (
            <finalizeFetcher.Form method="post">
              <input type="hidden" name="intent" value="reopen" />
              <input
                type="hidden"
                name="submissionId"
                value={submission.submissionId}
              />
              <Button
                type="submit"
                variant="outline"
                className="rounded-full"
                onClick={(e) => {
                  if (
                    !confirm(
                      "채점 완료를 해제하고 다시 편집 가능 상태로 되돌립니다. 학생에게 노출된 결과도 다시 가려집니다.",
                    )
                  )
                    e.preventDefault();
                }}
              >
                <RotateCcwIcon className="size-4" /> 채점 다시 열기
              </Button>
            </finalizeFetcher.Form>
          )}
        </div>
        {!allGraded && !isFinalized ? (
          <p className="text-muted-foreground mt-2 text-xs">
            모든 문항에 점수를 입력해야 채점을 마무리할 수 있습니다.
          </p>
        ) : null}
      </div>
    </AdminShell>
  );
}

interface AiDraftResponse {
  ok?: boolean;
  error?: string;
  draft?: {
    score: number;
    feedback: string;
    reasoning?: string;
    rubricScores?: Record<string, number>;
  };
}

/* ── 문항별 채점 카드 ──────────────────────────────────────────────────── */

function QuestionGradeCard({
  question,
  answer,
  mappedPages,
  attUrls,
  submissionId,
  disabled,
  peerReviews,
}: {
  question: GsQuestion;
  answer: GsAnswerRecord | null;
  mappedPages: GsPage[];
  attUrls: Record<string, string>;
  submissionId: string;
  disabled: boolean;
  peerReviews: { score: number | null; feedbackMd: string | null }[];
}) {
  const fetcher = useFetcher<typeof action>();
  const aiFetcher = useFetcher<AiDraftResponse>();
  const useRubric = question.rubric.length > 0;
  const [score, setScore] = useState(
    answer?.score != null ? String(answer.score) : "",
  );
  const [feedback, setFeedback] = useState(answer?.feedbackMd ?? "");
  const [rubricScores, setRubricScores] = useState<Record<string, number>>(
    () => {
      const out: Record<string, number> = {};
      if (answer?.rubricScores) {
        for (const [k, v] of Object.entries(answer.rubricScores))
          out[k] = v.score;
      }
      return out;
    },
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    setScore(answer?.score != null ? String(answer.score) : "");
    setFeedback(answer?.feedbackMd ?? "");
    const out: Record<string, number> = {};
    if (answer?.rubricScores) {
      for (const [k, v] of Object.entries(answer.rubricScores))
        out[k] = v.score;
    }
    setRubricScores(out);
  }, [answer?.answerId, answer?.score, answer?.feedbackMd]);

  // rubric 모드면 항목 점수 합을 점수 필드에 자동 반영.
  const rubricSum = useRubric
    ? question.rubric.reduce((s, c) => s + (rubricScores[c.criterionId] ?? 0), 0)
    : 0;
  useEffect(() => {
    if (useRubric) setScore(String(rubricSum));
  }, [useRubric, rubricSum]);

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setSavedAt(Date.now());
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (aiFetcher.state !== "idle") return;
    const d = aiFetcher.data;
    if (!d) return;
    if (d.error) {
      setAiError(d.error);
      return;
    }
    if (d.ok && d.draft) {
      setScore(String(d.draft.score));
      setFeedback(d.draft.feedback);
      setAiReasoning(d.draft.reasoning ?? null);
      setAiError(null);
      if (useRubric && d.draft.rubricScores) {
        setRubricScores(d.draft.rubricScores);
      }
    }
  }, [aiFetcher.state, aiFetcher.data]);

  const requestAiDraft = () => {
    setAiError(null);
    setAiReasoning(null);
    const fd = new FormData();
    fd.set("submissionId", submissionId);
    fd.set("questionId", question.questionId);
    aiFetcher.submit(fd, {
      method: "post",
      action: "/api/gs/ai-draft",
    });
  };
  const aiBusy = aiFetcher.state !== "idle";
  const hasOcrText = mappedPages.some(
    (p) => p.attachment.ocrText && p.attachment.ocrText.trim().length > 0,
  );

  // 동료 채점 통계.
  const scoredPeer = peerReviews.filter((p) => p.score != null);
  const peerAvg =
    scoredPeer.length > 0
      ? scoredPeer.reduce((s, p) => s + (p.score ?? 0), 0) / scoredPeer.length
      : null;
  const peerMin =
    scoredPeer.length > 0
      ? Math.min(...scoredPeer.map((p) => p.score ?? 0))
      : null;
  const peerMax =
    scoredPeer.length > 0
      ? Math.max(...scoredPeer.map((p) => p.score ?? 0))
      : null;
  const peerStdev =
    scoredPeer.length >= 2
      ? Math.sqrt(
          scoredPeer.reduce(
            (s, p) => s + Math.pow((p.score ?? 0) - (peerAvg ?? 0), 2),
            0,
          ) / scoredPeer.length,
        )
      : null;

  const rubricDirty = useRubric
    ? question.rubric.some(
        (c) =>
          (rubricScores[c.criterionId] ?? 0) !==
          (answer?.rubricScores?.[c.criterionId]?.score ?? 0),
      )
    : false;
  const isDirty =
    String(answer?.score ?? "") !== score ||
    (answer?.feedbackMd ?? "") !== feedback ||
    rubricDirty;

  const submit = () => {
    const fd = new FormData();
    fd.set("intent", "grade-answer");
    fd.set("submissionId", submissionId);
    fd.set("questionId", question.questionId);
    fd.set("score", score);
    fd.set("feedbackMd", feedback);
    if (useRubric) {
      const payload: Record<string, { score: number }> = {};
      for (const c of question.rubric) {
        payload[c.criterionId] = { score: rubricScores[c.criterionId] ?? 0 };
      }
      fd.set("rubricScores", JSON.stringify(payload));
    }
    fetcher.submit(fd, { method: "post" });
  };

  const savedStatus = savedAt && !isDirty
    ? "저장됨"
    : isDirty
      ? "수정 중"
      : answer?.score == null
        ? "미채점"
        : "저장됨";

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
      {/* 카드 헤더 */}
      <div className="border-border/60 flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <span className="border-border bg-muted inline-flex h-[22px] items-center rounded-full border px-2 text-[11px] font-semibold tabular-nums">
          #{question.orderIndex + 1}
        </span>
        {question.title ? (
          <h2 className="font-semibold">{question.title}</h2>
        ) : null}
        <span className="text-muted-foreground text-[11px]">
          매핑 페이지{" "}
          {mappedPages.length === 0
            ? "없음"
            : mappedPages.map((p) => p.pageNumber).join(", ")}
        </span>
        <span className="bg-muted ml-auto inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-semibold">
          {question.maxScore}점 만점
        </span>
      </div>

      <div className="p-5">
        <div className="grid gap-5 lg:grid-cols-2">
          {/* 좌: 문제 + 모범답안 */}
          <div className="space-y-3">
            <div>
              <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] uppercase">
                문제
              </p>
              <div className="bg-muted/30 rounded-lg border p-3">
                <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
                  {question.bodyMd}
                </p>
              </div>
            </div>
            {question.modelAnswerMd ? (
              <div>
                <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] uppercase">
                  모범답안 / 채점 기준
                </p>
                <div className="bg-emerald-50/60 border-emerald-200/60 dark:bg-emerald-950/20 dark:border-emerald-700/40 rounded-lg border p-3">
                  <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
                    {question.modelAnswerMd}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* 우: 학생 답안(매핑 페이지) + 점수/피드백 */}
          <div className="space-y-3">
            {/* 학생 답안 페이지 */}
            <div>
              <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] uppercase">
                학생 답안 — 매핑된 페이지
              </p>
              {mappedPages.length === 0 ? (
                <p className="text-muted-foreground text-sm italic">
                  매핑된 페이지 없음
                </p>
              ) : (
                <div className="space-y-2">
                  {mappedPages.map((p) => (
                    <PageView
                      key={p.pageId}
                      page={p}
                      url={attUrls[p.attachment.path]}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* OCR 텍스트 */}
            {hasOcrText ? (
              <div>
                <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] uppercase">
                  OCR 인식 텍스트 (참고)
                </p>
                <div className="bg-background max-h-60 overflow-auto rounded-lg border p-3">
                  {mappedPages.map((p, i) =>
                    p.attachment.ocrText ? (
                      <div key={p.pageId} className="space-y-1 text-xs">
                        {i > 0 ? <Separator className="my-2" /> : null}
                        <p className="text-muted-foreground text-[10px]">
                          페이지 {p.pageNumber} · {p.attachment.fileName}
                        </p>
                        <p className="whitespace-pre-line font-mono leading-snug">
                          {p.attachment.ocrText}
                        </p>
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            ) : null}

            {/* 동료 채점 */}
            {peerReviews.length > 0 ? (
              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.06em] uppercase">
                    동료 채점 · {peerReviews.length}건
                  </p>
                  {peerAvg != null ? (
                    <span
                      className={cn(
                        "text-[11px] font-semibold tabular-nums",
                        peerStdev != null && peerStdev >= question.maxScore * 0.15
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-foreground",
                      )}
                      title={peerStdev != null ? `표준편차 ${peerStdev.toFixed(1)}` : undefined}
                    >
                      평균 {peerAvg.toFixed(1)} / {question.maxScore}점
                      {peerMin != null && peerMax != null
                        ? ` (범위 ${peerMin}~${peerMax})`
                        : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-[11px]">
                      점수 미입력 채점만 도착
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      peerAvg != null &&
                      setScore(String(Math.round(peerAvg * 2) / 2))
                    }
                    disabled={disabled || peerAvg == null}
                    className="ml-auto h-6 px-2 text-[11px]"
                    title="동료 채점 평균을 점수 필드에 채워 넣음 (운영자가 검토 후 조정)"
                  >
                    평균 적용
                  </Button>
                </div>
                <div className="bg-amber-50/40 border-amber-200/60 dark:bg-amber-950/15 dark:border-amber-700/30 max-h-72 overflow-auto rounded-lg border p-2">
                  <ul className="space-y-2">
                    {peerReviews.map((p, i) => (
                      <li key={i} className="bg-background rounded-lg border p-2">
                        <div className="mb-1 flex items-center gap-1.5 text-[11px]">
                          <span className="text-muted-foreground">동료 {i + 1}</span>
                          {p.score != null ? (
                            <span className="font-semibold tabular-nums">
                              {p.score} / {question.maxScore}점
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">점수 미입력</span>
                          )}
                        </div>
                        {p.feedbackMd ? (
                          <p className="text-muted-foreground whitespace-pre-line text-[11px] leading-snug">
                            {p.feedbackMd}
                          </p>
                        ) : (
                          <p className="text-muted-foreground text-[11px] italic">피드백 없음</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {/* 점수 + rubric + 피드백 입력 */}
            <div className="border-border rounded-lg border p-4">
              {/* rubric 항목 */}
              {useRubric ? (
                <div className="bg-muted/30 mb-3 rounded-lg p-3">
                  <p className="text-muted-foreground mb-2 font-mono text-[11px] font-semibold tracking-[0.06em] uppercase">
                    채점 항목
                  </p>
                  <div className="space-y-2">
                    {question.rubric.map((c, idx) => (
                      <div key={c.criterionId} className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground w-5 tabular-nums">
                          {idx + 1}
                        </span>
                        <span className="flex-1">{c.label}</span>
                        <input
                          type="number"
                          data-testid={`grade-rubric-${question.orderIndex + 1}-${idx + 1}`}
                          min={0}
                          max={c.maxPoints}
                          step="0.5"
                          value={rubricScores[c.criterionId] ?? ""}
                          disabled={disabled}
                          onChange={(e) =>
                            setRubricScores((m) => ({
                              ...m,
                              [c.criterionId]: Number(e.target.value) || 0,
                            }))
                          }
                          className="border-input bg-background h-7 w-16 rounded-md border px-2 text-xs tabular-nums"
                        />
                        <span className="text-muted-foreground w-12 text-right tabular-nums">
                          / {c.maxPoints}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 점수 행 */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Field
                  label={useRubric ? "총점 (자동)" : "점수"}
                  htmlFor={`score-${question.questionId}`}
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      id={`score-${question.questionId}`}
                      type="number"
                      data-testid={`grade-score-${question.orderIndex + 1}`}
                      min={0}
                      max={question.maxScore}
                      step="0.5"
                      value={score}
                      disabled={disabled || useRubric}
                      readOnly={useRubric}
                      onChange={(e) => setScore(e.target.value)}
                      className={cn(
                        "border-input bg-background h-8 w-20 rounded-md border px-2 text-sm tabular-nums",
                        useRubric && "bg-muted/40",
                      )}
                    />
                    <span className="text-muted-foreground text-xs">/ {question.maxScore}</span>
                  </div>
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={requestAiDraft}
                  disabled={disabled || aiBusy || !hasOcrText}
                  className="ml-auto h-8 rounded-full"
                  title={
                    !hasOcrText
                      ? "AI 초안 생성에는 OCR 추출 텍스트가 필요합니다."
                      : "Claude 가 점수와 피드백 초안을 생성합니다 (저장은 직접)"
                  }
                >
                  <SparklesIcon className="size-3.5" />
                  {aiBusy ? "생성 중…" : "AI 초안"}
                </Button>
                <span className="text-muted-foreground text-[11px]">
                  {savedStatus}
                </span>
              </div>

              {aiError ? (
                <p className="text-rose-600 mb-2 text-[11px]">{aiError}</p>
              ) : null}
              {aiReasoning ? (
                <div className="bg-muted/30 mb-2 rounded-lg border p-2 text-[11px]">
                  <p className="text-muted-foreground mb-0.5 font-semibold">
                    AI 채점 근거 (참고)
                  </p>
                  <p className="text-muted-foreground whitespace-pre-line leading-snug">
                    {aiReasoning}
                  </p>
                </div>
              ) : null}

              <Field label="피드백" htmlFor={`feedback-${question.questionId}`}>
                <Textarea
                  id={`feedback-${question.questionId}`}
                  value={feedback}
                  disabled={disabled}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                  placeholder="피드백 (마크다운). 학생에게 채점 완료 후 노출됩니다."
                  className="text-sm"
                />
              </Field>

              <div className="mt-3 flex items-center justify-end">
                <Button
                  type="button"
                  data-testid={`grade-save-${question.orderIndex + 1}`}
                  size="sm"
                  onClick={submit}
                  disabled={disabled || !isDirty || fetcher.state !== "idle"}
                  className="rounded-full"
                >
                  <SaveIcon className="size-3.5" /> 저장
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── PageView ──────────────────────────────────────────────────────────── */

function PageView({
  page,
  url,
}: {
  page: GsPage;
  url: string | undefined;
}) {
  const isImage = page.attachment.mime.startsWith("image/");
  return (
    <div id={`page-${page.pageNumber}`} className="bg-muted/20 rounded-lg border p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="border-border inline-flex h-[20px] items-center rounded-full border px-2 text-[11px] tabular-nums">
          페이지 {page.pageNumber}
        </span>
        <FileTextIcon className="text-muted-foreground size-3.5" />
        <span className="flex-1 truncate font-medium">
          {page.attachment.fileName}
        </span>
        {page.attachment.ocrLevel ? (
          <span
            className={cn(
              "inline-flex h-[20px] items-center rounded-full px-2 text-[11px] font-semibold",
              page.attachment.ocrLevel === "good"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : page.attachment.ocrLevel === "warn"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400",
            )}
          >
            판독{" "}
            {page.attachment.ocrLevel === "good"
              ? "양호"
              : page.attachment.ocrLevel === "warn"
                ? "주의"
                : "부족"}
          </span>
        ) : null}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-0.5 hover:underline"
          >
            <EyeIcon className="size-3" /> 풀사이즈
          </a>
        ) : null}
      </div>
      {isImage && url ? (
        <img
          src={url}
          alt={page.attachment.fileName}
          loading="lazy"
          className="bg-background mt-2 max-h-[600px] w-full rounded border object-contain"
        />
      ) : !isImage && url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="bg-background hover:bg-muted mt-2 block rounded border p-3 text-center text-xs"
        >
          PDF 풀사이즈 열기
        </a>
      ) : null}
    </div>
  );
}

/* ── util ──────────────────────────────────────────────────────────────── */

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

