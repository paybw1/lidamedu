// 학생 GS 결과 — 채점 완료된 회차에 한해 본인 답안 + 점수 + 피드백 + 모범답안 표시.
// 제출 후 채점 전이면 "채점 대기" 표기 (모범답안/피드백/점수는 가림).

import {
  ArrowLeftIcon,
  AwardIcon,
  CheckCircle2Icon,
  ClockIcon,
  EyeIcon,
  FileTextIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getAttachmentSignedUrl,
  getGsRound,
  getOwnSubmission,
  listAnswersForSubmission,
  listGsQuestions,
  type GsAnswerRecord,
  type GsAttachment,
  type GsQuestion,
} from "~/features/gs/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/gs-result";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 결과 | Lidam Edu`
      : "GS 결과 | Lidam Edu",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const roundId = params.roundId;
  if (!roundId) throw data("Missing roundId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const round = await getGsRound(client, roundId);
  if (!round) throw data("Round not found", { status: 404 });

  const submission = await getOwnSubmission(client, user.id, roundId);
  if (!submission) {
    throw data("아직 응시하지 않은 회차입니다.", { status: 404 });
  }
  if (!submission.submittedAt) {
    // 미제출 — 응시 화면으로.
    return { state: "in-progress" as const, round, submission };
  }

  const [questions, answers] = await Promise.all([
    listGsQuestions(client, roundId),
    listAnswersForSubmission(client, submission.submissionId),
  ]);

  // 첨부 signed url prefetch (본인 첨부).
  const attUrls: Record<string, string> = {};
  for (const a of answers) {
    for (const att of a.attachments) {
      const url = await getAttachmentSignedUrl(client, att.path, 1200);
      if (url) attUrls[att.path] = url;
    }
  }

  // 동료 채점 결과는 학생에게 노출하지 않는다 — 운영자만 확인. (정책)
  const isGraded = submission.gradedAt != null;

  return {
    state: isGraded ? ("graded" as const) : ("submitted" as const),
    round,
    submission,
    questions,
    answers,
    attUrls,
  };
}

export default function GsResult({ loaderData }: Route.ComponentProps) {
  if (loaderData.state === "in-progress") {
    return (
      <div className="mx-auto w-full max-w-screen-md px-5 py-12 md:px-10">
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <ClockIcon className="text-muted-foreground mx-auto size-8" />
            <p className="text-sm">아직 응시 중입니다.</p>
            <Link
              to={`/gs/${loaderData.round.roundId}/take`}
              className="text-primary text-sm hover:underline"
            >
              응시 화면으로 →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { state, round, submission, questions, answers, attUrls } = loaderData;
  const answerByQ = new Map(answers.map((a) => [a.questionId, a]));
  const isGraded = state === "graded";

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <Link
          to="/gs"
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 온라인 GS
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              {round.title}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {LAW_SUBJECTS[round.subject]?.name ?? round.subject} · 제출{" "}
              {formatDateTime(submission.submittedAt)}
            </p>
          </div>
          {isGraded ? (
            <div className="text-right">
              <p className="text-muted-foreground text-[11px]">총점</p>
              <p className="text-3xl font-bold tabular-nums">
                {submission.totalScore ?? 0}
                <span className="text-muted-foreground ml-1 text-base font-normal">
                  / {questions.reduce((s, q) => s + q.maxScore, 0)}점
                </span>
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isGraded ? (
            <Badge className="bg-emerald-600 text-white">
              <CheckCircle2Icon className="size-3" /> 채점 완료 ·{" "}
              {formatDateTime(submission.gradedAt)}
            </Badge>
          ) : (
            <Badge variant="outline">
              <ClockIcon className="size-3" /> 채점 대기 중
            </Badge>
          )}
          {isGraded ? (
            <Link
              to={`/gs/${round.roundId}/distinguished`}
              className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
            >
              <AwardIcon className="size-3" /> 우수 답안 보기 →
            </Link>
          ) : null}
        </div>
      </header>

      {!isGraded ? (
        <Card className="bg-muted/40 mb-6">
          <CardContent className="text-muted-foreground py-4 text-sm">
            제출 완료 · 강사 채점이 끝나면 점수와 피드백, 모범답안이 공개됩니다.
            아래에서는 본인이 제출한 답안을 다시 확인할 수 있습니다.
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {questions.map((q) => {
          const a = answerByQ.get(q.questionId);
          return (
            <ResultQuestionCard
              key={q.questionId}
              question={q}
              answer={a ?? null}
              attUrls={attUrls}
              showGrading={isGraded}
            />
          );
        })}
      </div>
    </div>
  );
}

function ResultQuestionCard({
  question,
  answer,
  attUrls,
  showGrading,
}: {
  question: GsQuestion;
  answer: GsAnswerRecord | null;
  attUrls: Record<string, string>;
  showGrading: boolean;
}) {
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
          {showGrading && answer?.score != null ? (
            <Badge className="ml-auto bg-emerald-600 text-white text-[11px] tabular-nums hover:bg-emerald-600">
              {answer.score} / {question.maxScore}점
            </Badge>
          ) : (
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {question.maxScore}점 만점
            </Badge>
          )}
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

        <section>
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
            내 답안
          </p>
          {!answer || answer.attachments.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">제출 답안 없음</p>
          ) : (
            <div className="space-y-2">
              {answer.attachments.map((att) => (
                <ResultAttachment
                  key={att.path}
                  attachment={att}
                  url={attUrls[att.path]}
                />
              ))}
            </div>
          )}
        </section>

        {showGrading && answer?.feedbackMd ? (
          <section>
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
              강사 피드백
            </p>
            <div className="bg-blue-50/60 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-700/40 rounded-md border p-3">
              <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
                {answer.feedbackMd}
              </p>
            </div>
          </section>
        ) : null}

        {showGrading && question.modelAnswerMd ? (
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
      </CardContent>
    </Card>
  );
}

function ResultAttachment({
  attachment,
  url,
}: {
  attachment: GsAttachment;
  url: string | undefined;
}) {
  const isImage = attachment.mime.startsWith("image/");
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <FileTextIcon className="text-muted-foreground size-3.5" />
        <span className="flex-1 truncate font-medium">{attachment.fileName}</span>
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
          alt={attachment.fileName}
          loading="lazy"
          className={cn(
            "mt-2 max-h-[480px] w-full rounded border object-contain bg-background",
          )}
        />
      ) : null}
    </div>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
