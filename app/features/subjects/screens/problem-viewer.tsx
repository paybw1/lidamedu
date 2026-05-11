import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  FlagIcon,
  TimerIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  data,
  redirect,
  useFetcher,
  useNavigate,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getBookmark,
  getUserArticleAnnotationCounts,
  getUserArticleBookmarkLevels,
  listHighlights,
  listMemos,
} from "~/features/annotations/queries.server";
import { HighlightToolbar } from "~/features/annotations/components/highlight-toolbar";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import { getLawByCode, getSystematicSkeleton } from "~/features/laws/queries.server";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
} from "~/features/problems/labels";
import {
  getCasesCitedByProblem,
  getChoiceLinkRefs,
  getProblemById,
  getRelatedProblems,
  getSystematicNodeProblemSequence,
} from "~/features/problems/queries.server";
import { listThreadsForTarget } from "~/features/qna/queries.server";
import { SystematicTree } from "~/features/subjects/components/systematic-tree";
import {
  EXAM_LABEL,
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";
import {
  createQuizSession,
  getProblemStats,
  getQuizSession,
  recordStudySession,
  type QuizMode,
} from "~/features/study/queries.server";
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_TONE,
} from "~/features/study/lib/difficulty";

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

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw data("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const nodeId = url.searchParams.get("node");
  const sessionIdParam = url.searchParams.get("session");
  const modeParam = url.searchParams.get("mode");
  const requestedMode: QuizMode = modeParam === "exam" ? "exam" : "study";
  const nodeSequence = nodeId
    ? await getSystematicNodeProblemSequence(client, nodeId)
    : null;

  // 세션 처리:
  //   - ?session=<sid>: 본인 세션 로드. 유효하지 않으면 무시.
  //   - ?node=<nid> AND no session: 새 세션 생성 후 ?session=<sid> 붙여 redirect.
  let session = sessionIdParam
    ? await getQuizSession(client, user.id, sessionIdParam)
    : null;
  if (!session && nodeId && nodeSequence && nodeSequence.problems.length > 0) {
    const newSessionId = await createQuizSession(client, user.id, {
      mode: requestedMode,
      lawCode,
      scopeType: "node",
      scopePayload: { nodeId, nodeLabel: nodeSequence.node.displayLabel },
      problemIds: nodeSequence.problems.map((p) => p.problemId),
      // 시험 모드 기본 시간: 90초/문제. 학습 모드는 무제한.
      timeLimitSec:
        requestedMode === "exam"
          ? Math.max(60, nodeSequence.problems.length * 90)
          : null,
    });
    const next = new URL(url);
    next.searchParams.set("session", newSessionId);
    next.searchParams.set("mode", requestedMode);
    throw redirect(`${next.pathname}${next.search}`);
  }

  const law = await getLawByCode(client, lawCode);
  const [
    systematicNodes,
    bookmark,
    memos,
    highlights,
    bookmarkLevels,
    annotationCounts,
    qnaThreads,
    problemStats,
    relatedProblems,
    citedCases,
  ] = await Promise.all([
    law ? getSystematicSkeleton(client, lawCode) : Promise.resolve([]),
    getBookmark(client, user.id, "problem", problem.problemId),
    listMemos(client, user.id, "problem", problem.problemId),
    listHighlights(client, user.id, "problem", problem.problemId),
    getUserArticleBookmarkLevels(client, user.id),
    getUserArticleAnnotationCounts(client, user.id),
    listThreadsForTarget(client, "problem", problem.problemId, 20),
    getProblemStats(client, problem.problemId),
    getRelatedProblems(client, problem.problemId, 8),
    getCasesCitedByProblem(client, problem.problemId),
  ]);

  // 해설 지문별 "관련 조문/판례" 링크용 reference 한 번에 lookup.
  const allArticleIds = problem.choices
    .map((c) => c.relatedArticleId)
    .filter((x): x is string => !!x);
  const allCaseIds = problem.choices
    .map((c) => c.relatedCaseId)
    .filter((x): x is string => !!x);
  const choiceLinkRefs = await getChoiceLinkRefs(
    client,
    allArticleIds,
    allCaseIds,
  );
  // Map → 직렬화 가능한 plain object 로 변환 (loader return).
  const choiceArticleRefs: Record<string, { lawCode: string; pathSlug: string; displayLabel: string }> = {};
  for (const [k, v] of choiceLinkRefs.articles)
    choiceArticleRefs[k] = {
      lawCode: v.lawCode,
      pathSlug: v.pathSlug,
      displayLabel: v.displayLabel,
    };
  const choiceCaseRefs: Record<string, { lawCode: string; caseNumber: string; caseTitle: string }> = {};
  for (const [k, v] of choiceLinkRefs.cases)
    choiceCaseRefs[k] = {
      lawCode: v.lawCode,
      caseNumber: v.caseNumber,
      caseTitle: v.caseTitle,
    };

  // 진도 기록 — fire-and-forget.
  recordStudySession(client, user.id, {
    subject: lawCode,
    target_type: "problem",
    target_id: problem.problemId,
    tab: "problems",
  }).catch(() => {});

  // Runner nav 계산. 세션이 있으면 session.problemIds 기준, 아니면 nodeSequence 기준.
  let runnerNav: {
    sessionId: string | null;
    mode: QuizMode;
    scopeType: "node" | "filter" | "wrong-note" | "free" | "pack";
    label: string;
    backHref: string;
    index: number;
    total: number;
    prevId: string | null;
    nextId: string | null;
    timeLimitSec: number | null;
    startedAt: string | null;
    // MCQ 팩 응시일 때 — 완료 시 pack 결과 페이지로 redirect.
    packId: string | null;
  } | null = null;
  const navProblemIds = session
    ? session.problemIds
    : nodeSequence
      ? nodeSequence.problems.map((p) => p.problemId)
      : null;
  const packIdFromPayload =
    session && typeof session.scopePayload.packId === "string"
      ? session.scopePayload.packId
      : null;
  const packTitleFromPayload =
    session && typeof session.scopePayload.packTitle === "string"
      ? session.scopePayload.packTitle
      : null;
  const navLabel = session
    ? packTitleFromPayload
      ? `문제집: ${packTitleFromPayload}`
      : typeof session.scopePayload.nodeLabel === "string"
        ? `체계: ${session.scopePayload.nodeLabel}`
        : session.scopeType === "filter"
          ? "맞춤 퀴즈"
          : "퀴즈 세션"
    : nodeSequence
      ? `체계: ${nodeSequence.node.displayLabel}`
      : null;
  const navScopeType = (session?.scopeType ??
    (nodeSequence ? "node" : "free")) as
    | "node"
    | "filter"
    | "wrong-note"
    | "free"
    | "pack";
  const navBackHref = packIdFromPayload
    ? `/latest/mcq/${packIdFromPayload}`
    : navScopeType === "node"
      ? `/subjects/${lawCode}/problems/system`
      : navScopeType === "filter"
        ? `/subjects/${lawCode}/quiz/setup`
        : navScopeType === "wrong-note"
          ? `/study/wrong-note?subject=${lawCode}`
          : `/subjects/${lawCode}?tab=problems`;
  if (navProblemIds && navLabel) {
    const idx = navProblemIds.findIndex((id) => id === problem.problemId);
    if (idx >= 0) {
      runnerNav = {
        sessionId: session?.sessionId ?? null,
        mode: (session?.mode as QuizMode) ?? "study",
        scopeType: navScopeType,
        label: navLabel,
        backHref: navBackHref,
        index: idx,
        total: navProblemIds.length,
        prevId: idx > 0 ? navProblemIds[idx - 1] : null,
        nextId: idx < navProblemIds.length - 1 ? navProblemIds[idx + 1] : null,
        timeLimitSec: session?.timeLimitSec ?? null,
        startedAt: session?.startedAt ?? null,
        packId: packIdFromPayload,
      };
    }
  }

  return {
    subject: LAW_SUBJECTS[lawCode],
    problem,
    qnaThreads,
    systematicNodes,
    bookmark,
    memos,
    highlights,
    bookmarkLevels,
    annotationCounts,
    runnerNav,
    sessionCompleted: session?.completedAt != null,
    problemStats,
    relatedProblems,
    citedCases,
    choiceArticleRefs,
    choiceCaseRefs,
  };
}

