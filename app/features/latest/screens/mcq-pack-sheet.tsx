// MCQ 팩 응시 시험지 (sheet) view — 한 페이지에 모든 문제 표시.
// /api/mcq-pack/start 가 session 을 만든 뒤 여기로 redirect.
// 학습 모드: 답안 선택 → "채점하기" 로 전체 정오/해설 인라인 노출 → 결과 페이지 이동.
// 시험 모드: 답안 선택만 가능, 채점 결과 비공개. 타이머 만료 / "제출" 클릭 시 결과 페이지 이동.

import {
  ArrowLeftIcon,
  BookOpenCheckIcon,
  CheckCircle2Icon,
  CircleXIcon,
  ClockIcon,
  FlagIcon,
  ListChecksIcon,
  TimerIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, data, useFetcher } from "react-router";

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
  type ProblemDetail,
} from "~/features/problems/labels";
import {
  deriveBoxItemOxTruth,
  deriveChoiceOxTruth,
} from "~/features/problems/lib/auto-ox";
import { getProblemDetailsByIds } from "~/features/problems/queries.server";
import {
  MCQ_PACK_KIND_LABELS,
  MCQ_PACK_SUBJECT_LABELS,
} from "~/features/mcq-packs/labels";
import { getPackById } from "~/features/mcq-packs/queries.server";
import {
  getQuizSession,
  getSessionAttemptsMap,
  type QuizMode,
  type SessionAttemptEntry,
} from "~/features/study/queries.server";

