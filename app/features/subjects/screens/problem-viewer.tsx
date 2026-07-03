import type { Route } from "./+types/problem-viewer";

import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  FlagIcon,
  ListTreeIcon,
  PanelRightIcon,
  PencilIcon,
  ScrollTextIcon,
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
  useSearchParams,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { Separator } from "~/core/components/ui/separator";
import { SheetHeader, SheetTitle } from "~/core/components/ui/sheet";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { HighlightOverlay } from "~/features/annotations/components/highlight-overlay";
import { HighlightToolbar } from "~/features/annotations/components/highlight-toolbar";
import type { BookmarkRecord } from "~/features/annotations/labels";
import {
  getBookmark,
  getBookmarksByTargets,
  getUserArticleAnnotationCounts,
  getUserArticleBookmarkLevels,
  listHighlights,
  listMemos,
} from "~/features/annotations/queries.server";
import { listComments } from "~/features/comments/queries.server";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import {
  getLawByCode,
  getStaffRole,
  getSystematicSkeleton,
} from "~/features/laws/queries.server";
import { listLectureResources } from "~/features/lectures/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import { ProblemCodeChip } from "~/features/problems/components/problem-code-chip";
import { ReadingControls } from "~/features/study/components/study-font-control";
import { OxBookmarkToggle } from "~/features/problems/components/ox-bookmark-toggle";
import {
  FORMAT_LABEL,
  isOxEligible,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  SUBJECTIVE_KIND_LABEL,
} from "~/features/problems/labels";
import {
  deriveBoxItemOxTruth,
  deriveChoiceOxTruth,
} from "~/features/problems/lib/auto-ox";
import {
  type AdjacentProblem,
  type SystematicNodeProblemStat,
  getAdjacentProblems,
  getCasesCitedByProblem,
  getChoiceLinkRefs,
  getProblemById,
  getRelatedProblems,
  getSystematicNodeProblemSequence,
  getSystematicNodeProblemStats,
} from "~/features/problems/queries.server";
import { listThreadsForTarget } from "~/features/qna/queries.server";
import { FlowNav } from "~/features/study/components/flow-nav";
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_TONE,
} from "~/features/study/lib/difficulty";
import {
  type QuizMode,
  type SubjectiveAttempt,
  createQuizSession,
  getProblemStats,
  getQuizSession,
  getSubjectiveAttempt,
  recordStudySession,
} from "~/features/study/queries.server";
import {
  LeftPanelToggle,
  RightPanelToggle,
  panelGridCls,
  useLeftPanelCollapse,
  useRightPanelCollapse,
} from "~/features/subjects/components/left-panel-collapse";
import { MobileNavDrawer } from "~/features/subjects/components/mobile-nav-drawer";
import { ProblemSystematicTree } from "~/features/subjects/components/problem-systematic-tree";
import {
  SortAxisProvider,
  SortAxisToggle,
} from "~/features/subjects/components/sort-axis";
import { SubjectBookmarkRail } from "~/features/subjects/components/subject-bookmark-rail";
import { ViewerBackButton } from "~/features/subjects/components/viewer-back-button";
import {
  listDisplayedProblems,
  parseProblemFilters,
} from "~/features/subjects/lib/loader.server";
import { getSubjectAxisCounts } from "~/features/subjects/lib/loader.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

