import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  FlagIcon,
  TimerIcon,
  VideoIcon,
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
  SUBJECTIVE_KIND_LABEL,
} from "~/features/problems/labels";
import {
  deriveBoxItemOxTruth,
  deriveChoiceOxTruth,
} from "~/features/problems/lib/auto-ox";
import { FlowNav } from "~/features/study/components/flow-nav";
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
  getSubjectiveAttempt,
  recordStudySession,
  type QuizMode,
  type SubjectiveAttempt,
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
    scopeType: "node" | "filter" | "wrong-note" | "bookmark" | "free" | "pack";
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
          : session.scopeType === "wrong-note"
            ? "오답노트 세션"
            : session.scopeType === "bookmark"
              ? "즐겨찾기 세션"
              : "퀴즈 세션"
    : nodeSequence
      ? `체계: ${nodeSequence.node.displayLabel}`
      : null;
  const navScopeType = (session?.scopeType ??
    (nodeSequence ? "node" : "free")) as
    | "node"
    | "filter"
    | "wrong-note"
    | "bookmark"
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
          : navScopeType === "bookmark"
            ? `/study/bookmarks?subject=${lawCode}&type=problem`
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

  // 주관식 답안 (있으면) — 미작성/객관식이면 null.
  const subjectiveAttempt =
    problem.format === "subjective"
      ? await getSubjectiveAttempt(client, user.id, problem.problemId)
      : null;

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
    subjectiveAttempt,
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
    subjectiveAttempt,
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
      <FlowNav
        subjectSlug={subject.slug}
        currentType="problem"
        currentId={problem.problemId}
      />
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
                {problem.subjectiveKind ? (
                  <Badge variant="secondary">
                    {SUBJECTIVE_KIND_LABEL[problem.subjectiveKind]}
                  </Badge>
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
                {problem.videoUrl ? (
                  <a
                    href={problem.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:bg-accent ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
                    data-testid="problem-video-link"
                    title="강사 풀이 동영상 (외부 링크)"
                  >
                    <VideoIcon className="size-3" /> 동영상 풀이 보기
                  </a>
                ) : null}
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="space-y-5 pt-6">
              <p className="font-serif text-base leading-relaxed font-medium">
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
                        <span className="flex-1">{bi.bodyMd}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {problem.format === "subjective" ? (
                <SubjectivePanel
                  problemId={problem.problemId}
                  modelAnswerMd={problem.modelAnswerMd}
                  gradingRubricMd={problem.gradingRubricMd}
                  explanationMd={problem.explanationMd}
                  rubricItems={problem.rubricItems}
                  initialAttempt={subjectiveAttempt}
                />
              ) : (
              <>
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
                      해설 — {problem.format === "mc_box" ? "박스 항목" : "지문"}별 O/X
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {problem.boxItems.length > 0
                      ? (() => {
                          const correctChoiceBody =
                            problem.choices.find((c) => c.isCorrect)?.bodyMd ??
                            null;
                          return problem.boxItems.map((bi) => {
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
                                <div className="flex-1 space-y-0.5">
                                  <p>
                                    <span className="font-semibold">
                                      {truth ?? "—"}
                                    </span>
                                    {bi.explanationMd ? (
                                      <span className="text-muted-foreground ml-2">
                                        {bi.explanationMd}
                                      </span>
                                    ) : null}
                                  </p>
                                </div>
                              </div>
                            );
                          });
                        })()
                      : null}
                    {problem.boxItems.length > 0 && problem.choices.length > 0 ? (
                      <div className="border-t pt-2">
                        <p className="text-muted-foreground mb-1 text-xs">
                          정답 보기
                        </p>
                      </div>
                    ) : null}
                    {problem.choices.map((c) => {
                      // mc_box: 보기는 박스 묶음이라 per-choice OX 의미 없음 → 정답만 표시.
                      // mc_short(긍정/부정형 단답): 헬퍼로 polarity 반영해 O/X 산출.
                      // 그 외(mc_case 등): 정답 여부만 표시.
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
                        <div className="flex-1 space-y-0.5">
                          <p>
                            <span className="font-semibold">{label || "—"}</span>
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
                      );
                    })}
                  </CardContent>
                </Card>
              ) : null}
              </>
              )}
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