// problem_case_links 의 pc_relation_type → article_case_links 의 ac_relation_type 매핑
// (ArticleRightPanel 의 "판례" 탭 라벨 호환).
const PC_TO_AC: Record<string, "directly_interprets" | "cites" | "similar_to" | "contrary_to"> = {
  cited: "cites",
  illustrates: "directly_interprets",
  contrasts: "contrary_to",
  similar: "similar_to",
};

// 시험 모드 카운트다운 — server-issued startedAt + timeLimitSec 기준.
function useExamTimer(
  startedAtIso: string | null,
  timeLimitSec: number | null,
  onExpire: () => void,
): string | null {
  const expiredRef = useRef(false);
  const [, force] = useState(0);
  useEffect(() => {
    if (!startedAtIso || !timeLimitSec) return;
    const tick = () => force((n) => n + 1);
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAtIso, timeLimitSec]);
  return useMemo(() => {
    if (!startedAtIso || !timeLimitSec) return null;
    const elapsedSec = Math.floor(
      (Date.now() - new Date(startedAtIso).getTime()) / 1000,
    );
    const remain = Math.max(0, timeLimitSec - elapsedSec);
    if (remain === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire();
    }
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [startedAtIso, timeLimitSec, onExpire]);
}

export default function ProblemViewer({ loaderData }: Route.ComponentProps) {
  const {
    subject,
    problem,
    qnaThreads,
    systematicNodes,
    bookmark,
    memos,
    highlights,
    bookmarkLevels,
    annotationCounts,
    runnerNav,
    sessionCompleted,
    problemStats,
    relatedProblems,
    citedCases,
    choiceArticleRefs,
    choiceCaseRefs,
  } = loaderData;
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const attemptFetcher = useFetcher();
  const completeFetcher = useFetcher();
  const recordedKeyRef = useRef<string | null>(null);
  const navigate = useNavigate();

  const sessionMode: QuizMode = runnerNav?.mode ?? "study";
  const inSession = runnerNav !== null;
  const isExam = sessionMode === "exam";

  // 문제가 바뀌면 상태 초기화.
  useEffect(() => {
    setSelected(null);
    setRevealed(false);
    startedAtRef.current = Date.now();
    recordedKeyRef.current = null;
  }, [problem.problemId]);

  const buildRunnerHref = (problemId: string) => {
    const params = new URLSearchParams();
    if (runnerNav?.sessionId) params.set("session", runnerNav.sessionId);
    params.set("mode", sessionMode);
    return `/subjects/${subject.slug}/problems/${problemId}?${params.toString()}`;
  };

  const recordAttempt = () => {
    if (selected === null) return;
    const choice = problem.choices.find((c) => c.choiceIndex === selected);
    if (!choice) return;
    const key = `${problem.problemId}:${selected}`;
    if (recordedKeyRef.current === key) return;
    recordedKeyRef.current = key;
    const fd = new FormData();
    fd.set("problemId", problem.problemId);
    fd.set("selectedChoiceId", choice.choiceId);
    fd.set("selectedChoiceIndex", String(selected));
    fd.set("isCorrect", choice.isCorrect ? "true" : "false");
    fd.set("mode", sessionMode);
    fd.set(
      "timeSpentMs",
      String(Math.max(0, Date.now() - startedAtRef.current)),
    );
    if (runnerNav?.sessionId) fd.set("sessionId", runnerNav.sessionId);
    attemptFetcher.submit(fd, {
      method: "post",
      action: "/api/problems/attempt",
    });
  };

  // 학습 모드 단발 풀이 (세션 없음 OR study 세션에서 정답 확인 버튼).
  const submitStudy = () => {
    if (selected === null) return;
    setRevealed(true);
    recordAttempt();
  };

  const reset = () => {
    setSelected(null);
    setRevealed(false);
    startedAtRef.current = Date.now();
    recordedKeyRef.current = null;
  };

  // 시험 모드: 정답 노출 없이 다음 문제로.
  const goNext = () => {
    recordAttempt();
    if (runnerNav?.nextId) {
      navigate(buildRunnerHref(runnerNav.nextId));
    }
  };

  const completeSession = () => {
    recordAttempt();
    if (!runnerNav?.sessionId) return;
    const fd = new FormData();
    fd.set("sessionId", runnerNav.sessionId);
    const resultUrl = runnerNav.packId
      ? `/latest/mcq/${runnerNav.packId}/result/${runnerNav.sessionId}`
      : `/subjects/${subject.slug}/quiz/result/${runnerNav.sessionId}`;
    fd.set("redirectTo", resultUrl);
    completeFetcher.submit(fd, {
      method: "post",
      action: "/api/study/session-complete",
    });
  };

  // 시험 모드 카운트다운 — startedAt + timeLimitSec.
  const timerText = useExamTimer(
    isExam && runnerNav?.startedAt ? runnerNav.startedAt : null,
    isExam ? (runnerNav?.timeLimitSec ?? null) : null,
    () => {
      // 시간 만료 자동 끝내기.
      if (runnerNav?.sessionId && !sessionCompleted) completeSession();
    },
  );

  const systematicEmpty = systematicNodes.length === 0;
  const isLast = runnerNav ? runnerNav.nextId === null : false;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <HighlightToolbar targetType="problem" targetId={problem.problemId} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          to={
            runnerNav
              ? runnerNav.backHref
              : `/subjects/${subject.slug}?tab=problems`
          }
          viewTransition
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="size-4" />
          {runnerNav ? runnerNav.label : `${subject.name} 문제 색인`}
        </Link>
        {runnerNav ? (
          <div className="flex items-center gap-2">
            <Badge variant={isExam ? "destructive" : "secondary"} className="h-6">
              {isExam ? "시험 모드" : "학습 모드"}
            </Badge>
            {timerText ? (
              <span
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums"
                data-testid="exam-timer"
              >
                <TimerIcon className="size-3" />
                {timerText}
              </span>
            ) : null}
            <span className="text-muted-foreground text-xs tabular-nums">
              {runnerNav.index + 1} / {runnerNav.total}
            </span>
            {!isExam ? (
              <>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={!runnerNav.prevId}
                  className="h-7"
                >
                  {runnerNav.prevId ? (
                    <Link
                      to={buildRunnerHref(runnerNav.prevId)}
                      viewTransition
                    >
                      <ChevronLeftIcon className="size-3.5" /> 이전
                    </Link>
                  ) : (
                    <span>
                      <ChevronLeftIcon className="size-3.5" /> 이전
                    </span>
                  )}
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={!runnerNav.nextId}
                  className="h-7"
                >
                  {runnerNav.nextId ? (
                    <Link
                      to={buildRunnerHref(runnerNav.nextId)}
                      viewTransition
                    >
                      다음 <ChevronRightIcon className="size-3.5" />
                    </Link>
                  ) : (
                    <span>
                      다음 <ChevronRightIcon className="size-3.5" />
                    </span>
                  )}
                </Button>
              </>
            ) : null}
            {runnerNav.sessionId && !sessionCompleted ? (
              <Button
                size="sm"
                variant={isLast || isExam ? "default" : "ghost"}
                className="h-7"
                onClick={completeSession}
                disabled={completeFetcher.state !== "idle"}
                data-testid="finish-session"
              >
                <FlagIcon className="size-3.5" /> 끝내기
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
          <Card className="py-4">
            <CardContent className="px-2 pb-2">
              {systematicEmpty ? (
                <p className="text-muted-foreground px-2 py-4 text-xs">
                  체계도 데이터 미입력
                </p>
              ) : (
                <SystematicTree
                  nodes={systematicNodes}
                  activeArticleId={problem.primaryArticleId ?? undefined}
                  lawCode={subject.slug}
                  bookmarkLevels={bookmarkLevels}
                  annotationCounts={annotationCounts}
                />
              )}
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-4">
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
              <div
                className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs"
                data-testid="problem-stats"
              >
                {problemStats.bucket && problemStats.accuracyPct !== null ? (
                  <>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                        DIFFICULTY_TONE[problemStats.bucket],
                      )}
                    >
                      {DIFFICULTY_LABEL[problemStats.bucket]}
                    </span>
                    <span className="tabular-nums">
                      전체 정답률 {problemStats.accuracyPct}% · 시도{" "}
                      {problemStats.attempts.toLocaleString("ko-KR")}회 ·
                      응시자 {problemStats.distinctUsers}명
                    </span>
                  </>
                ) : problemStats.attempts > 0 ? (
                  <span>
                    시도 {problemStats.attempts}회 (난이도 표본 부족 · 5회
                    이상부터)
                  </span>
                ) : (
                  <span>아직 풀이 데이터가 없습니다</span>
                )}
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="space-y-5 pt-6">
              <p className="font-serif text-base leading-relaxed font-medium">
                {problem.bodyMd}
              </p>

              <ul className="space-y-2">
                {problem.choices.map((c) => {
                  const isSelected = selected === c.choiceIndex;
                  // 시험 모드에서는 채점 결과 노출 X.
                  const showCorrect = revealed && !isExam && c.isCorrect;
                  const showWrong =
                    revealed && !isExam && isSelected && !c.isCorrect;
                  const locked = revealed && !isExam;
                  return (
                    <li key={c.choiceId}>
                      <button
                        type="button"
                        data-testid={`problem-choice-${c.choiceIndex}`}
                        onClick={() => !locked && setSelected(c.choiceIndex)}
                        disabled={locked}
                        aria-pressed={isSelected}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
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
                        <span className="font-serif flex-1">{c.bodyMd}</span>
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

              <div className="flex flex-wrap gap-2">
                {isExam ? (
                  isLast ? (
                    <Button
                      onClick={completeSession}
                      disabled={
                        selected === null || completeFetcher.state !== "idle"
                      }
                      data-testid="exam-finish"
                    >
                      <FlagIcon className="size-4" /> 시험 끝내기 · 결과 보기
                    </Button>
                  ) : (
                    <Button
                      onClick={goNext}
                      disabled={selected === null}
                      data-testid="exam-next"
                    >
                      다음 문제 <ChevronRightIcon className="size-4" />
                    </Button>
                  )
                ) : !revealed ? (
                  <Button onClick={submitStudy} disabled={selected === null}>
                    정답 확인 (학습 모드)
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={reset}>
                      다시 풀기
                    </Button>
                    {runnerNav?.nextId ? (
                      <Button asChild>
                        <Link
                          to={buildRunnerHref(runnerNav.nextId)}
                          viewTransition
                        >
                          다음 문제 <ChevronRightIcon className="size-4" />
                        </Link>
                      </Button>
                    ) : null}
                  </>
                )}
              </div>

              {revealed && !isExam ? (
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
                            {(() => {
                              const articleRef = c.relatedArticleId
                                ? choiceArticleRefs[c.relatedArticleId]
                                : null;
                              if (articleRef) {
                                return (
                                  <Link
                                    to={`/subjects/${articleRef.lawCode}/articles/${articleRef.pathSlug}`}
                                    viewTransition
                                    data-testid="choice-related-article"
                                    className="hover:bg-accent inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                                  >
                                    조문 {articleRef.displayLabel}
                                  </Link>
                                );
                              }
                              if (c.relatedArticleId) {
                                return (
                                  <Badge variant="outline" className="text-xs">
                                    조문 {c.relatedArticleNumber ?? "—"}
                                  </Badge>
                                );
                              }
                              return null;
                            })()}
                            {(() => {
                              const caseRef = c.relatedCaseId
                                ? choiceCaseRefs[c.relatedCaseId]
                                : null;
                              if (caseRef) {
                                return (
                                  <Link
                                    to={`/subjects/${caseRef.lawCode}/cases/${c.relatedCaseId}`}
                                    viewTransition
                                    data-testid="choice-related-case"
                                    className="hover:bg-accent inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                                  >
                                    판례 {caseRef.caseNumber}
                                  </Link>
                                );
                              }
                              if (c.relatedCaseId) {
                                return (
                                  <Badge variant="outline" className="text-xs">
                                    판례 {c.relatedCaseNumber ?? "—"}
                                  </Badge>
                                );
                              }
                              return null;
                            })()}
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
        </main>

        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
          <Card className="py-4">
            <CardContent className="px-3">
              <ArticleRightPanel
                target={{ type: "problem", id: problem.problemId }}
                bookmark={bookmark}
                memos={memos}
                highlights={highlights}
                qnaThreads={qnaThreads}
                relatedProblems={relatedProblems}
                subjectSlug={subject.slug}
                relatedCases={citedCases.map((c) => ({
                  caseId: c.caseId,
                  caseNumber: c.caseNumber,
                  caseTitle: c.caseTitle,
                  summaryTitle: c.summaryTitle,
                  decidedAt: c.decidedAt,
                  importance: c.importance,
                  relationType: PC_TO_AC[c.relationType] ?? "cites",
                  note: null,
                }))}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