import type { Route } from "./+types/mcq-pack-sheet";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.pack) return [{ title: "응시 | Lidam Edu" }];
  return [{ title: `${d.pack.title} 응시 | Lidam Edu` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.packId || !params.sessionId) {
    throw data("Missing id", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const pack = await getPackById(client, params.packId);
  if (!pack) throw data("Pack not found", { status: 404 });

  const session = await getQuizSession(client, user.id, params.sessionId);
  if (!session) throw data("Session not found", { status: 404 });

  const problems = await getProblemDetailsByIds(client, session.problemIds);
  const attemptsMap = await getSessionAttemptsMap(
    client,
    user.id,
    params.sessionId,
  );
  // Map → plain object (loader 직렬화).
  const attempts: Record<string, SessionAttemptEntry> = {};
  for (const [k, v] of attemptsMap) attempts[k] = v;

  return {
    pack,
    session,
    problems,
    attempts,
  };
}

interface SelectedChoiceState {
  // problemId → selected choiceIndex (1..N).
  [problemId: string]: number;
}

function useExamTimer(
  startedAtIso: string | null,
  timeLimitSec: number | null,
  onExpire: () => void,
): string | null {
  const expiredRef = useRef(false);
  const [, force] = useState(0);
  useEffect(() => {
    if (!startedAtIso || !timeLimitSec) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [startedAtIso, timeLimitSec]);
  return useMemo(() => {
    if (!startedAtIso || !timeLimitSec) return null;
    const elapsed = Math.floor(
      (Date.now() - new Date(startedAtIso).getTime()) / 1000,
    );
    const remain = Math.max(0, timeLimitSec - elapsed);
    if (remain === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire();
    }
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [startedAtIso, timeLimitSec, onExpire]);
}

export default function McqPackSheet({ loaderData }: Route.ComponentProps) {
  const { pack, session, problems, attempts } = loaderData;
  const mode: QuizMode = session.mode;
  const isExam = mode === "exam";
  // 기존 응답 복원.
  const initialSelected = useMemo<SelectedChoiceState>(() => {
    const init: SelectedChoiceState = {};
    for (const [pid, att] of Object.entries(attempts)) {
      if (att.selectedChoiceIndex !== null) init[pid] = att.selectedChoiceIndex;
    }
    return init;
  }, [attempts]);

  const [selected, setSelected] = useState<SelectedChoiceState>(initialSelected);
  const [graded, setGraded] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const attemptFetcher = useFetcher();
  const completeFetcher = useFetcher();
  // problemId:choiceIndex 형태로 중복 기록 방지.
  const recordedRef = useRef<Set<string>>(new Set());

  const totalAnswered = Object.keys(selected).length;
  const totalProblems = problems.length;

  const recordAttempt = (problem: ProblemDetail, choiceIndex: number) => {
    const choice = problem.choices.find((c) => c.choiceIndex === choiceIndex);
    if (!choice) return;
    const key = `${problem.problemId}:${choiceIndex}`;
    if (recordedRef.current.has(key)) return;
    recordedRef.current.add(key);
    const fd = new FormData();
    fd.set("problemId", problem.problemId);
    fd.set("selectedChoiceId", choice.choiceId);
    fd.set("selectedChoiceIndex", String(choiceIndex));
    fd.set("isCorrect", choice.isCorrect ? "true" : "false");
    fd.set("mode", mode);
    fd.set("timeSpentMs", String(Math.max(0, Date.now() - startedAtRef.current)));
    fd.set("sessionId", session.sessionId);
    attemptFetcher.submit(fd, {
      method: "post",
      action: "/api/problems/attempt",
    });
  };

  const onSelect = (problem: ProblemDetail, choiceIndex: number) => {
    if (graded && !isExam) return; // 학습 모드 채점 후엔 잠금.
    setSelected((prev) => ({ ...prev, [problem.problemId]: choiceIndex }));
    recordAttempt(problem, choiceIndex);
  };

  const completeSession = () => {
    const fd = new FormData();
    fd.set("sessionId", session.sessionId);
    fd.set(
      "redirectTo",
      `/latest/mcq/${pack.packId}/result/${session.sessionId}`,
    );
    completeFetcher.submit(fd, {
      method: "post",
      action: "/api/study/session-complete",
    });
  };

  const onGrade = () => {
    setGraded(true);
    // 다음 페인트 후 결과 영역으로 스크롤하려면 setTimeout. 첫 오답 위치로 점프하는 방안도 가능.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const timerText = useExamTimer(
    isExam ? session.startedAt : null,
    isExam ? session.timeLimitSec : null,
    () => {
      if (!session.completedAt) completeSession();
    },
  );

  // 채점 결과 통계 (학습 모드 채점 후 헤더에 노출).
  const correctCount = graded
    ? problems.reduce((acc, p) => {
        const sel = selected[p.problemId];
        if (sel === undefined) return acc;
        const c = p.choices.find((c) => c.choiceIndex === sel);
        return acc + (c?.isCorrect ? 1 : 0);
      }, 0)
    : 0;

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-8 md:py-8">
      <Link
        to={`/latest/mcq/${pack.packId}`}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 문제집으로 돌아가기
      </Link>

      <header className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {MCQ_PACK_SUBJECT_LABELS[pack.subjectScope]}
          </Badge>
          <Badge variant="secondary">{MCQ_PACK_KIND_LABELS[pack.kind]}</Badge>
          <Badge variant={isExam ? "destructive" : "default"}>
            {isExam ? "시험 모드" : "학습 모드"}
          </Badge>
          {graded && !isExam ? (
            <Badge variant="default" className="ml-auto">
              채점 완료 · {correctCount}/{totalProblems}
            </Badge>
          ) : null}
        </div>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ListChecksIcon className="text-primary size-6" />
          {pack.title}
        </h1>
        <p className="text-muted-foreground text-xs tabular-nums">
          문항 {totalProblems}
          {pack.durationMin ? ` · 제한 ${pack.durationMin}분` : ""}
          {pack.publishedAt ? ` · 출제일 ${pack.publishedAt}` : ""}
        </p>
      </header>

      {/* 응시 progress + 타이머 + 끝내기 — 스크롤 시 sticky 로 항상 노출. */}
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-2 z-10 mb-4 rounded-md border px-3 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1 text-xs tabular-nums"
            data-testid="sheet-progress"
          >
            <CheckCircle2Icon className="size-3.5 text-emerald-600" />
            응답 {totalAnswered} / {totalProblems}
          </span>
          {timerText ? (
            <span
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs tabular-nums"
              data-testid="exam-timer"
            >
              <TimerIcon className="size-3" />
              {timerText}
            </span>
          ) : null}
          <div className="ml-auto inline-flex gap-2">
            {!isExam && !graded ? (
              <Button
                size="sm"
                className="h-8"
                onClick={onGrade}
                disabled={totalAnswered === 0}
                data-testid="sheet-grade"
              >
                <BookOpenCheckIcon className="size-3.5" /> 채점하기
              </Button>
            ) : null}
            {session.completedAt ? (
              <Button asChild size="sm" className="h-8">
                <Link
                  to={`/latest/mcq/${pack.packId}/result/${session.sessionId}`}
                >
                  결과 보기
                </Link>
              </Button>
            ) : (
              <Button
                size="sm"
                variant={graded || isExam ? "default" : "outline"}
                className="h-8"
                onClick={() => {
                  const ok = confirm(
                    isExam
                      ? "시험을 끝내고 결과를 확인하시겠습니까?"
                      : "응시를 종료하고 결과 통계를 확인하시겠습니까?",
                  );
                  if (ok) completeSession();
                }}
                disabled={completeFetcher.state !== "idle"}
                data-testid="sheet-finish"
              >
                <FlagIcon className="size-3.5" />{" "}
                {isExam ? "시험 끝내기" : "결과 보기"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <ol className="space-y-5">
        {problems.map((problem, idx) => (
          <li key={problem.problemId} id={`p-${idx + 1}`}>
            <ProblemBlock
              problem={problem}
              index={idx + 1}
              selectedChoice={selected[problem.problemId] ?? null}
              graded={graded}
              isExam={isExam}
              onSelect={(ci) => onSelect(problem, ci)}
            />
          </li>
        ))}
      </ol>

      {/* 하단 끝내기 — sticky 헤더와 별개로 한 번 더 노출. */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-muted-foreground text-xs">
          응답 {totalAnswered} / {totalProblems}
          {!isExam && graded
            ? ` · 정답 ${correctCount}/${totalProblems}`
            : ""}
        </p>
        <div className="inline-flex gap-2">
          {!isExam && !graded ? (
            <Button
              onClick={onGrade}
              disabled={totalAnswered === 0}
              data-testid="sheet-grade-bottom"
            >
              <BookOpenCheckIcon className="size-4" /> 전체 채점하기
            </Button>
          ) : null}
          <Form
            method="post"
            action="/api/study/session-complete"
            onSubmit={(e) => {
              if (!confirm("응시를 종료하고 결과 통계를 확인하시겠습니까?")) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="sessionId" value={session.sessionId} />
            <input
              type="hidden"
              name="redirectTo"
              value={`/latest/mcq/${pack.packId}/result/${session.sessionId}`}
            />
            <Button
              type="submit"
              variant={graded || isExam ? "default" : "outline"}
              data-testid="sheet-finish-bottom"
            >
              <FlagIcon className="size-4" /> 결과 페이지로 이동
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}

function ProblemBlock({
  problem,
  index,
  selectedChoice,
  graded,
  isExam,
  onSelect,
}: {
  problem: ProblemDetail;
  index: number;
  selectedChoice: number | null;
  graded: boolean;
  isExam: boolean;
  onSelect: (choiceIndex: number) => void;
}) {
  const showAnswers = graded && !isExam;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/30 pb-3">
        <div className="flex flex-wrap items-start gap-2">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-bold tabular-nums">
            {index}
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant="default" className="h-5">
              {ORIGIN_LABEL[problem.origin]}
            </Badge>
            <Badge variant="outline" className="h-5">
              {FORMAT_LABEL[problem.format]}
            </Badge>
            {problem.polarity ? (
              <Badge variant="outline" className="h-5">
                {POLARITY_LABEL[problem.polarity]}
              </Badge>
            ) : null}
            {problem.scope ? (
              <Badge variant="outline" className="h-5">
                {SCOPE_LABEL[problem.scope]}
              </Badge>
            ) : null}
            {problem.year ? (
              <span className="text-muted-foreground ml-auto tabular-nums">
                {problem.year}년
                {problem.examRoundNo ? ` ${problem.examRoundNo}회` : ""}
                {problem.problemNumber ? ` · ${problem.problemNumber}번` : ""}
              </span>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4 pt-4">
        <p className="font-serif text-[15px] leading-relaxed font-medium whitespace-pre-line">
          {problem.bodyMd}
        </p>

        {problem.boxItems.length > 0 ? (
          <div className="border-foreground/40 bg-muted/30 rounded-md border-2 px-4 py-3">
            <ul className="space-y-1.5">
              {problem.boxItems.map((bi) => (
                <li
                  key={bi.boxItemId}
                  className="font-serif flex gap-2 text-sm leading-relaxed"
                >
                  <span className="text-foreground/80 shrink-0 font-medium">
                    {bi.marker}
                  </span>
                  <span className="flex-1 whitespace-pre-line">{bi.bodyMd}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className="space-y-2">
          {problem.choices.map((c) => {
            const isSelected = selectedChoice === c.choiceIndex;
            const showCorrect = showAnswers && c.isCorrect;
            const showWrong = showAnswers && isSelected && !c.isCorrect;
            const locked = showAnswers;
            return (
              <li key={c.choiceId}>
                <button
                  type="button"
                  data-testid={`sheet-choice-${index}-${c.choiceIndex}`}
                  onClick={() => !locked && onSelect(c.choiceIndex)}
                  disabled={locked}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    locked
                      ? "cursor-default"
                      : "hover:bg-accent cursor-pointer",
                    isSelected && !locked && "border-primary bg-accent",
                    showCorrect &&
                      "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
                    showWrong &&
                      "border-rose-500 bg-rose-50 dark:bg-rose-950/30",
                  )}
                >
                  <span className="text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums">
                    {c.choiceIndex}
                  </span>
                  <span className="font-serif flex-1 whitespace-pre-line">
                    {c.bodyMd}
                  </span>
                  {showCorrect ? (
                    <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600" />
                  ) : null}
                  {showWrong ? (
                    <CircleXIcon className="size-5 shrink-0 text-rose-600" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        {showAnswers ? (
          <ExplanationBlock problem={problem} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExplanationBlock({ problem }: { problem: ProblemDetail }) {
  const correctChoiceBody =
    problem.choices.find((c) => c.isCorrect)?.bodyMd ?? null;
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <ClockIcon className="size-3" /> 해설
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {problem.boxItems.length > 0
          ? problem.boxItems.map((bi) => {
              const truth: "O" | "X" | null = bi.oxIneligible
                ? null
                : (bi.oxTruth ??
                  deriveBoxItemOxTruth({
                    polarity: problem.polarity,
                    format: problem.format,
                    marker: bi.marker,
                    correctChoiceBody,
                    oxIneligible: bi.oxIneligible,
                  }));
              return (
                <div
                  key={bi.boxItemId}
                  className="flex items-start gap-2 text-sm"
                >
                  <span
                    className={cn(
                      "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      truth === "O"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                        : truth === "X"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {bi.marker}
                  </span>
                  <p className="flex-1">
                    <span className="font-semibold">{truth ?? "—"}</span>
                    {bi.explanationMd ? (
                      <span className="text-muted-foreground ml-2">
                        {bi.explanationMd}
                      </span>
                    ) : null}
                  </p>
                </div>
              );
            })
          : null}
        {problem.boxItems.length > 0 ? <Separator /> : null}
        {problem.choices.map((c) => {
          const derivedOx =
            problem.format === "mc_short"
              ? (c.oxTruth ??
                deriveChoiceOxTruth({
                  polarity: problem.polarity,
                  format: problem.format,
                  isCorrect: c.isCorrect,
                  oxIneligible: c.oxIneligible,
                }))
              : null;
          const label =
            problem.format === "mc_box"
              ? c.isCorrect
                ? "정답"
                : ""
              : (derivedOx ?? (c.isCorrect ? "정답" : ""));
          const tone = c.isCorrect
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
            : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200";
          return (
            <div
              key={c.choiceId}
              className="flex items-start gap-2 text-sm"
            >
              <span
                className={cn(
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                  tone,
                )}
              >
                {c.choiceIndex}
              </span>
              <p className="flex-1">
                <span className="font-semibold">{label || "—"}</span>
                {c.explanationMd ? (
                  <span className="text-muted-foreground ml-2">
                    {c.explanationMd}
                  </span>
                ) : null}
              </p>
            </div>
          );
        })}
        {problem.explanationMd ? (
          <div className="border-t pt-2 text-xs">
            <p className="text-muted-foreground mb-1 font-semibold tracking-wide uppercase">
              종합 해설
            </p>
            <p className="whitespace-pre-line">{problem.explanationMd}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