// 주관식(format='subjective') 학습 — 답안 textarea + autosave + 자기채점 + 모범답안/채점기준 reveal.
function SubjectivePanel({
  problemId,
  modelAnswerMd,
  gradingRubricMd,
  explanationMd,
  rubricItems,
  initialAttempt,
}: {
  problemId: string;
  modelAnswerMd: string | null;
  gradingRubricMd: string | null;
  explanationMd: string | null;
  rubricItems: { label: string; points: number }[] | null;
  initialAttempt: SubjectiveAttempt | null;
}) {
  const [draft, setDraft] = useState(initialAttempt?.answerMd ?? "");
  const [revealedModel, setRevealedModel] = useState(false);
  const [revealedRubric, setRevealedRubric] = useState(false);
  const [lastSaved, setLastSaved] = useState<SubjectiveAttempt | null>(initialAttempt);
  const [showScoreForm, setShowScoreForm] = useState(false);
  const [scoreDraft, setScoreDraft] = useState<string>(
    initialAttempt?.selfScore != null ? String(initialAttempt.selfScore) : "",
  );
  const [scoreNote, setScoreNote] = useState<string>(
    initialAttempt?.selfScoreNote ?? "",
  );
  // 시간제한 응시 모드 — 클라이언트 상태. 새로고침 시 리셋 (자기학습용).
  const [timedStartedAt, setTimedStartedAt] = useState<number | null>(null);
  const [timedLimitMin, setTimedLimitMin] = useState<number>(30);
  const [timedExpired, setTimedExpired] = useState(false);
  // 채점기준 체크리스트 (feat-4-A-322). null = rubric 없음.
  const [checkedIdx, setCheckedIdx] = useState<Set<number>>(
    new Set(initialAttempt?.rubricSelfCheck ?? []),
  );
  const autosaveFetcher = useFetcher<{
    ok?: true;
    attempt?: SubjectiveAttempt;
    error?: string;
  }>();
  const submitFetcher = useFetcher<{
    ok?: true;
    attempt?: SubjectiveAttempt;
    error?: string;
  }>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string>(initialAttempt?.answerMd ?? "");

  // problem 바뀌면 상태 리셋 (useEffect 안전).
  useEffect(() => {
    setDraft(initialAttempt?.answerMd ?? "");
    setLastSaved(initialAttempt);
    setScoreDraft(
      initialAttempt?.selfScore != null ? String(initialAttempt.selfScore) : "",
    );
    setScoreNote(initialAttempt?.selfScoreNote ?? "");
    setShowScoreForm(false);
    setRevealedModel(false);
    setRevealedRubric(false);
    setTimedStartedAt(null);
    setTimedExpired(false);
    setCheckedIdx(new Set(initialAttempt?.rubricSelfCheck ?? []));
    lastSentRef.current = initialAttempt?.answerMd ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId]);

  // autosave: 디바운스 1.5초, 변경 있을 때만 전송.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (draft === lastSentRef.current) return;
    debounceRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("intent", "autosave");
      fd.set("problemId", problemId);
      fd.set("answerMd", draft);
      autosaveFetcher.submit(fd, {
        method: "post",
        action: "/api/study/subjective-attempt",
      });
      lastSentRef.current = draft;
    }, 1500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, problemId]);

  // 체크리스트 변경 시 즉시 저장 (디바운스 없이 — 토글 한 번에 1 req).
  const toggleRubric = (i: number) => {
    setCheckedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      const arr = [...next].sort((a, b) => a - b);
      const fd = new FormData();
      fd.set("intent", "autosave");
      fd.set("problemId", problemId);
      fd.set("answerMd", draft);
      fd.set("rubricSelfCheck", JSON.stringify(arr));
      autosaveFetcher.submit(fd, {
        method: "post",
        action: "/api/study/subjective-attempt",
      });
      return next;
    });
  };

  // autosave 응답 → lastSaved 갱신.
  useEffect(() => {
    if (
      autosaveFetcher.state === "idle" &&
      autosaveFetcher.data &&
      autosaveFetcher.data.ok &&
      autosaveFetcher.data.attempt
    ) {
      setLastSaved(autosaveFetcher.data.attempt);
    }
  }, [autosaveFetcher.state, autosaveFetcher.data]);

  // submit 응답 → lastSaved + form 닫기.
  useEffect(() => {
    if (
      submitFetcher.state === "idle" &&
      submitFetcher.data &&
      submitFetcher.data.ok &&
      submitFetcher.data.attempt
    ) {
      setLastSaved(submitFetcher.data.attempt);
      setShowScoreForm(false);
    }
  }, [submitFetcher.state, submitFetcher.data]);

  const hasModel = (modelAnswerMd ?? "").trim().length > 0;
  const hasRubric = (gradingRubricMd ?? "").trim().length > 0;
  const isDirty = draft !== (lastSaved?.answerMd ?? "");
  const isSaving =
    autosaveFetcher.state !== "idle" || submitFetcher.state !== "idle";

  const onSubmitScore = () => {
    const score = scoreDraft.trim() === "" ? null : Number(scoreDraft);
    if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
      alert("자기채점 점수는 0~100 사이로 입력하세요.");
      return;
    }
    const fd = new FormData();
    fd.set("intent", "submit");
    fd.set("problemId", problemId);
    fd.set("answerMd", draft);
    if (score !== null) fd.set("selfScore", String(score));
    if (scoreNote.trim()) fd.set("selfScoreNote", scoreNote.trim());
    submitFetcher.submit(fd, {
      method: "post",
      action: "/api/study/subjective-attempt",
    });
  };

  // 시간제한 응시 — 1초마다 강제 리렌더해 카운트다운 표시. 만료 시 1회만 onTimerExpire.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (timedStartedAt === null) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timedStartedAt]);
  const timedRemainSec = useMemo(() => {
    if (timedStartedAt === null) return null;
    const elapsed = Math.floor((Date.now() - timedStartedAt) / 1000);
    return Math.max(0, timedLimitMin * 60 - elapsed);
  }, [timedStartedAt, timedLimitMin]);
  useEffect(() => {
    if (timedStartedAt === null || timedExpired) return;
    if (timedRemainSec === 0) {
      setTimedExpired(true);
      // 만료 시 자동 제출 — 현재 draft + score 미입력(null) 으로 submitted_at 만 찍는다.
      const fd = new FormData();
      fd.set("intent", "submit");
      fd.set("problemId", problemId);
      fd.set("answerMd", draft);
      submitFetcher.submit(fd, {
        method: "post",
        action: "/api/study/subjective-attempt",
      });
    }
    // submitFetcher 는 매 렌더 새 참조라 의존성 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedRemainSec, timedStartedAt, timedExpired, draft, problemId]);
  const timedActive = timedStartedAt !== null && !timedExpired;

  return (
    <div className="space-y-4">
      <SubjectiveTimedBar
        timedStartedAt={timedStartedAt}
        timedLimitMin={timedLimitMin}
        timedRemainSec={timedRemainSec}
        timedExpired={timedExpired}
        onStart={(min) => {
          setTimedLimitMin(min);
          setTimedStartedAt(Date.now());
          setTimedExpired(false);
        }}
        onCancel={() => {
          if (confirm("시험 모드를 취소하시겠습니까? 작성한 답안은 그대로 유지됩니다.")) {
            setTimedStartedAt(null);
            setTimedExpired(false);
          }
        }}
      />

      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <p className="text-muted-foreground font-semibold tracking-wide uppercase">
            답안 작성 (자동 저장)
          </p>
          <SavingStatus
            isSaving={isSaving}
            isDirty={isDirty}
            updatedAt={lastSaved?.updatedAt ?? null}
          />
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={14}
          placeholder="목차를 잡고 본문을 작성해보세요. 작성 중 1.5초 정지 시 자동 저장됩니다."
          className="border-input bg-background w-full rounded-md border px-3 py-2 font-serif text-sm leading-relaxed"
          data-testid="subjective-answer-draft"
        />
        <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
          {draft.length}자
        </p>
      </div>

      {rubricItems && rubricItems.length > 0 && !timedActive ? (
        <RubricChecklist
          items={rubricItems}
          checked={checkedIdx}
          onToggle={toggleRubric}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={revealedModel ? "outline" : "default"}
          size="sm"
          onClick={() => setRevealedModel((v) => !v)}
          disabled={!hasModel || timedActive}
          title={timedActive ? "시험 모드 중에는 모범답안 잠금" : undefined}
          data-testid="subjective-reveal-model"
        >
          {revealedModel ? "모범답안 숨기기" : "모범답안 보기"}
          {!hasModel ? " (미등록)" : ""}
        </Button>
        <Button
          variant={revealedRubric ? "outline" : "secondary"}
          size="sm"
          onClick={() => setRevealedRubric((v) => !v)}
          disabled={!hasRubric || timedActive}
          title={timedActive ? "시험 모드 중에는 채점기준 잠금" : undefined}
          data-testid="subjective-reveal-rubric"
        >
          {revealedRubric ? "채점기준 숨기기" : "채점기준 보기"}
          {!hasRubric ? " (미등록)" : ""}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => setShowScoreForm((v) => !v)}
          disabled={isSaving}
          data-testid="subjective-grade-toggle"
        >
          {showScoreForm ? "자기채점 닫기" : "자기채점 완료"}
        </Button>
      </div>

      {lastSaved?.submittedAt ? (
        <div className="border-foreground/10 text-muted-foreground rounded-md border-l-2 bg-emerald-50/40 px-3 py-2 text-xs dark:bg-emerald-950/20">
          <p>
            마지막 자기채점:{" "}
            <span className="text-foreground font-bold tabular-nums">
              {lastSaved.selfScore !== null ? `${lastSaved.selfScore}점` : "—"}
            </span>{" "}
            · {lastSaved.submittedAt.slice(0, 10)}
          </p>
          {lastSaved.selfScoreNote ? (
            <p className="mt-1 whitespace-pre-line">{lastSaved.selfScoreNote}</p>
          ) : null}
        </div>
      ) : null}

      <ReviewSection
        problemId={problemId}
        attempt={lastSaved}
        onUpdated={(att) => setLastSaved(att)}
      />


      {showScoreForm ? (
        <Card className="border-primary/40">
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              자기채점
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-16 shrink-0">
                점수 (0~100)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={scoreDraft}
                onChange={(e) => setScoreDraft(e.target.value)}
                placeholder="예: 75"
                className="border-input bg-background h-8 w-24 rounded-md border px-2 text-xs tabular-nums"
                data-testid="subjective-score-input"
              />
            </label>
            <label className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground mt-1 w-16 shrink-0">
                자기 평가
              </span>
              <textarea
                value={scoreNote}
                onChange={(e) => setScoreNote(e.target.value)}
                rows={3}
                placeholder="놓친 논점, 보완할 내용 등"
                className="border-input bg-background flex-1 rounded-md border px-2 py-1 text-xs"
                data-testid="subjective-score-note"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowScoreForm(false)}
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={onSubmitScore}
                disabled={isSaving}
                data-testid="subjective-score-submit"
              >
                저장
              </Button>
            </div>
            {submitFetcher.data && "error" in submitFetcher.data ? (
              <p className="text-rose-600 text-xs">
                {submitFetcher.data.error}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {revealedRubric && hasRubric ? (
        <Card className="border-dashed">
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              채점 기준
            </p>
          </CardHeader>
          <CardContent>
            <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
              {gradingRubricMd}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {revealedModel && hasModel ? (
        <Card className="border-dashed">
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              모범답안
            </p>
          </CardHeader>
          <CardContent>
            <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
              {modelAnswerMd}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {explanationMd ? (
        <Card className="border-dashed">
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              해설
            </p>
          </CardHeader>
          <CardContent>
            <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
              {explanationMd}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// 채점기준 체크리스트 (feat-4-A-322) — 학생이 자기 답안에서 충족한 항목 체크.
function RubricChecklist({
  items,
  checked,
  onToggle,
}: {
  items: { label: string; points: number }[];
  checked: Set<number>;
  onToggle: (i: number) => void;
}) {
  const total = items.reduce((s, it) => s + it.points, 0);
  const got = items.reduce(
    (s, it, i) => s + (checked.has(i) ? it.points : 0),
    0,
  );
  const pct = total > 0 ? Math.round((got / total) * 100) : 0;
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between text-xs">
          <p className="text-muted-foreground font-semibold tracking-wide uppercase">
            채점 체크리스트
          </p>
          <span className="tabular-nums">
            <span className="text-primary font-bold">{got}</span>
            <span className="text-muted-foreground"> / {total} 점</span>
            <span className="text-muted-foreground ml-2">({pct}%)</span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5" data-testid="rubric-checklist">
          {items.map((it, i) => {
            const isChecked = checked.has(i);
            return (
              <li key={i}>
                <label
                  className={cn(
                    "flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer transition-colors",
                    isChecked
                      ? "border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/30"
                      : "hover:bg-accent",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-3.5"
                    checked={isChecked}
                    onChange={() => onToggle(i)}
                    data-testid={`rubric-item-${i}`}
                  />
                  <span className="flex-1">
                    <span className={cn(isChecked && "line-through")}>{it.label}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {it.points}점
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// 첨삭 요청 / 결과 (feat-3-402). 자기채점 완료(submitted_at) 후에만 요청 가능.
function ReviewSection({
  problemId,
  attempt,
  onUpdated,
}: {
  problemId: string;
  attempt: SubjectiveAttempt | null;
  onUpdated: (a: SubjectiveAttempt) => void;
}) {
  const fetcher = useFetcher<{
    ok?: true;
    attempt?: SubjectiveAttempt;
    error?: string;
  }>();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok &&
      fetcher.data.attempt
    ) {
      onUpdated(fetcher.data.attempt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  if (!attempt) return null;
  const submitted = attempt.submittedAt !== null;
  const requested = attempt.reviewRequestedAt !== null;
  const completed = attempt.reviewCompletedAt !== null;
  const inFlight = fetcher.state !== "idle";
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const onRequest = () => {
    if (!submitted) return;
    if (!confirm("이 답안에 대해 강사 첨삭을 요청하시겠습니까?")) return;
    const fd = new FormData();
    fd.set("intent", "request");
    fd.set("problemId", problemId);
    fetcher.submit(fd, { method: "post", action: "/api/study/subjective-review" });
  };
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          강사 첨삭
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {!submitted ? (
          <p className="text-muted-foreground">
            자기채점 완료 후에 첨삭 요청이 가능합니다.
          </p>
        ) : completed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                첨삭 완료
              </Badge>
              <span className="text-muted-foreground">
                {attempt.reviewCompletedAt?.slice(0, 10)}
              </span>
              {attempt.reviewerScore !== null ? (
                <span className="ml-auto font-semibold tabular-nums">
                  강사 점수 {attempt.reviewerScore}점
                </span>
              ) : null}
            </div>
            {attempt.reviewerCommentMd ? (
              <p className="bg-muted/40 rounded p-2 whitespace-pre-line leading-relaxed">
                {attempt.reviewerCommentMd}
              </p>
            ) : (
              <p className="text-muted-foreground">
                코멘트 없이 점수만 등록되었습니다.
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={onRequest}
              disabled={inFlight}
            >
              재요청
            </Button>
          </div>
        ) : requested ? (
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary">검토 대기</Badge>
            <span className="text-muted-foreground">
              요청 시각 {attempt.reviewRequestedAt?.slice(0, 10)}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground">
              강사가 답안을 보고 점수·코멘트를 남깁니다.
            </p>
            <Button
              size="sm"
              className="ml-auto h-7"
              onClick={onRequest}
              disabled={inFlight}
              data-testid="subjective-request-review"
            >
              강사 첨삭 요청
            </Button>
          </div>
        )}
        {error ? <p className="text-rose-600">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function SubjectiveTimedBar({
  timedStartedAt,
  timedLimitMin,
  timedRemainSec,
  timedExpired,
  onStart,
  onCancel,
}: {
  timedStartedAt: number | null;
  timedLimitMin: number;
  timedRemainSec: number | null;
  timedExpired: boolean;
  onStart: (min: number) => void;
  onCancel: () => void;
}) {
  const [minInput, setMinInput] = useState<string>("30");
  if (timedExpired) {
    return (
      <div className="rounded-md border border-rose-500/40 bg-rose-50 px-3 py-2 text-xs dark:bg-rose-950/30">
        <p className="text-rose-700 dark:text-rose-300">
          ⏱ 시간 만료 — 답안이 자동 제출되었습니다 ({timedLimitMin}분 응시).
        </p>
      </div>
    );
  }
  if (timedStartedAt === null) {
    return (
      <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <TimerIcon className="size-3.5" /> 시험 모드
        </span>
        <label className="text-muted-foreground inline-flex items-center gap-1">
          제한 시간
          <input
            type="number"
            min={1}
            max={180}
            value={minInput}
            onChange={(e) => setMinInput(e.target.value)}
            className="border-input bg-background h-6 w-14 rounded-md border px-1 text-xs tabular-nums"
          />
          분
        </label>
        <Button
          size="sm"
          variant="default"
          className="h-7"
          onClick={() => {
            const m = Number(minInput);
            if (Number.isNaN(m) || m < 1 || m > 180) {
              alert("제한 시간은 1~180분 사이로 입력하세요.");
              return;
            }
            onStart(m);
          }}
          data-testid="subjective-timed-start"
        >
          시험 모드 시작
        </Button>
        <span className="text-muted-foreground ml-auto text-[11px]">
          시작하면 모범답안·채점기준이 잠깁니다.
        </span>
      </div>
    );
  }
  const m = Math.floor((timedRemainSec ?? 0) / 60);
  const s = (timedRemainSec ?? 0) % 60;
  const lowTime = (timedRemainSec ?? 0) <= 60;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs",
        lowTime
          ? "border-rose-500/60 bg-rose-50 dark:bg-rose-950/30"
          : "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30",
      )}
      data-testid="subjective-timed-bar"
    >
      <span className="inline-flex items-center gap-1 font-semibold">
        <TimerIcon className="size-3.5" /> 시험 모드 응시 중
      </span>
      <span className="font-mono text-base tabular-nums">
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </span>
      <span className="text-muted-foreground">/ {timedLimitMin}분</span>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-7"
        onClick={onCancel}
        data-testid="subjective-timed-cancel"
      >
        취소
      </Button>
    </div>
  );
}

function SavingStatus({
  isSaving,
  isDirty,
  updatedAt,
}: {
  isSaving: boolean;
  isDirty: boolean;
  updatedAt: string | null;
}) {
  if (isSaving) {
    return <span className="text-muted-foreground">저장 중…</span>;
  }
  if (isDirty) {
    return <span className="text-amber-600">미저장</span>;
  }
  if (updatedAt) {
    return (
      <span className="text-emerald-600">
        저장됨 · {updatedAt.slice(11, 16)}
      </span>
    );
  }
  return <span className="text-muted-foreground">미저장</span>;
}
