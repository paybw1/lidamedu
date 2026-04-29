import { ArrowLeftIcon, CircleCheckIcon, CircleXIcon } from "lucide-react";
import { useState } from "react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  getProblemById,
} from "~/features/problems/queries.server";
import { QnaPanel } from "~/features/qna/components/qna-panel";
import { listThreadsForTarget } from "~/features/qna/queries.server";
import {
  EXAM_LABEL,
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/problem-viewer";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "문제 | Lidam Edu" }];
  return [
    {
      title: `${loaderData.subject.name} 객관식 #${loaderData.problem.problemNumber ?? "?"} | Lidam Edu`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) {
    throw data("Unknown subject", { status: 404 });
  }
  const lawCode = subjectParse.data;

  if (!params.problemId) {
    throw data("Missing problem id", { status: 404 });
  }

  const [client] = makeServerClient(request);
  const problem = await getProblemById(client, params.problemId);
  if (!problem) {
    throw data("Problem not found", { status: 404 });
  }

  const qnaThreads = await listThreadsForTarget(
    client,
    "problem",
    problem.problemId,
    20,
  );

  return {
    subject: LAW_SUBJECTS[lawCode],
    problem,
    qnaThreads,
  };
}

export default function ProblemViewer({ loaderData }: Route.ComponentProps) {
  const { subject, problem, qnaThreads } = loaderData;
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const correctChoice = problem.choices.find((c) => c.isCorrect);

  const submit = () => {
    if (selected === null) return;
    setRevealed(true);
  };

  const reset = () => {
    setSelected(null);
    setRevealed(false);
  };

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/subjects/${subject.slug}?tab=problems`}
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {subject.name} 문제 색인
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{EXAM_LABEL[subject.exam]}</Badge>
            <Badge variant="default">{ORIGIN_LABEL[problem.origin]}</Badge>
            <Badge variant="outline">{FORMAT_LABEL[problem.format]}</Badge>
            {problem.polarity ? (
              <Badge variant="outline">{POLARITY_LABEL[problem.polarity]}</Badge>
            ) : null}
            {problem.scope ? (
              <Badge variant="outline">{SCOPE_LABEL[problem.scope]}</Badge>
            ) : null}
            {problem.year ? (
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {problem.year}년
                {problem.examRoundNo ? ` ${problem.examRoundNo}회` : ""}
                {problem.problemNumber ? ` · 문제 ${problem.problemNumber}` : ""}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            정답률 기반 난이도는 추후 (feat-4-A-312)
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-5 pt-6">
          <p className="text-base leading-relaxed font-medium">
            {problem.bodyMd}
          </p>

          <ul className="space-y-2">
            {problem.choices.map((c) => {
              const isSelected = selected === c.choiceIndex;
              const showCorrect = revealed && c.isCorrect;
              const showWrong = revealed && isSelected && !c.isCorrect;
              return (
                <li key={c.choiceId}>
                  <button
                    type="button"
                    onClick={() => !revealed && setSelected(c.choiceIndex)}
                    disabled={revealed}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                      revealed
                        ? "cursor-default"
                        : "hover:bg-accent cursor-pointer",
                      isSelected && !revealed && "border-primary bg-accent",
                      showCorrect &&
                        "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
                      showWrong &&
                        "border-rose-500 bg-rose-50 dark:bg-rose-950/30",
                    )}
                  >
                    <span className="text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums">
                      {c.choiceIndex}
                    </span>
                    <span className="flex-1">{c.bodyMd}</span>
                    {showCorrect ? (
                      <CircleCheckIcon className="size-5 shrink-0 text-emerald-600" />
                    ) : null}
                    {showWrong ? (
                      <CircleXIcon className="size-5 shrink-0 text-rose-600" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex gap-2">
            {!revealed ? (
              <Button onClick={submit} disabled={selected === null}>
                정답 확인 (학습 모드)
              </Button>
            ) : (
              <Button variant="outline" onClick={reset}>
                다시 풀기
              </Button>
            )}
          </div>

          {revealed ? (
            <Card className="border-dashed">
              <CardHeader>
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  해설 — 지문별 O/X
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {problem.choices.map((c) => (
                  <div
                    key={c.choiceId}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span
                      className={cn(
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                        c.isCorrect
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
                      )}
                    >
                      {c.choiceIndex}
                    </span>
                    <div className="flex-1 space-y-0.5">
                      <p>
                        <span className="font-semibold">
                          {c.isCorrect ? "O" : "X"}
                        </span>
                        {c.explanationMd ? (
                          <span className="text-muted-foreground ml-2">
                            {c.explanationMd}
                          </span>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {c.relatedArticleId ? (
                          <Badge variant="outline" className="text-xs">
                            관련 조문 (feat-4-A-314)
                          </Badge>
                        ) : null}
                        {c.relatedCaseId ? (
                          <Badge variant="outline" className="text-xs">
                            관련 판례 (feat-4-A-314)
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-muted-foreground pt-2 text-xs">
                  Runner(타이머·일괄 제출·오답노트)는 추후 (feat-4-A-303~307).
                </p>
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Q&A
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5">
          <QnaPanel
            threads={qnaThreads}
            targetType="problem"
            targetId={problem.problemId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