// 발문·해설에 markdown 이미지(![](url))·<img>·표(HTML <table> 또는 GFM 파이프표)가
// 있으면 MarkdownView 로 렌더(이미지·표·수식). 없으면 plain whitespace-pre-line.
// 파이프표 감지 = 구분선 `|---|` (\|[\s:]*-{3,}). mcq-pack-sheet 와 동일 규칙.
const MD_IMAGE_RE = /!\[[^\]]*\]\([^)]*\)|<(img|table|div)\b|\|[\s:]*-{3,}/i;

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "문제 | 리담변리사학원" }];
  return [
    {
      title: `${loaderData.subject.name} 객관식 #${loaderData.problem.problemNumber ?? "?"} | 리담변리사학원`,
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

  const url = new URL(request.url);
  const nodeId = url.searchParams.get("node");
  // ?list=1 — 학습과목 탭 목록에서 진입(색인 그룹 내 prev/next). 세션 러너가 아니라
  //   "현재 보고 있던 필터·정렬·단원 목록 순서" 그대로 인접 문제를 계산한다.
  const listMode = url.searchParams.get("list") === "1";
  const sessionIdParam = url.searchParams.get("session");
  const modeParam = url.searchParams.get("mode");
  const requestedMode: QuizMode = modeParam === "exam" ? "exam" : "study";

  // Phase A2 — problem/auth/law/nodeSequence 를 처음부터 모두 병렬 시작.
  // 각 promise 가 서로 독립이라 4 RTT 가 1 RTT 로 압축. 후속 분기 (session, redirect,
  // 12 병렬, choice ref) 는 이 결과들 의존이라 직렬 유지.
  const problemPromise = getProblemById(client, params.problemId);
  const authPromise = client.auth.getUser();
  const lawPromise = getLawByCode(client, lawCode);
  // list 모드에선 노드 시퀀스(세션 러너용)를 만들지 않는다 — 세션 자동생성을 피하고
  //   scoped adjacent(표시 목록 순서)로 prev/next 를 제공.
  const nodeSeqPromise =
    nodeId && !listMode
      ? getSystematicNodeProblemSequence(client, nodeId)
      : Promise.resolve(null);

  const problem = await problemPromise;
  if (!problem) {
    await Promise.allSettled([authPromise, lawPromise, nodeSeqPromise]);
    throw data("Problem not found", { status: 404 });
  }

  const {
    data: { user },
  } = await authPromise;
  if (!user) {
    await Promise.allSettled([lawPromise, nodeSeqPromise]);
    throw data("Unauthorized", { status: 401 });
  }

  const nodeSequence = await nodeSeqPromise;

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

  const law = await lawPromise;
  // Phase A2 — getSubjectAxisCounts 를 13 병렬에 합쳐 별도 RTT 1단 제거.
  //   (law 가 null 이면 axisCounts 도 lawId 없이 0 반환)
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
    problemComments,
    staffRole,
    adjacent,
    axisCounts,
    lectureResources,
    problemNodeStats,
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
    listComments(client, "problem", problem.problemId),
    getStaffRole(client, user.id),
    listMode
      ? Promise.resolve(null)
      : getAdjacentProblems(client, problem.problemId),
    law
      ? getSubjectAxisCounts(client, lawCode, law.lawId)
      : Promise.resolve({ articles: 0, cases: 0, problems: 0, subjective: 0 }),
    listLectureResources(client, "problem", problem.problemId),
    law
      ? getSystematicNodeProblemStats(client, lawCode)
      : Promise.resolve<Record<string, SystematicNodeProblemStat>>({}),
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

  // 정오문제 즐겨찾기 연동 — 선지/박스는 정오문제 패널과 같은 타깃(problem_choice/
  // problem_box_item)이라, 여기서 매긴 별이 패널에도 그대로 뜬다. 현재 별 레벨을 로드.
  const [oxChoiceBookmarks, oxBoxBookmarks] = await Promise.all([
    getBookmarksByTargets(
      client,
      user.id,
      "problem_choice",
      problem.choices.map((c) => c.choiceId),
    ),
    getBookmarksByTargets(
      client,
      user.id,
      "problem_box_item",
      problem.boxItems.map((b) => b.boxItemId),
    ),
  ]);
  // 선지/박스 즐겨찾기 전체 레코드(별 5단계 + 단계별 메모). 조문·문제 즐겨찾기와 동일 UI로
  // 팝오버에서 매길 수 있게 레벨만이 아니라 record 전체를 넘긴다.
  const oxBookmarks: Record<string, BookmarkRecord> = {
    ...oxChoiceBookmarks,
    ...oxBoxBookmarks,
  };
  // Map → 직렬화 가능한 plain object 로 변환 (loader return).
  const choiceArticleRefs: Record<
    string,
    { lawCode: string; pathSlug: string; displayLabel: string }
  > = {};
  for (const [k, v] of choiceLinkRefs.articles)
    choiceArticleRefs[k] = {
      lawCode: v.lawCode,
      pathSlug: v.pathSlug,
      displayLabel: v.displayLabel,
    };
  const choiceCaseRefs: Record<
    string,
    { lawCode: string; caseNumber: string; caseTitle: string }
  > = {};
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
  // feat-2-026 — 세션 생성처가 scopePayload 로 러너 라벨/복귀 경로를 지정할 수 있다(범용).
  //   복습 세션(source='srs')은 라벨="복습 풀이", 뒤로가기="/study/srs".
  const originLabelFromPayload =
    session && typeof session.scopePayload.originLabel === "string"
      ? session.scopePayload.originLabel
      : null;
  const backHrefFromPayload =
    session && typeof session.scopePayload.backHref === "string"
      ? session.scopePayload.backHref
      : null;
  const navLabel = session
    ? packTitleFromPayload
      ? `문제집: ${packTitleFromPayload}`
      : originLabelFromPayload
        ? originLabelFromPayload
        : typeof session.scopePayload.nodeLabel === "string"
          ? `체계: ${session.scopePayload.nodeLabel}`
          : session.scopeType === "filter"
            ? "맞춤 퀴즈"
            : session.scopeType === "wrong-note"
              ? "오답노트 풀이"
              : session.scopeType === "bookmark"
                ? "즐겨찾기 풀이"
                : "퀴즈 풀이"
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
  // node 세션 종료 후 복귀 시 문제 탭 체계도 필터(?node=)를 복원.
  const nodeIdForBack =
    nodeId ??
    (session && typeof session.scopePayload.nodeId === "string"
      ? session.scopePayload.nodeId
      : null);
  const navBackHref = backHrefFromPayload
    ? backHrefFromPayload
    : packIdFromPayload
      ? `/latest/mcq/${packIdFromPayload}`
      : navScopeType === "node"
        ? `/subjects/${lawCode}?tab=problems${nodeIdForBack ? `&node=${nodeIdForBack}` : ""}`
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

  // 색인 그룹 내 prev/next — ?list=1 이면 학습과목 탭의 표시 목록(필터·정렬·단원)을
  //   그대로 재현해 인접 문제를 계산(전역 기출순 getAdjacentProblems 대체).
  let adjacentNav = adjacent;
  let adjacentQuery = "";
  if (listMode) {
    const filters = parseProblemFilters(url);
    const displayed = await listDisplayedProblems(client, lawCode, filters, {
      userId: user.id,
      nodeId,
    });
    // 학습과목 탭은 객관식(1차)·2차 주관식을 별 섹션으로 나눠 표시 → 같은 차수 안에서만 prev/next.
    const cur = displayed.find((p) => p.problemId === problem.problemId);
    const scoped = cur
      ? displayed.filter((p) => p.examRound === cur.examRound)
      : displayed;
    const idx = scoped.findIndex((p) => p.problemId === problem.problemId);
    const toAdj = (
      p: (typeof scoped)[number] | undefined,
    ): AdjacentProblem | null =>
      p
        ? {
            problemId: p.problemId,
            year: p.year,
            problemNumber: p.problemNumber,
            origin: p.origin,
          }
        : null;
    adjacentNav =
      idx >= 0
        ? { prev: toAdj(scoped[idx - 1]), next: toAdj(scoped[idx + 1]) }
        : { prev: null, next: null };
    // prev/next 가 같은 색인 컨텍스트를 이어가도록 쿼리 보존(list + node + p_*).
    const sp = new URLSearchParams(url.search);
    sp.delete("session");
    sp.delete("mode");
    adjacentQuery = sp.toString() ? `?${sp.toString()}` : "";
  }

  return {
    subject: LAW_SUBJECTS[lawCode],
    axisCounts,
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
    oxBookmarks,
    subjectiveAttempt,
    problemComments,
    canEditComment: staffRole !== null,
    isStaff: staffRole !== null,
    isAdmin: staffRole === "admin",
    currentUserId: user.id,
    adjacent: adjacentNav,
    adjacentQuery,
    lectureResources,
    problemNodeStats,
    activeNodeId: nodeId,
  };
}

// problem_case_links 의 pc_relation_type → article_case_links 의 ac_relation_type 매핑
// (ArticleRightPanel 의 "판례" 탭 라벨 호환).
const PC_TO_AC: Record<
  string,
  "directly_interprets" | "cites" | "similar_to" | "contrary_to"
> = {
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
    collapsed: leftCollapsed,
    toggle: toggleLeft,
    set: setLeft,
  } = useLeftPanelCollapse();
  const {
    collapsed: rightCollapsed,
    toggle: toggleRight,
    set: setRight,
  } = useRightPanelCollapse();
  // 읽기 모드 — 좌우 패널 동시 접기/펼치기(데스크톱 정독 집중).
  const readingMode = leftCollapsed && rightCollapsed;
  const toggleReadingMode = () => {
    const next = !readingMode;
    setLeft(next);
    setRight(next);
  };
  const {
    subject,
    problem,
    qnaThreads,
    systematicNodes,
    problemNodeStats,
    activeNodeId,
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
    oxBookmarks,
    subjectiveAttempt,
    problemComments,
    canEditComment,
    isStaff,
    isAdmin,
    currentUserId,
    adjacent,
    adjacentQuery,
    lectureResources,
  } = loaderData;
  // 주관식 문제면 레일 활성 축·"목록으로" 복귀 탭을 주관식으로.
  const isSubjectiveProblem = problem.format === "subjective";
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [searchParams] = useSearchParams();
  // feat-2-026 Stage 3 — 보기 모드(답 없이 정답·해설 읽기, 오답 다시보기). ?view=1 딥링크 진입 가능.
  // 세션 내 문제 이동 시에도 유지(문제 바뀌어도 reset 안 함) — 묶음을 읽기로 훑는 흐름.
  const [viewMode, setViewMode] = useState(
    () => searchParams.get("view") === "1",
  );
  const startedAtRef = useRef<number>(Date.now());
  const attemptFetcher = useFetcher();
  const completeFetcher = useFetcher();
  const recordedKeyRef = useRef<string | null>(null);
  const navigate = useNavigate();

  const sessionMode: QuizMode = runnerNav?.mode ?? "study";
  const inSession = runnerNav !== null;
  const isExam = sessionMode === "exam";
  // 채점 후 OR 보기 모드 → 정답·해설 노출(시험 모드 제외).
  const showAnswers = (revealed || viewMode) && !isExam;

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
    <div className="bg-background min-h-[calc(100vh-3.5rem)] font-sans">
      <FlowNav
        subjectSlug={subject.slug}
        currentType="problem"
        currentId={problem.problemId}
      />
      <HighlightToolbar targetType="problem" targetId={problem.problemId} />

      {/* Session top-bar — shown only when inside a session/runner nav */}
      {runnerNav ? (
        <div className="border-border bg-card/80 sticky top-0 z-20 border-b backdrop-blur-sm md:top-14">
          <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-2 px-4 py-2 md:px-6">
            <Link
              to={runnerNav.backHref}
              viewTransition
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
            >
              <ArrowLeftIcon className="size-3.5" />
              {runnerNav.label}
            </Link>
            <span className="text-border mx-1 select-none">·</span>
            {/* Mode pill */}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                isExam
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  : "bg-primary/10 text-link",
              )}
            >
              {isExam ? "시험 모드" : "학습 모드"}
            </span>
            {/* Exam timer */}
            {timerText ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums",
                  parseInt(timerText.replace(":", "")) <= 100
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200",
                )}
                data-testid="exam-timer"
              >
                <TimerIcon className="size-3" />
                {timerText}
              </span>
            ) : null}
            {/* Progress count */}
            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
              {runnerNav.index + 1} / {runnerNav.total}
            </span>
            {/* Prev/Next — only in study mode */}
            {!isExam ? (
              <>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={!runnerNav.prevId}
                  className="h-9 rounded-full text-xs sm:h-7"
                >
                  {runnerNav.prevId ? (
                    <Link to={buildRunnerHref(runnerNav.prevId)} viewTransition>
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
                  className="h-9 rounded-full text-xs sm:h-7"
                >
                  {runnerNav.nextId ? (
                    <Link to={buildRunnerHref(runnerNav.nextId)} viewTransition>
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
                className="h-7 rounded-full text-xs"
                onClick={completeSession}
                disabled={completeFetcher.state !== "idle"}
                data-testid="finish-session"
              >
                <FlagIcon className="size-3.5" /> 끝내기
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        /* No session: simple back link row */
        <div className="mx-auto flex max-w-screen-2xl items-center gap-2 px-4 py-3 md:px-6">
          <ViewerBackButton
            listHref={`/subjects/${subject.slug}?tab=${isSubjectiveProblem ? "subjective" : "problems"}`}
            listLabel={`${subject.name} ${isSubjectiveProblem ? "주관식" : "객관식"} 색인`}
          />
          {/* 질문하기는 우측 Q&A 패널과 중복이라 제거(feat-9 통합). */}
        </div>
      )}

      {/* 책갈피 레일 + 3-pane shell: left tree 260 / body / right panel 320 */}
      <div className="mx-auto flex max-w-screen-2xl flex-row items-start gap-0 px-0">
        <SubjectBookmarkRail
          subjectSlug={subject.slug}
          active={isSubjectiveProblem ? "subjective" : "problems"}
          counts={loaderData.axisCounts}
          showSubjective={isStaff}
          className="lg:sticky lg:top-[calc(3.5rem+41px)]"
        />
        <div
          className={`grid min-w-0 flex-1 gap-0 ${panelGridCls(leftCollapsed, rightCollapsed)}`}
        >
          {/* Left tree — desktop sticky, 접기/펼치기. 문제는 체계도 고정
              (SortAxisProvider forced — 조문 leaf 로 이동해도 조문 뷰어가 체계도 유지). */}
          <aside className="lg:border-border hidden lg:sticky lg:top-[calc(3.5rem+41px)] lg:block lg:max-h-[calc(100vh-3.5rem-41px)] lg:overflow-y-auto lg:border-r">
            <SortAxisProvider forced="systematic">
              {leftCollapsed ? (
                <div className="flex justify-center py-3">
                  <LeftPanelToggle collapsed onToggle={toggleLeft} />
                </div>
              ) : (
                <>
                  {/* 토글 행 — [접기][체계도/조문(조문 비활성)]. 스크롤해도 상단 고정. */}
                  <div className="bg-background sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2">
                    <LeftPanelToggle collapsed={false} onToggle={toggleLeft} />
                    <SortAxisToggle size="sm" disabledAxes={["statutory"]} />
                  </div>
                  {systematicEmpty ? (
                    <p className="text-muted-foreground px-4 py-6 text-xs">
                      체계도 데이터 미입력
                    </p>
                  ) : (
                    <ProblemSystematicTree
                      nodes={systematicNodes}
                      nodeStats={problemNodeStats}
                      activeNodeId={activeNodeId ?? undefined}
                      linkBase={`/subjects/${subject.slug}`}
                    />
                  )}
                </>
              )}
            </SortAxisProvider>
          </aside>

          {/* Center body */}
          <main className="border-border min-w-0 border-r">
            {/* Mobile drawer triggers */}
            <div className="border-border flex flex-wrap gap-2 border-b px-4 py-2 lg:hidden">
              <MobileNavDrawer
                side="left"
                contentClassName="w-[320px] overflow-y-auto p-0 sm:max-w-[360px]"
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full text-xs"
                    data-testid="open-tree-drawer"
                  >
                    <ListTreeIcon className="size-3.5" /> 체계도 트리
                  </Button>
                }
              >
                <SheetHeader className="border-border border-b px-4 py-3">
                  <SheetTitle className="text-sm font-semibold">
                    체계도 트리
                  </SheetTitle>
                </SheetHeader>
                <div className="px-3 pb-4">
                  {systematicEmpty ? (
                    <p className="text-muted-foreground px-2 py-4 text-xs">
                      체계도 데이터 미입력
                    </p>
                  ) : (
                    <ProblemSystematicTree
                      nodes={systematicNodes}
                      nodeStats={problemNodeStats}
                      activeNodeId={activeNodeId ?? undefined}
                      linkBase={`/subjects/${subject.slug}`}
                    />
                  )}
                </div>
              </MobileNavDrawer>
              <MobileNavDrawer
                side="right"
                contentClassName="w-[340px] overflow-y-auto p-0 sm:max-w-[380px]"
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full text-xs"
                    data-testid="open-right-drawer"
                  >
                    <PanelRightIcon className="size-3.5" /> 학습 보조
                  </Button>
                }
              >
                <SheetHeader className="border-border border-b px-4 py-3">
                  <SheetTitle className="text-sm font-semibold">
                    학습 보조
                  </SheetTitle>
                </SheetHeader>
                <div className="px-3 pb-4">
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
                    comments={problemComments}
                    canEditComment={canEditComment}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    viewerIsStaff={canEditComment}
                    importance={problem.importance}
                    lectureResources={lectureResources}
                  />
                </div>
              </MobileNavDrawer>
            </div>

            {/* Problem article — generous reading measure */}
            <article
              className={cn(
                "mx-auto px-6 py-8 pb-16 md:px-10",
                // 패널(좌/우 중 하나라도) 접힘 → 본문을 넓혀 빈 공간 활용(760=3패널 기본).
                leftCollapsed || rightCollapsed
                  ? "max-w-[1080px]"
                  : "max-w-[760px]",
              )}
            >
              {/* Exam mode timer banner */}
              {isExam && timerText ? (
                <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-2.5 dark:border-amber-700/40 dark:bg-amber-950/30">
                  <TimerIcon className="size-4 text-amber-600 dark:text-amber-400" />
                  <span
                    className="font-mono text-sm font-bold text-amber-700 tabular-nums dark:text-amber-300"
                    data-testid="exam-timer-banner"
                  >
                    남은 시간 {timerText}
                  </span>
                </div>
              ) : null}

              {/* Problem header */}
              <div className="mb-6">
                {/* Prev / Next — 조문·판례 뷰어와 동일 위치(헤더 첫 줄). */}
                {adjacent && (adjacent.prev || adjacent.next) ? (
                  <div className="border-border/40 mb-3 flex items-center justify-end gap-2 border-b pb-3">
                    <ProblemPrevNextButton
                      direction="prev"
                      target={adjacent.prev}
                      subjectSlug={subject.slug}
                      query={adjacentQuery}
                    />
                    <ProblemPrevNextButton
                      direction="next"
                      target={adjacent.next}
                      subjectSlug={subject.slug}
                      query={adjacentQuery}
                    />
                  </div>
                ) : null}
                {/* Chips row */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <ProblemCodeChip displayNo={problem.displayNo} />
                  <span className="bg-muted text-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold">
                    {ORIGIN_LABEL[problem.origin]}
                  </span>
                  <span className="border-border text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs">
                    {FORMAT_LABEL[problem.format]}
                  </span>
                  {problem.polarity ? (
                    <span className="border-border text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs">
                      {POLARITY_LABEL[problem.polarity]}
                    </span>
                  ) : null}
                  {problem.scope ? (
                    <span className="border-border text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs">
                      {SCOPE_LABEL[problem.scope]}
                    </span>
                  ) : null}
                  {problem.subjectiveKind ? (
                    <span className="bg-muted text-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold">
                      {SUBJECTIVE_KIND_LABEL[problem.subjectiveKind]}
                    </span>
                  ) : null}
                  {problem.year ? (
                    <span
                      className={cn(
                        "text-muted-foreground text-xs tabular-nums",
                        canEditComment ? "" : "ml-auto",
                      )}
                    >
                      {problem.year}년
                      {problem.examRoundNo ? ` ${problem.examRoundNo}회` : ""}
                      {problem.problemNumber
                        ? ` · 문제 ${problem.problemNumber}번`
                        : ""}
                    </span>
                  ) : null}
                  {/* 운영자 — 문제·해설 수정 (staff 전용). case-viewer 의 헤더
                      메타 줄 수정 버튼과 동일 위치 패턴. */}
                  {canEditComment ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-7 gap-1 text-xs",
                        problem.year ? "" : "ml-auto",
                      )}
                    >
                      <Link
                        to={`/admin/problems/${problem.problemId}?returnTo=${encodeURIComponent(
                          `/subjects/${subject.slug}/problems/${problem.problemId}`,
                        )}`}
                      >
                        <PencilIcon className="size-3" /> 수정
                      </Link>
                    </Button>
                  ) : null}
                </div>

                {/* Stats row */}
                <div
                  className="flex flex-wrap items-center gap-2 text-xs"
                  data-testid="problem-stats"
                >
                  {problemStats.bucket && problemStats.accuracyPct !== null ? (
                    <>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          DIFFICULTY_TONE[problemStats.bucket],
                        )}
                      >
                        {DIFFICULTY_LABEL[problemStats.bucket]}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        정답률 {problemStats.accuracyPct}% · 시도{" "}
                        {problemStats.attempts.toLocaleString("ko-KR")}회 ·
                        응시자 {problemStats.distinctUsers}명
                      </span>
                    </>
                  ) : problemStats.attempts > 0 ? (
                    <span className="text-muted-foreground">
                      시도 {problemStats.attempts}회 (난이도 표본 부족 · 5회
                      이상부터)
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      아직 풀이 데이터가 없습니다
                    </span>
                  )}
                  {problem.videoUrl ? (
                    <a
                      href={problem.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="border-border text-link hover:bg-muted ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
                      data-testid="problem-video-link"
                      title="강사 풀이 동영상 (외부 링크)"
                    >
                      <VideoIcon className="size-3" /> 동영상 풀이 보기
                    </a>
                  ) : null}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleReadingMode}
                      aria-pressed={readingMode}
                      title="읽기 모드 — 좌우 패널 접고 본문 집중"
                      className={cn(
                        "hidden h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors lg:inline-flex",
                        readingMode
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <ScrollTextIcon className="size-3.5" /> 읽기 모드
                    </button>
                    <ReadingControls />
                  </div>
                </div>
              </div>

              <Separator className="mb-7" />

              {/* Question stem — 하이라이트 오버레이가 본문 선택 툴바의 컨테이너 역할을 겸한다. */}
              <HighlightOverlay
                fieldPath="problem.body"
                targetType="problem"
                targetId={problem.problemId}
                highlights={highlights}
                viewerIsStaff={canEditComment}
              >
                {MD_IMAGE_RE.test(problem.bodyMd) ? (
                  <div className="mb-7 text-[length:calc(17px*var(--study-fs))] leading-[1.8] font-medium dark:[&_img]:brightness-[.8]">
                    <MarkdownView
                      text={problem.bodyMd}
                      className="text-[length:calc(17px*var(--study-fs))]"
                    />
                  </div>
                ) : (
                  <p className="text-foreground mb-7 text-[length:calc(17px*var(--study-fs))] leading-[1.8] font-medium tracking-[-0.01em] whitespace-pre-line">
                    {problem.bodyMd}
                  </p>
                )}
              </HighlightOverlay>

              {problem.boxItems.length > 0 ? (
                <div className="border-border/70 bg-muted/30 dark:bg-muted/10 mb-6 rounded-xl border-2 px-5 py-4">
                  <ul className="space-y-2">
                    {problem.boxItems.map((bi) => (
                      <li
                        key={bi.boxItemId}
                        className="text-foreground flex gap-3 text-[length:calc(15px*var(--study-fs))] leading-[1.7] tracking-[-0.005em]"
                      >
                        <span className="text-foreground/70 shrink-0 font-semibold">
                          {bi.marker}
                        </span>
                        <span className="flex-1 whitespace-pre-line">
                          {bi.bodyMd}
                        </span>
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
                  {/* Choices */}
                  <ul className="mb-5 flex flex-col gap-2.5">
                    {problem.choices.map((c) => {
                      const isSelected = selected === c.choiceIndex;
                      // 시험 모드에서는 채점 결과 노출 X.
                      const showCorrect = showAnswers && c.isCorrect;
                      const showWrong =
                        showAnswers && isSelected && !c.isCorrect;
                      const locked = showAnswers;
                      return (
                        <li key={c.choiceId}>
                          <div
                            role="button"
                            tabIndex={locked ? -1 : 0}
                            data-testid={`problem-choice-${c.choiceIndex}`}
                            aria-pressed={isSelected}
                            aria-disabled={locked}
                            onClick={() => {
                              if (locked) return;
                              // 선지 텍스트를 드래그 선택(하이라이트) 중이면 답 선택하지 않음.
                              const sel = window.getSelection();
                              if (
                                sel &&
                                !sel.isCollapsed &&
                                sel.toString().trim()
                              )
                                return;
                              setSelected(c.choiceIndex);
                            }}
                            onKeyDown={(e) => {
                              if (locked) return;
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelected(c.choiceIndex);
                              }
                            }}
                            className={cn(
                              "focus-visible:ring-primary/40 flex w-full items-start gap-3 rounded-[10px] border px-4 py-3.5 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:outline-none",
                              locked
                                ? "cursor-default"
                                : "hover:border-primary/40 hover:bg-primary/5 cursor-pointer",
                              isSelected &&
                                !locked &&
                                "border-primary bg-primary/10 ring-primary/30 ring-1",
                              showCorrect &&
                                "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400/40 dark:bg-emerald-950/30",
                              showWrong &&
                                "border-rose-500 bg-rose-50 ring-1 ring-rose-400/40 dark:bg-rose-950/30",
                            )}
                          >
                            {/* Number badge */}
                            <span
                              className={cn(
                                "inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold tabular-nums transition-colors",
                                isSelected && !locked
                                  ? "bg-primary text-primary-foreground"
                                  : showCorrect
                                    ? "bg-emerald-500 text-white"
                                    : showWrong
                                      ? "bg-rose-500 text-white"
                                      : "bg-muted text-foreground/70",
                              )}
                            >
                              {c.choiceIndex}
                            </span>
                            {/* 선지 텍스트 — 조문/판례 본문처럼 하이라이트 가능. 선지별 fieldPath. */}
                            <HighlightOverlay
                              className="text-foreground min-w-0 flex-1 text-[length:calc(15px*var(--study-fs))] leading-[1.65] tracking-[-0.005em] whitespace-pre-line"
                              fieldPath={`problem.choice.${c.choiceIndex}`}
                              targetType="problem"
                              targetId={problem.problemId}
                              highlights={highlights}
                              viewerIsStaff={canEditComment}
                            >
                              {c.bodyMd}
                            </HighlightOverlay>
                            {showCorrect ? (
                              <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-emerald-500" />
                            ) : null}
                            {showWrong ? (
                              <CircleXIcon className="mt-0.5 size-5 shrink-0 text-rose-500" />
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {isExam ? (
                      isLast ? (
                        <Button
                          onClick={completeSession}
                          disabled={
                            selected === null ||
                            completeFetcher.state !== "idle"
                          }
                          className="rounded-full"
                          data-testid="exam-finish"
                        >
                          <FlagIcon className="size-4" /> 시험 끝내기 · 결과
                          보기
                        </Button>
                      ) : (
                        <Button
                          onClick={goNext}
                          disabled={selected === null}
                          className="rounded-full"
                          data-testid="exam-next"
                        >
                          다음 문제 <ChevronRightIcon className="size-4" />
                        </Button>
                      )
                    ) : viewMode ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setViewMode(false);
                            reset();
                          }}
                          className="rounded-full"
                        >
                          직접 풀기
                        </Button>
                        {runnerNav?.nextId ? (
                          <Button asChild className="rounded-full">
                            <Link
                              to={buildRunnerHref(runnerNav.nextId)}
                              viewTransition
                            >
                              다음 문제 <ChevronRightIcon className="size-4" />
                            </Link>
                          </Button>
                        ) : null}
                      </>
                    ) : !revealed ? (
                      <>
                        <Button
                          onClick={submitStudy}
                          disabled={selected === null}
                          className="rounded-full"
                        >
                          정답 확인 (학습 모드)
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setViewMode(true)}
                          className="rounded-full"
                        >
                          답 없이 해설 보기
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          onClick={reset}
                          className="rounded-full"
                        >
                          다시 풀기
                        </Button>
                        {runnerNav?.nextId ? (
                          <Button asChild className="rounded-full">
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

                  {/* Explanation + O/X panel — after submit in study mode */}
                  {showAnswers ? (
                    <div className="mt-7 space-y-4">
                      {/* Verdict pill — 채점(선택 있음)=정/오, 보기 모드(미선택)=정답만. */}
                      {(() => {
                        // 복수정답 지원 — 정답 지문 전부 표시.
                        const correctIndexes = problem.choices
                          .filter((c) => c.isCorrect)
                          .map((c) => c.choiceIndex);
                        const answerSuffix =
                          correctIndexes.length > 0
                            ? `정답 ${correctIndexes.join(", ")}번`
                            : "";
                        const judged = revealed && selected !== null;
                        if (!judged) {
                          // 보기 모드 — 정/오 판정 없이 정답만 안내.
                          return (
                            <div className="flex items-center gap-3">
                              <span className="bg-primary/10 text-link inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold">
                                {answerSuffix || "해설"}
                              </span>
                            </div>
                          );
                        }
                        const isCorrectAns =
                          problem.choices.find(
                            (c) => c.choiceIndex === selected,
                          )?.isCorrect ?? false;
                        return (
                          <div className="flex items-center gap-3">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
                                isCorrectAns
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
                              )}
                            >
                              {isCorrectAns ? (
                                <CircleCheckIcon className="size-4" />
                              ) : (
                                <CircleXIcon className="size-4" />
                              )}
                              {isCorrectAns ? "정답입니다" : "오답입니다"}
                              {answerSuffix ? ` · ${answerSuffix}` : ""}
                            </span>
                          </div>
                        );
                      })()}

                      {/* 종합 해설 — 문제 전체 해설(problem.explanationMd). 지문별 O/X 위에 노출.
                          (mcq-pack-sheet ExplanationBlock 과 동일 필드 — 학습과목 MCQ 뷰어에 누락돼 있었음) */}
                      {problem.explanationMd ? (
                        <div className="border-border bg-card rounded-xl border shadow-sm">
                          <div className="border-border border-b px-5 py-3">
                            <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
                              종합 해설
                            </p>
                          </div>
                          {MD_IMAGE_RE.test(problem.explanationMd) ? (
                            <div className="px-5 py-5 text-[length:calc(16px*var(--study-fs))] leading-[1.85] dark:[&_img]:brightness-[.8]">
                              <MarkdownView
                                text={problem.explanationMd}
                                className="text-[length:calc(16px*var(--study-fs))] leading-[1.85]"
                              />
                            </div>
                          ) : (
                            <div className="px-5 py-5 text-[length:calc(16px*var(--study-fs))] leading-[1.85] whitespace-pre-line">
                              {problem.explanationMd}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Per-choice explanation cards */}
                      <div className="border-border bg-card rounded-xl border shadow-sm">
                        <div className="border-border border-b px-5 py-3">
                          <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
                            해설 —{" "}
                            {problem.format === "mc_box" ? "박스 항목" : "지문"}
                            별 O/X
                          </p>
                        </div>
                        <div className="divide-border divide-y">
                          {problem.boxItems.length > 0
                            ? (() => {
                                const correctChoiceBody =
                                  problem.choices.find((c) => c.isCorrect)
                                    ?.bodyMd ?? null;
                                return problem.boxItems.map((bi) => {
                                  // oxIneligible(조문 OX드릴 부적합 표시)는 MCQ 해설 O/X 표시엔
                                  // 무시 — 풀이 학습에 도움. (OX 드릴 쿼리는 계속 oxIneligible 존중)
                                  const truth: "O" | "X" | null =
                                    bi.oxTruth ??
                                    deriveBoxItemOxTruth({
                                      polarity: problem.polarity,
                                      format: problem.format,
                                      marker: bi.marker,
                                      correctChoiceBody,
                                      oxIneligible: false,
                                    });
                                  return (
                                    <div
                                      key={bi.boxItemId}
                                      className="flex items-start gap-3 px-5 py-3 text-[length:calc(15px*var(--study-fs))] leading-[1.7]"
                                    >
                                      <span
                                        className={cn(
                                          "inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                                          truth === "O"
                                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                                            : truth === "X"
                                              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                                              : "bg-muted text-muted-foreground",
                                        )}
                                      >
                                        {bi.marker}
                                      </span>
                                      <div className="flex-1 space-y-1 leading-relaxed">
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
                                        <OxBookmarkToggle
                                          refType="box"
                                          refId={bi.boxItemId}
                                          initial={
                                            oxBookmarks[bi.boxItemId] ?? null
                                          }
                                          eligible={isOxEligible(
                                            bi.oxTruth,
                                            bi.oxIneligible,
                                          )}
                                        />
                                      </div>
                                    </div>
                                  );
                                });
                              })()
                            : null}
                          {/* 박스형(사례박스 포함)은 verdict("정답 N번")·박스 O/X 로 충분 →
                              중복되는 '정답 보기' 선지 목록 생략. 비박스만 선지별 O/X·해설 노출. */}
                          {problem.boxItems.length === 0 &&
                            problem.choices.map((c) => {
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
                                      // oxIneligible 은 MCQ 해설 O/X 표시엔 무시(OX드릴만 존중).
                                      oxIneligible: false,
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
                                  className="flex items-start gap-3 px-5 py-3 text-[length:calc(15px*var(--study-fs))] leading-[1.7]"
                                >
                                  <span
                                    className={cn(
                                      "inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums",
                                      tone,
                                    )}
                                  >
                                    {c.choiceIndex}
                                  </span>
                                  <div className="flex-1 space-y-1 leading-relaxed">
                                    <p>
                                      <span className="font-semibold">
                                        {label || "—"}
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
                                          ? choiceArticleRefs[
                                              c.relatedArticleId
                                            ]
                                          : null;
                                        if (articleRef) {
                                          return (
                                            <Link
                                              to={`/subjects/${articleRef.lawCode}/articles/${articleRef.pathSlug}`}
                                              viewTransition
                                              prefetch="intent"
                                              data-testid="choice-related-article"
                                              className="border-primary/30 bg-primary/10 text-link hover:bg-primary/20 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
                                            >
                                              조문 {articleRef.displayLabel}
                                            </Link>
                                          );
                                        }
                                        if (c.relatedArticleId) {
                                          return (
                                            <span className="border-border text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs">
                                              조문{" "}
                                              {c.relatedArticleNumber ?? "—"}
                                            </span>
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
                                              prefetch="intent"
                                              data-testid="choice-related-case"
                                              className="inline-flex items-center gap-1 rounded-full border border-violet-300/50 bg-violet-50 px-2.5 py-0.5 text-xs text-violet-700 hover:bg-violet-100 dark:border-violet-700/40 dark:bg-violet-950/30 dark:text-violet-300"
                                            >
                                              판례 {caseRef.caseNumber}
                                            </Link>
                                          );
                                        }
                                        if (c.relatedCaseId) {
                                          return (
                                            <span className="border-border text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs">
                                              판례 {c.relatedCaseNumber ?? "—"}
                                            </span>
                                          );
                                        }
                                        return null;
                                      })()}
                                      <OxBookmarkToggle
                                        refType="choice"
                                        refId={c.choiceId}
                                        initial={
                                          oxBookmarks[c.choiceId] ?? null
                                        }
                                        eligible={isOxEligible(
                                          c.oxTruth,
                                          c.oxIneligible,
                                        )}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </article>
          </main>

          {/* Right panel — desktop sticky, 접기/펼치기 */}
          <aside className="hidden lg:sticky lg:top-[calc(3.5rem+41px)] lg:block lg:max-h-[calc(100vh-3.5rem-41px)] lg:overflow-y-auto">
            {rightCollapsed ? (
              <div className="flex justify-center py-3">
                <RightPanelToggle collapsed onToggle={toggleRight} />
              </div>
            ) : (
              <>
                {/* 토글 — 패널을 스크롤해도 상단 고정(sticky top-0). */}
                <div className="bg-background sticky top-0 z-10 flex px-3 py-2">
                  <RightPanelToggle collapsed={false} onToggle={toggleRight} />
                </div>
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
                  comments={problemComments}
                  canEditComment={canEditComment}
                  currentUserId={currentUserId}
                  lectureResources={lectureResources}
                  isAdmin={isAdmin}
                  viewerIsStaff={canEditComment}
                  importance={problem.importance}
                />
              </>
            )}
          </aside>
        </div>
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
  const [lastSaved, setLastSaved] = useState<SubjectiveAttempt | null>(
    initialAttempt,
  );
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
    <div className="space-y-5">
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
          if (
            confirm(
              "시험 모드를 취소하시겠습니까? 작성한 답안은 그대로 유지됩니다.",
            )
          ) {
            setTimedStartedAt(null);
            setTimedExpired(false);
          }
        }}
      />

      {/* Answer textarea */}
      <div className="border-border bg-card rounded-xl border shadow-sm">
        <div className="border-border flex items-center justify-between border-b px-5 py-3">
          <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
            답안 작성 (자동 저장)
          </p>
          <SavingStatus
            isSaving={isSaving}
            isDirty={isDirty}
            updatedAt={lastSaved?.updatedAt ?? null}
          />
        </div>
        <div className="p-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            placeholder="목차를 잡고 본문을 작성해보세요. 작성 중 1.5초 정지 시 자동 저장됩니다."
            className="border-input bg-background focus:ring-primary/30 w-full rounded-lg border px-4 py-3 text-sm leading-[1.8] tracking-[-0.005em] focus:ring-2 focus:outline-none"
            data-testid="subjective-answer-draft"
          />
          <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
            {draft.length}자
          </p>
        </div>
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
          className="rounded-full"
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
          className="rounded-full"
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
          className="rounded-full"
          data-testid="subjective-grade-toggle"
        >
          {showScoreForm ? "자기채점 닫기" : "자기채점 완료"}
        </Button>
      </div>

      {lastSaved?.submittedAt ? (
        <div className="rounded-xl border border-emerald-300/50 bg-emerald-50/60 px-4 py-3 text-xs dark:border-emerald-700/40 dark:bg-emerald-950/20">
          <p className="text-muted-foreground">
            마지막 자기채점:{" "}
            <span className="text-foreground font-bold tabular-nums">
              {lastSaved.selfScore !== null ? `${lastSaved.selfScore}점` : "—"}
            </span>{" "}
            · {lastSaved.submittedAt.slice(0, 10)}
          </p>
          {lastSaved.selfScoreNote ? (
            <p className="text-muted-foreground mt-1 whitespace-pre-line">
              {lastSaved.selfScoreNote}
            </p>
          ) : null}
        </div>
      ) : null}

      <ReviewSection
        problemId={problemId}
        attempt={lastSaved}
        onUpdated={(att) => setLastSaved(att)}
      />

      {showScoreForm ? (
        <div className="border-primary/30 bg-card rounded-xl border shadow-sm">
          <div className="border-border border-b px-5 py-3">
            <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
              자기채점
            </p>
          </div>
          <div className="space-y-3 p-5">
            <label className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground w-20 shrink-0">
                점수 (0~100)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={scoreDraft}
                onChange={(e) => setScoreDraft(e.target.value)}
                placeholder="예: 75"
                className="border-input bg-background focus:ring-primary/30 h-8 w-24 rounded-lg border px-2 text-xs tabular-nums focus:ring-2 focus:outline-none"
                data-testid="subjective-score-input"
              />
            </label>
            <label className="flex items-start gap-3 text-xs">
              <span className="text-muted-foreground mt-1 w-20 shrink-0">
                자기 평가
              </span>
              <textarea
                value={scoreNote}
                onChange={(e) => setScoreNote(e.target.value)}
                rows={3}
                placeholder="놓친 논점, 보완할 내용 등"
                className="border-input bg-background focus:ring-primary/30 flex-1 rounded-lg border px-3 py-2 text-xs leading-relaxed focus:ring-2 focus:outline-none"
                data-testid="subjective-score-note"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => setShowScoreForm(false)}
              >
                취소
              </Button>
              <Button
                size="sm"
                className="rounded-full"
                onClick={onSubmitScore}
                disabled={isSaving}
                data-testid="subjective-score-submit"
              >
                저장
              </Button>
            </div>
            {submitFetcher.data && "error" in submitFetcher.data ? (
              <p className="text-xs text-rose-600">
                {submitFetcher.data.error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {revealedRubric && hasRubric ? (
        <div className="border-border bg-card rounded-xl border shadow-sm">
          <div className="border-border border-b px-5 py-3">
            <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
              채점 기준
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-foreground text-sm leading-[1.8] tracking-[-0.005em] whitespace-pre-line">
              {gradingRubricMd}
            </p>
          </div>
        </div>
      ) : null}

      {revealedModel && hasModel ? (
        <div className="border-border bg-card rounded-xl border shadow-sm">
          <div className="border-border border-b px-5 py-3">
            <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
              모범답안
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-foreground text-sm leading-[1.8] tracking-[-0.005em] whitespace-pre-line">
              {modelAnswerMd}
            </p>
          </div>
        </div>
      ) : null}

      {explanationMd ? (
        <div className="border-border bg-card rounded-xl border shadow-sm">
          <div className="border-border border-b px-5 py-3">
            <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
              해설
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-foreground text-sm leading-[1.8] tracking-[-0.005em] whitespace-pre-line">
              {explanationMd}
            </p>
          </div>
        </div>
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
    <div className="border-primary/30 bg-card rounded-xl border shadow-sm">
      <div className="border-border flex items-center justify-between border-b px-5 py-3">
        <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
          채점 체크리스트
        </p>
        <span className="text-xs tabular-nums">
          <span className="text-link font-bold">{got}</span>
          <span className="text-muted-foreground"> / {total} 점</span>
          <span className="text-muted-foreground ml-2">({pct}%)</span>
        </span>
      </div>
      <div className="p-4">
        <ul className="space-y-2" data-testid="rubric-checklist">
          {items.map((it, i) => {
            const isChecked = checked.has(i);
            return (
              <li key={i}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors",
                    isChecked
                      ? "border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/30"
                      : "hover:bg-muted/60",
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-primary mt-0.5 size-3.5"
                    checked={isChecked}
                    onChange={() => onToggle(i)}
                    data-testid={`rubric-item-${i}`}
                  />
                  <span className="flex-1">
                    <span
                      className={cn(isChecked && "line-through opacity-60")}
                    >
                      {it.label}
                    </span>
                  </span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {it.points}점
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
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
  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const onRequest = () => {
    if (!submitted) return;
    if (!confirm("이 답안에 대해 강사 첨삭을 요청하시겠습니까?")) return;
    const fd = new FormData();
    fd.set("intent", "request");
    fd.set("problemId", problemId);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/study/subjective-review",
    });
  };
  return (
    <div className="border-border bg-card rounded-xl border shadow-sm">
      <div className="border-border border-b px-5 py-3">
        <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
          강사 첨삭
        </p>
      </div>
      <div className="space-y-3 p-5 text-xs">
        {!submitted ? (
          <p className="text-muted-foreground">
            자기채점 완료 후에 첨삭 요청이 가능합니다.
          </p>
        ) : completed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                첨삭 완료
              </span>
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
              <p className="bg-muted/50 rounded-lg p-3 leading-relaxed whitespace-pre-line">
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
              className="h-7 rounded-full"
              onClick={onRequest}
              disabled={inFlight}
            >
              재요청
            </Button>
          </div>
        ) : requested ? (
          <div className="flex items-center gap-2">
            <span className="bg-muted text-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold">
              검토 대기
            </span>
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
              className="ml-auto h-7 rounded-full"
              onClick={onRequest}
              disabled={inFlight}
              data-testid="subjective-request-review"
            >
              강사 첨삭 요청
            </Button>
          </div>
        )}
        {error ? <p className="text-rose-600">{error}</p> : null}
      </div>
    </div>
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
      <div className="flex items-center gap-2 rounded-xl border border-rose-400/50 bg-rose-50 px-4 py-2.5 text-xs dark:border-rose-700/40 dark:bg-rose-950/30">
        <TimerIcon className="size-4 text-rose-500" />
        <p className="font-semibold text-rose-700 dark:text-rose-300">
          시간 만료 — 답안이 자동 제출되었습니다 ({timedLimitMin}분 응시).
        </p>
      </div>
    );
  }
  if (timedStartedAt === null) {
    return (
      <div className="border-border bg-muted/30 flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-xs">
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <TimerIcon className="size-3.5" /> 시험 모드
        </span>
        <label className="text-muted-foreground inline-flex items-center gap-1.5">
          제한 시간
          <input
            type="number"
            min={1}
            max={180}
            value={minInput}
            onChange={(e) => setMinInput(e.target.value)}
            className="border-input bg-background focus:ring-primary/30 h-7 w-14 rounded-lg border px-2 text-xs tabular-nums focus:ring-2 focus:outline-none"
          />
          분
        </label>
        <Button
          size="sm"
          variant="default"
          className="h-7 rounded-full"
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
        "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-xs",
        lowTime
          ? "border-rose-400/60 bg-rose-50 dark:border-rose-700/40 dark:bg-rose-950/30"
          : "border-amber-400/40 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/30",
      )}
      data-testid="subjective-timed-bar"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <TimerIcon className="size-3.5" /> 시험 모드 응시 중
      </span>
      <span className="font-mono text-base font-bold tabular-nums">
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </span>
      <span className="text-muted-foreground">/ {timedLimitMin}분</span>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-7 rounded-full"
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
    return <span className="text-muted-foreground tabular-nums">저장 중…</span>;
  }
  if (isDirty) {
    return (
      <span className="font-semibold text-amber-600 dark:text-amber-400">
        미저장
      </span>
    );
  }
  if (updatedAt) {
    return (
      <span className="font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
        저장됨 · {updatedAt.slice(11, 16)}
      </span>
    );
  }
  return <span className="text-muted-foreground">미저장</span>;
}

// ── ProblemPrevNextButton ────────────────────────────────────────────────
// 조문/판례 뷰어의 prev/next 버튼과 같은 톤. 같은 law 의 (year DESC, problem_number ASC)
// 순서로 인접 문제로 이동. 없으면 disabled "처음"/"마지막".
function ProblemPrevNextButton({
  direction,
  target,
  subjectSlug,
  query = "",
}: {
  direction: "prev" | "next";
  target: AdjacentProblem | null;
  subjectSlug: string;
  // 색인 그룹 prev/next 가 컨텍스트(?list=1&...)를 이어가도록 붙이는 쿼리 suffix.
  query?: string;
}) {
  const Icon = direction === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  const ariaLabel = direction === "prev" ? "이전 문제" : "다음 문제";
  if (!target) {
    return (
      <button
        type="button"
        disabled
        aria-label={ariaLabel}
        className="border-border bg-background text-muted-foreground inline-flex h-9 cursor-not-allowed items-center gap-1 rounded-full border px-3 text-xs opacity-40"
      >
        {direction === "prev" ? <Icon className="size-3.5" /> : null}
        <span>{direction === "prev" ? "처음" : "마지막"}</span>
        {direction === "next" ? <Icon className="size-3.5" /> : null}
      </button>
    );
  }
  const label = target.year
    ? `${target.year}년 #${target.problemNumber ?? "?"}`
    : `#${target.problemNumber ?? "?"}`;
  return (
    <Link
      to={`/subjects/${subjectSlug}/problems/${target.problemId}${query}`}
      viewTransition
      prefetch="intent"
      aria-label={`${ariaLabel}: ${label}`}
      className="border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors"
    >
      {direction === "prev" ? <Icon className="size-3.5 shrink-0" /> : null}
      <span className="max-w-[140px] truncate">{label}</span>
      {direction === "next" ? <Icon className="size-3.5 shrink-0" /> : null}
    </Link>
  );
}
