// 학생 GS 결과 — 채점 완료된 회차에 한해 본인 답안 + 점수 + 피드백 + 모범답안 표시.
// 제출 후 채점 전이면 "채점 대기" 표기 (모범답안/피드백/점수는 가림).
//
// 답안지 모델: submission 단위 N페이지 슬롯 + 페이지 ↔ 문항 매핑.
// 상단 답안지 페이지 갤러리(전체 N페이지) + 하단 문항별 카드(점수/피드백 + 매핑 페이지 번호 링크).
// 커뮤니티 셸 reskin — 키트 lidam-community/GsResultScreen 디자인.

import {
  AwardIcon,
  CheckCircle2Icon,
  ClockIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  PencilLineIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import { Bar, Chip, Section } from "~/features/community/components/community-ui";
import {
  type GsAnswerRecord,
  type GsPage,
  type GsQuestion,
  getAttachmentSignedUrl,
  getGsPaperSignedUrl,
  getGsRound,
  getOwnSubmission,
  listAnswersForSubmission,
  listGsQuestions,
  listSubmissionPages,
} from "~/features/gs/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/gs-result";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 결과 | 리담변리사학원`
      : "GS 결과 | 리담변리사학원",
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
    return { state: "in-progress" as const, round, submission };
  }

  const [questions, answers, pages] = await Promise.all([
    listGsQuestions(client, roundId),
    listAnswersForSubmission(client, submission.submissionId),
    listSubmissionPages(client, submission.submissionId),
  ]);

  // 페이지 첨부 signed url prefetch.
  const attUrls: Record<string, string> = {};
  for (const p of pages) {
    const url = await getAttachmentSignedUrl(client, p.attachment.path, 1200);
    if (url) attUrls[p.attachment.path] = url;
  }

  const isGraded = submission.gradedAt != null;
  const answerKeyUrl =
    isGraded && round.answerKeyPdfPath
      ? await getGsPaperSignedUrl(client, round.answerKeyPdfPath)
      : null;

  return {
    state: isGraded ? ("graded" as const) : ("submitted" as const),
    round,
    submission,
    questions,
    answers,
    pages,
    attUrls,
    answerKeyUrl,
  };
}

export default function GsResult({ loaderData }: Route.ComponentProps) {
  if (loaderData.state === "in-progress") {
    return (
      <MockExamShell
        category="gs"
        title="GS 결과"
        desc="응시 단계에 따라 점수·피드백·모범답안이 차례로 공개됩니다."
        backLink={{ to: "/gs", label: "온라인 GS" }}
      >
        <StatePanel
          icon={PencilLineIcon}
          tone="primary"
          title="아직 응시 중입니다"
          body="답안을 모두 제출하면 채점 대기 상태로 전환됩니다."
          cta={
            <Button asChild size="sm" className="rounded-full">
              <Link to={`/gs/${loaderData.round.roundId}/take`}>
                응시 화면으로
              </Link>
            </Button>
          }
        />
      </MockExamShell>
    );
  }

  const {
    state,
    round,
    submission,
    questions,
    answers,
    pages,
    attUrls,
    answerKeyUrl,
  } = loaderData;
  const answerByQ = new Map(answers.map((a) => [a.questionId, a]));
  const isGraded = state === "graded";
  const maxTotal = questions.reduce((s, q) => s + q.maxScore, 0);

  // 문항 → 매핑된 페이지 번호들. (loader 데이터는 매 navigate 마다만 바뀌므로 useMemo 불필요)
  const pagesByQuestion = new Map<string, number[]>();
  for (const p of pages) {
    for (const qid of p.questionIds) {
      const arr = pagesByQuestion.get(qid) ?? [];
      arr.push(p.pageNumber);
      pagesByQuestion.set(qid, arr);
    }
  }
  for (const arr of pagesByQuestion.values()) arr.sort((a, b) => a - b);

  return (
    <MockExamShell
      category="gs"
      title={`${round.title} 결과`}
      desc={
        <>
          {LAW_SUBJECTS[round.subject]?.name ?? round.subject} · 제출{" "}
          {formatDateTime(submission.submittedAt)}
        </>
      }
      backLink={{ to: "/gs", label: "온라인 GS" }}
    >
      {isGraded ? (
        <div className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center">
          <span className="bg-primary/10 text-link inline-flex size-14 shrink-0 items-center justify-center rounded-2xl">
            <AwardIcon className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              총점
            </p>
            <p
              data-testid="result-total-score"
              className="text-foreground text-4xl font-extrabold tracking-tight tabular-nums"
            >
              {submission.totalScore ?? 0}
              <span className="text-muted-foreground ml-1 text-lg font-semibold">
                / {maxTotal}점
              </span>
            </p>
            <p className="text-emerald-700 dark:text-emerald-400 mt-1 inline-flex items-center gap-1 text-xs font-semibold">
              <CheckCircle2Icon className="size-3" /> 채점 완료 ·{" "}
              {formatDateTime(submission.gradedAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="rounded-full"
            >
              <Link to={`/gs/${round.roundId}/distinguished`}>
                <AwardIcon className="size-3.5" /> 우수 답안 보기
              </Link>
            </Button>
            {answerKeyUrl ? (
              <Button asChild size="sm" variant="ghost" className="rounded-full">
                <a href={answerKeyUrl} target="_blank" rel="noreferrer">
                  <DownloadIcon className="size-3.5" /> 모범답안 PDF
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="border-amber-500/20 bg-amber-500/[0.07] flex items-start gap-3 rounded-2xl border p-4">
          <ClockIcon className="text-amber-600 dark:text-amber-400 mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-foreground font-semibold tracking-tight">
              채점 대기 중
            </p>
            <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
              강사 채점이 끝나면 점수와 피드백, 모범답안이 공개됩니다. 아래에서
              본인이 제출한 답안지(전체 페이지)를 다시 확인할 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* 답안지 페이지 갤러리 — 1..N 순서대로. */}
      <Section eyebrow={`답안지 페이지 · ${pages.length}/${round.expectedPages}`}>
        {pages.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">
            제출된 페이지가 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {pages.map((p) => (
              <ResultPageCard
                key={p.pageId}
                page={p}
                url={attUrls[p.attachment.path]}
                questions={questions}
              />
            ))}
          </div>
        )}
      </Section>

      {/* 문항별 채점 결과. */}
      <Section eyebrow="문항별 채점">
        <div className="space-y-3">
          {questions.map((q) => {
            const a = answerByQ.get(q.questionId);
            return (
              <ResultQuestionCard
                key={q.questionId}
                question={q}
                answer={a ?? null}
                mappedPages={pagesByQuestion.get(q.questionId) ?? []}
                showGrading={isGraded}
              />
            );
          })}
        </div>
      </Section>
    </MockExamShell>
  );
}

function StatePanel({
  icon: Icon,
  tone,
  title,
  body,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "amber";
  title: string;
  body: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-2.5 rounded-2xl border px-8 py-14 text-center">
      <span
        className={cn(
          "bg-background mb-1 inline-flex size-14 items-center justify-center rounded-2xl",
          tone === "primary"
            ? "text-link"
            : "text-amber-600 dark:text-amber-400",
        )}
      >
        <Icon className="size-7" />
      </span>
      <div className="text-base font-bold tracking-tight">{title}</div>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        {body}
      </p>
      {cta}
    </div>
  );
}

function ResultPageCard({
  page,
  url,
  questions,
}: {
  page: GsPage;
  url: string | undefined;
  questions: GsQuestion[];
}) {
  const isImage = page.attachment.mime.startsWith("image/");
  const mappedQ = questions.filter((q) =>
    page.questionIds.includes(q.questionId),
  );
  return (
    <div
      id={`page-${page.pageNumber}`}
      data-testid={`result-page-${page.pageNumber}`}
      className="border-border bg-card overflow-hidden rounded-2xl border"
    >
      <div className="border-border/60 flex items-center gap-2 border-b px-3 py-2">
        <span className="text-foreground text-xs font-bold">
          페이지 {page.pageNumber}
        </span>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-link ml-auto inline-flex items-center gap-0.5 text-[11px] font-semibold hover:underline"
          >
            <EyeIcon className="size-3" /> 풀사이즈
          </a>
        ) : null}
      </div>
      <div className="space-y-1.5 p-3">
        {isImage && url ? (
          <a href={url} target="_blank" rel="noreferrer" className="block">
            <img
              src={url}
              alt={page.attachment.fileName}
              loading="lazy"
              className="bg-background border-border max-h-64 w-full rounded-lg border object-contain"
            />
          </a>
        ) : !isImage && url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="bg-muted/40 hover:bg-muted/60 border-border block rounded-lg border p-3 text-center text-[11px]"
          >
            <FileTextIcon className="text-muted-foreground mx-auto mb-1 size-5" />
            PDF 풀사이즈 열기
          </a>
        ) : (
          <div className="bg-primary/[0.06] text-link flex aspect-[3/4] items-center justify-center rounded-lg">
            <FileTextIcon className="size-6" />
          </div>
        )}
        <p className="text-muted-foreground truncate text-[10px]">
          {page.attachment.fileName}
        </p>
        <div className="flex flex-wrap gap-1">
          {mappedQ.length === 0 ? (
            <span className="text-muted-foreground text-[10px] italic">
              매핑 없음 (메모/여백)
            </span>
          ) : (
            mappedQ.map((q) => (
              <Chip key={q.questionId} tone="primary">
                {q.title ?? `문 ${q.orderIndex + 1}`}
              </Chip>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ResultQuestionCard({
  question,
  answer,
  mappedPages,
  showGrading,
}: {
  question: GsQuestion;
  answer: GsAnswerRecord | null;
  mappedPages: number[];
  showGrading: boolean;
}) {
  const graded = showGrading && answer?.score != null;
  const ratio = graded ? (answer.score ?? 0) / question.maxScore : 0;
  const scoreTone = graded
    ? ratio >= 0.8
      ? "text-emerald-600 dark:text-emerald-400"
      : ratio < 0.5
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground"
    : "text-foreground";

  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="bg-muted text-foreground/80 inline-flex h-[22px] items-center rounded-full px-2 font-mono text-[11px] font-bold">
          #{question.orderIndex + 1}
        </span>
        {question.title ? (
          <h3 className="text-foreground font-semibold tracking-tight">
            {question.title}
          </h3>
        ) : null}
        {graded ? (
          <span className="ml-auto tabular-nums">
            <span className={cn("text-2xl font-extrabold", scoreTone)}>
              {answer.score}
            </span>
            <span className="text-muted-foreground text-xs font-semibold">
              {" "}
              / {question.maxScore}
            </span>
          </span>
        ) : (
          <Chip tone="neutral" className="ml-auto">
            {question.maxScore}점 만점
          </Chip>
        )}
      </div>

      {/* 문제 */}
      <div className="bg-muted/40 border-border mt-3 rounded-xl border p-3">
        <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
          {question.bodyMd}
        </p>
      </div>

      {/* rubric 채점 기준 — 채점 완료 + rubric 점수 있을 때만 */}
      {graded && question.rubric.length > 0 ? (
        <div className="mt-3">
          <p className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            채점 기준
          </p>
          <ul className="space-y-2">
            {question.rubric.map((c) => {
              const rs = answer.rubricScores[c.criterionId];
              const got = rs?.score ?? 0;
              return (
                <li key={c.criterionId} className="flex items-center gap-3">
                  <span className="text-foreground min-w-0 flex-1 truncate text-[13px]">
                    {c.label}
                  </span>
                  <Bar value={got} max={c.maxPoints} className="w-24" />
                  <span className="text-foreground min-w-[3rem] text-right font-mono text-xs font-bold tabular-nums">
                    {got}/{c.maxPoints}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* 매핑된 답안 페이지 */}
      <div className="mt-3">
        <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          매핑된 답안 페이지
        </p>
        {mappedPages.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">
            매핑된 페이지가 없습니다.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {mappedPages.map((n) => (
              <a
                key={n}
                href={`#page-${n}`}
                className="border-border hover:bg-muted inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
              >
                페이지 {n}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* 강사 피드백 */}
      {showGrading && answer?.feedbackMd ? (
        <div className="mt-3">
          <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            피드백
          </p>
          <div className="bg-primary/[0.06] border-primary rounded-xl border-l-[3px] p-3">
            <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
              {answer.feedbackMd}
            </p>
          </div>
        </div>
      ) : null}

      {/* 모범답안 / 채점 기준 */}
      {showGrading && question.modelAnswerMd ? (
        <div className="mt-3">
          <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            모범답안 / 채점 기준
          </p>
          <div className="border-emerald-500/30 bg-emerald-500/[0.06] rounded-xl border p-3">
            <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
              {question.modelAnswerMd}
            </p>
          </div>
        </div>
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
