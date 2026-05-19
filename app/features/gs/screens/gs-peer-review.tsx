// 학생 동료 채점 화면 — 익명 답안에 점수/피드백 작성.
// 답안 작성자 식별자(이름/userId) 는 노출 금지. 첨부는 /api/gs/peer 의 GET 으로 signed URL 발급.

import {
  CheckCircle2Icon,
  EyeIcon,
  FileTextIcon,
  SaveIcon,
  SendIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import { Chip, Section } from "~/features/community/components/community-ui";
import {
  type GsPage,
  type GsQuestion,
  getGsRound,
  listGsQuestions,
} from "~/features/gs/queries.server";
import {
  type PeerReviewAnswer,
  getPeerReviewDetail,
} from "~/features/gs/queries-peer.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/gs-peer-review";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 동료 채점 | Lidam Patent Attorney Academy`
      : "동료 채점 | Lidam Patent Attorney Academy",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const assignmentId = params.assignmentId;
  if (!assignmentId) throw data("Missing assignmentId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const detail = await getPeerReviewDetail(client, assignmentId);
  if (!detail) throw data("Assignment not found", { status: 404 });
  if (detail.assignment.reviewerUserId !== user.id) {
    throw data("Forbidden", { status: 403 });
  }

  const round = await getGsRound(client, detail.assignment.roundId);
  if (!round) throw data("Round not found", { status: 404 });
  const questions = await listGsQuestions(client, round.roundId);

  // Map 직렬화 — JSON serializable 객체로.
  const pagesByQuestion: Record<string, GsPage[]> = {};
  detail.pagesByQuestion.forEach((v, k) => {
    pagesByQuestion[k] = v;
  });
  const ocrTextByQuestion: Record<string, string> = {};
  detail.ocrTextByQuestion.forEach((v, k) => {
    ocrTextByQuestion[k] = v;
  });
  const myAnswers: Record<string, PeerReviewAnswer> = {};
  detail.myAnswers.forEach((v, k) => {
    myAnswers[k] = v;
  });

  return {
    round,
    questions,
    assignment: detail.assignment,
    pagesByQuestion,
    ocrTextByQuestion,
    myAnswers,
  };
}

export default function GsPeerReview({ loaderData }: Route.ComponentProps) {
  const {
    round,
    questions,
    assignment,
    pagesByQuestion,
    ocrTextByQuestion,
    myAnswers,
  } = loaderData;
  const submitFetcher = useFetcher<{ ok?: true; error?: string }>();
  const isSubmitted = assignment.submittedAt != null;

  const allScored = questions.every(
    (q) => myAnswers[q.questionId]?.score != null,
  );

  return (
    <MockExamShell
      category="gs"
      width="narrow"
      backLink={{ to: "/gs", label: "온라인 GS" }}
      title={`동료 채점 · ${round.title}`}
      desc="익명 답안을 문항별로 채점합니다. 점수와 피드백을 모두 입력한 뒤 제출하세요."
      headerRight={
        isSubmitted ? (
          <Chip tone="emerald">
            <CheckCircle2Icon className="size-3" /> 채점 제출 완료
          </Chip>
        ) : (
          <Chip tone="outline">진행 중</Chip>
        )
      }
    >
      <Card className="border-transparent bg-amber-500/[0.12] dark:bg-amber-500/[0.1]">
        <CardContent className="flex items-center gap-3 py-4">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-amber-500 text-white">
            <ShieldCheckIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold tracking-tight text-amber-700 dark:text-amber-400">
              익명 답안입니다 · {LAW_SUBJECTS[round.subject]?.name ?? round.subject}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              작성자를 알 수 없습니다. 본인의 채점도 작성자에게 익명으로
              전달됩니다. 점수와 피드백을 모두 입력하고 마지막에{" "}
              <strong className="text-foreground">채점 제출</strong> 버튼을 눌러야
              마무리됩니다. 제출 전까지는 언제든 수정 가능합니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 space-y-3.5">
        {questions.map((q) => (
          <PeerQuestionCard
            key={q.questionId}
            question={q}
            mappedPages={pagesByQuestion[q.questionId] ?? []}
            ocrText={ocrTextByQuestion[q.questionId] ?? ""}
            myAnswer={myAnswers[q.questionId] ?? null}
            assignmentId={assignment.assignmentId}
            disabled={isSubmitted}
          />
        ))}
      </div>

      <Section eyebrow="채점 제출">
        <Card>
          <CardContent className="space-y-3 py-5">
            {isSubmitted ? (
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2Icon className="size-4" /> 채점 제출이
                완료되었습니다. 감사합니다.
              </p>
            ) : allScored ? (
              <>
                <p className="text-muted-foreground text-xs">
                  채점 제출 후에는 수정할 수 없습니다.
                </p>
                {submitFetcher.data?.error ? (
                  <p className="text-xs text-rose-600 dark:text-rose-400">
                    {submitFetcher.data.error}
                  </p>
                ) : null}
                <submitFetcher.Form
                  method="post"
                  action="/api/gs/peer"
                  onSubmit={(e) => {
                    if (!confirm("채점을 제출합니다. 진행할까요?"))
                      e.preventDefault();
                  }}
                >
                  <input type="hidden" name="intent" value="submit" />
                  <input
                    type="hidden"
                    name="assignmentId"
                    value={assignment.assignmentId}
                  />
                  <Button
                    type="submit"
                    disabled={submitFetcher.state !== "idle"}
                    className="w-full rounded-full"
                  >
                    <SendIcon className="size-4" />
                    {submitFetcher.state !== "idle"
                      ? "제출 중..."
                      : "채점 제출"}
                  </Button>
                </submitFetcher.Form>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                모든 문항에 점수를 입력해야 채점을 제출할 수 있습니다.
              </p>
            )}
          </CardContent>
        </Card>
      </Section>
    </MockExamShell>
  );
}

function PeerQuestionCard({
  question,
  mappedPages,
  ocrText,
  myAnswer,
  assignmentId,
  disabled,
}: {
  question: GsQuestion;
  mappedPages: GsPage[];
  ocrText: string;
  myAnswer: PeerReviewAnswer | null;
  assignmentId: string;
  disabled: boolean;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const [score, setScore] = useState(
    myAnswer?.score != null ? String(myAnswer.score) : "",
  );
  const [feedback, setFeedback] = useState(myAnswer?.feedbackMd ?? "");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setScore(myAnswer?.score != null ? String(myAnswer.score) : "");
    setFeedback(myAnswer?.feedbackMd ?? "");
  }, [myAnswer?.reviewAnswerId, myAnswer?.score, myAnswer?.feedbackMd]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setSavedAt(Date.now());
    }
  }, [fetcher.state, fetcher.data]);

  const isDirty =
    String(myAnswer?.score ?? "") !== score ||
    (myAnswer?.feedbackMd ?? "") !== feedback;

  const submit = () => {
    const fd = new FormData();
    fd.set("intent", "save");
    fd.set("assignmentId", assignmentId);
    fd.set("questionId", question.questionId);
    fd.set("score", score);
    fd.set("feedbackMd", feedback);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/gs/peer",
    });
  };

  const scoreStatus =
    savedAt && !isDirty
      ? "저장됨"
      : isDirty
        ? "수정 중"
        : myAnswer?.score == null
          ? "미작성"
          : "저장됨";

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="primary">문 {question.orderIndex + 1}</Chip>
          {question.title ? (
            <h2 className="text-base font-bold tracking-tight">
              {question.title}
            </h2>
          ) : null}
          <span className="text-primary ml-auto text-lg font-extrabold tabular-nums">
            {score === "" ? "—" : score}
            <span className="text-muted-foreground text-xs font-semibold">
              {" "}
              / {question.maxScore}
            </span>
          </span>
        </div>

        <section>
          <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            문제
          </p>
          <div className="bg-muted/50 rounded-xl border p-3.5">
            <p className="text-foreground/85 text-sm leading-relaxed whitespace-pre-line">
              {question.bodyMd}
            </p>
          </div>
        </section>

        {question.modelAnswerMd ? (
          <section>
            <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              모범답안 / 채점 기준
            </p>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3.5">
              <p className="text-foreground/85 text-sm leading-relaxed whitespace-pre-line">
                {question.modelAnswerMd}
              </p>
            </div>
          </section>
        ) : null}

        <section>
          <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            동료의 답안 — 매핑된 페이지 (익명)
          </p>
          {mappedPages.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">제출 없음</p>
          ) : (
            <div className="space-y-2">
              {mappedPages.map((p) => (
                <PeerPageView
                  key={p.pageId}
                  page={p}
                  assignmentId={assignmentId}
                />
              ))}
            </div>
          )}
        </section>

        {ocrText ? (
          <section>
            <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              판독 텍스트 (참고)
            </p>
            <div className="bg-muted/50 max-h-60 overflow-auto rounded-xl border p-3.5">
              <p className="text-foreground/80 font-mono text-xs leading-relaxed whitespace-pre-line">
                {ocrText}
              </p>
            </div>
          </section>
        ) : null}

        <section className="bg-muted/40 rounded-xl border p-3.5">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                점수
              </span>
              <input
                type="number"
                min={0}
                max={question.maxScore}
                step="0.5"
                value={score}
                disabled={disabled}
                onChange={(e) => setScore(e.target.value)}
                className="border-input bg-background focus-visible:ring-ring h-8 w-20 rounded-lg border px-2 text-sm tabular-nums focus-visible:ring-2 focus-visible:outline-none"
              />
              <span className="text-muted-foreground text-xs">
                / {question.maxScore}
              </span>
            </label>
            <Chip
              tone={
                scoreStatus === "저장됨"
                  ? "emerald"
                  : scoreStatus === "수정 중"
                    ? "amber"
                    : "neutral"
              }
              className="ml-auto"
            >
              {scoreStatus}
            </Chip>
          </div>
          <Textarea
            value={feedback}
            disabled={disabled}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            placeholder="채점 사유와 보강이 필요한 부분을 적어 주세요. 답안 작성자에게 익명으로 전달됩니다."
          />
          <div className="mt-2 flex items-center justify-end">
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={disabled || !isDirty || fetcher.state !== "idle"}
              className="rounded-full"
            >
              <SaveIcon className="size-3.5" /> 저장
            </Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function PeerPageView({
  page,
  assignmentId,
}: {
  page: GsPage;
  assignmentId: string;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const isImage = page.attachment.mime.startsWith("image/");

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/gs/peer?assignmentId=${encodeURIComponent(assignmentId)}&path=${encodeURIComponent(page.attachment.path)}`,
    )
      .then((r) => r.json())
      .then((j: { url?: string }) => {
        if (!cancelled) setSignedUrl(j.url ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [assignmentId, page.attachment.path]);

  return (
    <div className="bg-muted/40 rounded-xl border p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip tone="outline">페이지 {page.pageNumber}</Chip>
        <FileTextIcon className="text-muted-foreground size-3.5" />
        <span className="flex-1 truncate font-medium">
          {/* 파일명에 작성자 정보가 들어있을 수 있어 익명 라벨로 대체 */}
          답안 파일 (
          {page.attachment.mime.split("/")[1]?.toUpperCase() ?? "FILE"})
        </span>
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-0.5 font-semibold hover:underline"
          >
            <EyeIcon className="size-3" /> 풀사이즈
          </a>
        ) : null}
      </div>
      {isImage && signedUrl ? (
        <img
          src={signedUrl}
          alt={`페이지 ${page.pageNumber}`}
          loading="lazy"
          className={cn(
            "bg-background mt-2 max-h-[480px] w-full rounded-lg border object-contain",
          )}
        />
      ) : !isImage && signedUrl ? (
        <a
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="bg-background hover:bg-muted mt-2 block rounded-lg border p-3 text-center text-xs font-medium"
        >
          PDF 풀사이즈 열기
        </a>
      ) : null}
    </div>
  );
}
