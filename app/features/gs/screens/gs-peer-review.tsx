// 학생 동료 채점 화면 — 익명 답안에 점수/피드백 작성.
// 답안 작성자 식별자(이름/userId) 는 노출 금지. 첨부는 /api/gs/peer 의 GET 으로 signed URL 발급.

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  EyeIcon,
  FileTextIcon,
  SaveIcon,
  SendIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
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
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <Link
          to="/gs"
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 온라인 GS
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
              동료 채점
            </p>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              {round.title}
            </h1>
            <p className="text-muted-foreground text-xs mt-1">
              {LAW_SUBJECTS[round.subject]?.name ?? round.subject}
            </p>
          </div>
          {isSubmitted ? (
            <Badge className="bg-emerald-600 text-white">
              <CheckCircle2Icon className="size-3" /> 채점 제출 완료
            </Badge>
          ) : (
            <Badge variant="outline">진행 중</Badge>
          )}
        </div>
        <Card className="bg-amber-50/40 border-amber-300/60 dark:border-amber-700/40 dark:bg-amber-950/20">
          <CardContent className="text-amber-900 dark:text-amber-200 pt-4 text-xs leading-relaxed">
            <strong>익명 동료 채점입니다.</strong> 답안 작성자 정보는 노출되지
            않습니다. 모범답안과 본인의 학습 경험을 바탕으로 공정하게 채점해
            주세요. 점수와 피드백을 모두 입력하고 마지막에{" "}
            <strong>"채점 제출"</strong> 버튼을 눌러야 마무리됩니다. 제출 전까지는
            언제든 수정 가능합니다.
          </CardContent>
        </Card>
      </header>

      <div className="space-y-4">
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

      <Separator className="my-6" />

      <Card>
        <CardContent className="space-y-3 pt-6">
          {isSubmitted ? (
            <p className="text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
              ✓ 채점 제출이 완료되었습니다. 감사합니다.
            </p>
          ) : allScored ? (
            <>
              <p className="text-muted-foreground text-xs">
                채점 제출 후에는 수정할 수 없습니다.
              </p>
              {submitFetcher.data?.error ? (
                <p className="text-rose-600 text-xs">
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
                  className="w-full"
                >
                  <SendIcon className="size-4" />
                  {submitFetcher.state !== "idle" ? "제출 중..." : "채점 제출"}
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
    </div>
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            #{question.orderIndex + 1}
          </Badge>
          {question.title ? (
            <h2 className="font-semibold">{question.title}</h2>
          ) : null}
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {question.maxScore}점 만점
          </Badge>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4 pt-4">
        <section>
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
            문제
          </p>
          <div className="bg-muted/30 rounded-md border p-3">
            <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
              {question.bodyMd}
            </p>
          </div>
        </section>

        {question.modelAnswerMd ? (
          <section>
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
              모범답안 / 채점 기준
            </p>
            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-700/40 rounded-md border p-3">
              <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
                {question.modelAnswerMd}
              </p>
            </div>
          </section>
        ) : null}

        <section>
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
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
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
              OCR 인식 텍스트 (참고)
            </p>
            <div className="bg-background max-h-60 overflow-auto rounded-md border p-3">
              <p className="text-xs whitespace-pre-line font-mono leading-snug">
                {ocrText}
              </p>
            </div>
          </section>
        ) : null}

        <section className="rounded-md border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="text-xs">
              <span className="text-muted-foreground mr-1">점수</span>
              <input
                type="number"
                min={0}
                max={question.maxScore}
                step="0.5"
                value={score}
                disabled={disabled}
                onChange={(e) => setScore(e.target.value)}
                className="border-input bg-background h-8 w-20 rounded-md border px-2 text-sm tabular-nums"
              />
              <span className="text-muted-foreground ml-1 text-xs">
                / {question.maxScore}
              </span>
            </label>
            <span className="text-muted-foreground ml-auto text-[11px]">
              {savedAt && !isDirty
                ? "저장됨"
                : isDirty
                  ? "수정 중"
                  : myAnswer?.score == null
                    ? "미작성"
                    : "저장됨"}
            </span>
          </div>
          <Textarea
            value={feedback}
            disabled={disabled}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            placeholder="피드백 (마크다운). 답안 작성자에게 익명으로 전달됩니다."
          />
          <div className="mt-2 flex items-center justify-end">
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={disabled || !isDirty || fetcher.state !== "idle"}
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
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="text-[10px]">
          페이지 {page.pageNumber}
        </Badge>
        <FileTextIcon className="text-muted-foreground size-3.5" />
        <span className="flex-1 truncate font-medium">
          {/* 파일명에 작성자 정보가 들어있을 수 있어 익명 라벨로 대체 */}
          답안 파일 ({page.attachment.mime.split("/")[1]?.toUpperCase() ?? "FILE"})
        </span>
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-0.5 hover:underline"
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
            "mt-2 max-h-[480px] w-full rounded border object-contain bg-background",
          )}
        />
      ) : !isImage && signedUrl ? (
        <a
          href={signedUrl}
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
