import type { Route } from "./+types/problem-viewer";

import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  FlagIcon,
  ListTreeIcon,
  MapPinIcon,
  PanelRightIcon,
  PencilIcon,
  PrinterIcon,
  ScrollTextIcon,
  SearchIcon,
  TimerIcon,
  VideoIcon,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { GuideHelpButton } from "~/features/guide/components/guide-help-button";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import {
  getLawByCode,
  getStaffRole,
  getSystematicSkeleton,
} from "~/features/laws/queries.server";
import { listLectureResources } from "~/features/lectures/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import { OxBookmarkToggle } from "~/features/problems/components/ox-bookmark-toggle";
import { ProblemCodeChip } from "~/features/problems/components/problem-code-chip";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  type AnswerCaseGroup,
  POLARITY_LABEL,
  SCOPE_LABEL,
  SUBJECTIVE_KIND_LABEL,
  answerLabelOf,
  compareSubjectiveDisplay,
  isAllChoicesCorrect,
  isOxEligible,
  problemDisplayNumber,
} from "~/features/problems/labels";
import {
  deriveBoxItemOxTruth,
  deriveDisplayChoiceOx,
  stripLeadingOxMark,
} from "~/features/problems/lib/auto-ox";
import { redactSubjectiveAnswer } from "~/features/problems/lib/answer-visibility";
import {
  type AdjacentProblem,
  type ProblemPlacement,
  type SystematicNodeProblemStat,
  getAdjacentProblems,
  getAnswerCitedCaseGroups,
  getCasesCitedByProblem,
  getExplanationCaseRefsByItem,
  getChoiceLinkRefs,
  getProblemById,
  getProblemPlacementsBulk,
  getRelatedProblems,
  getSubjectiveNodeProblemStats,
  getSystematicNodeProblemSequence,
  getSystematicNodeProblemStats,
} from "~/features/problems/queries.server";
import { listThreadsForTarget } from "~/features/qna/queries.server";
import { FlowNav } from "~/features/study/components/flow-nav";
import { ReadingControls } from "~/features/study/components/study-font-control";
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
  PanelEdgeHandle,
  panelGridCls,
  useLeftPanelCollapse,
  useRightPanelCollapse,
} from "~/features/subjects/components/left-panel-collapse";
import { AnswerCaseBadges } from "~/features/subjects/components/answer-case-badges";
import { SubjectivePanel } from "~/features/subjects/components/subjective-panel";
import { RefPreviewBadge } from "~/features/subjects/components/ref-preview-badge";
import { MobileNavDrawer } from "~/features/subjects/components/mobile-nav-drawer";
import { ProblemSystematicTree } from "~/features/subjects/components/problem-systematic-tree";
import {
  stripSystematicNumber,
  SystematicNumberBadge,
} from "~/features/subjects/components/systematic-node-label";
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
import { getProblemPlacementNodeId } from "~/features/subjects/lib/problem-node-attribution.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

// 발문·해설에 markdown 이미지(![](url))·<img>·표(HTML <table> 또는 GFM 파이프표)가
// 있으면 MarkdownView 로 렌더(이미지·표·수식). 없으면 plain whitespace-pre-line.
// 파이프표 감지 = 구분선 `|---|` (\|[\s:]*-{3,}). mcq-pack-sheet 와 동일 규칙.
const MD_IMAGE_RE = /!\[[^\]]*\]\([^)]*\)|<(img|table|div)\b|\|[\s:]*-{3,}/i;
// 종합해설 마크다운 서식 감지 — **굵게**·헤더·별표 감싼 줄(민법 해설 "*관련 조문·판례*").
const MD_FORMAT_RE = /\*\*[^*\n]+\*\*|(?:^|\n)#{1,6}\s+\S|(?:^|\n)\*[^*\n]+\*(?=\n|$)/;

// 지문별·박스항목별 해설도 같은 규칙 — 표(HTML/파이프)·이미지·서식이 있으면 MarkdownView,
// 없으면 기존 plain span. 원시 HTML 이 코드 문자열 그대로 노출되던 문제의 방지책.
function hasMarkdownFormat(md: string): boolean {
  return MD_IMAGE_RE.test(md) || MD_FORMAT_RE.test(md);
}

// 주관식 본문 — 사실관계와 설문((1)…) 사이에 구분선(hr)을 렌더 시점에 삽입.
// 원문(body_md)은 무변경. 첫 "(1) " 문단 앞에만 삽입하며, 본문이 (1)로 시작하거나
// 설문 마커가 없으면 no-op.
function withQuestionDivider(md: string): string {
  return md.replace(/\n\n(\(1\)\s)/, "\n\n---\n\n$1");
}

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData || "deleted" in loaderData)
    return [{ title: "문제 | 리담변리사학원" }];
  return [
    {
      title: `${loaderData.subject.name} ${loaderData.problem.format === "subjective" ? "주관식" : "객관식"} #${loaderData.problem.problemNumber ?? "?"} | 리담변리사학원`,
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
    // 소프트 삭제(중복 정리 등)된 문제 URL 은 "없는 페이지"가 아니라 "통합·삭제된
    // 문제". 존재하되 deleted 이면 친절 안내 상태를 반환(200)해 검색·목록으로 유도한다.
    // (RLS 는 deleted 를 가리지 않으므로 요청 클라이언트로 존재 확인 가능.)
    const { data: existing } = await client
      .from("problems")
      .select("deleted_at")
      .eq("problem_id", params.problemId)
      .maybeSingle();
    if (existing?.deleted_at) {
      return { deleted: true as const, lawCode };
    }
    throw data("Problem not found", { status: 404 });
  }

  const {
    data: { user },
  } = await authPromise;
  if (!user) {
    await Promise.allSettled([lawPromise, nodeSeqPromise]);
    throw data("Unauthorized", { status: 401 });
  }

  // 주관식(2차)은 고도화 전까지 staff 전용 — 허브 탭·레일 숨김에 더해 직접 URL 접근도
  // 서버에서 차단(역할 게이트는 서버 권위). 학생은 과목 홈으로 보낸다.
  if (problem.format === "subjective") {
    const role = await getStaffRole(client, user.id);
    if (!role) {
      await Promise.allSettled([lawPromise, nodeSeqPromise]);
      throw redirect(`/subjects/${lawCode}`);
    }
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
    placementNodeId,
    placementsByProblem,
    answerCaseGroups,
    explanationCaseRefs,
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
    // 좌측 체계도 카운트 — 보고 있는 문제와 같은 축이어야 한다. 주관식 뷰어에서 객관식
    // 통계를 쓰면 없는 문제 수가 노출된다(주관식 배치는 problem_systematic_links 축).
    !law
      ? Promise.resolve<Record<string, SystematicNodeProblemStat>>({})
      : problem.format === "subjective"
        ? getSubjectiveNodeProblemStats(client, lawCode).then((r) => r.stats)
        : getSystematicNodeProblemStats(client, lawCode),
    getProblemPlacementNodeId(client, params.problemId),
    // 주관식 체계도 복수 배치(problem_systematic_links) — 뷰어 배지용.
    problem.format === "subjective"
      ? getProblemPlacementsBulk(client, [problem.problemId])
      : Promise.resolve<Record<string, ProblemPlacement[]>>({}),
    getAnswerCitedCaseGroups(
      client,
      {
        format: problem.format,
        modelAnswerMd: problem.modelAnswerMd,
        gradingRubricMd: problem.gradingRubricMd,
        // 객관식 상단 카드는 종합해설 인용만 — 선지 인용은 선지 행의 조문 배지 옆 인라인 배지로.
        explanationMd: problem.explanationMd,
        choiceExplanations: [],
        mainCaseNumber: problem.mainCaseNumber,
      },
      lawCode,
    ),
    getExplanationCaseRefsByItem(
      client,
      [
        ...problem.choices.map((c) => ({
          id: c.choiceId,
          explanationMd: c.explanationMd,
          // 실제 링크(case_id)가 있어 칩이 이미 뜨는 경우에만 중복 제외.
          linkedCaseNumber: c.relatedCaseId ? c.relatedCaseNumber : null,
        })),
        ...problem.boxItems.map((b) => ({
          id: b.boxItemId,
          explanationMd: b.explanationMd,
          linkedCaseNumber: b.relatedCaseId ? b.relatedCaseNumber : null,
        })),
      ],
      lawCode,
    ),
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
      // 보고 있는 문제의 축으로 ?node= 를 해석한다 — 주관식은 배치 링크 기준.
      nodeAxis: problem.format === "subjective" ? "subjective" : "problems",
    });
    // 학습과목 탭은 객관식(1차)·2차 주관식을 별 섹션으로 나눠 표시 → 같은 차수 안에서만 prev/next.
    const cur = displayed.find((p) => p.problemId === problem.problemId);
    const scoped = cur
      ? displayed.filter((p) => p.examRound === cur.examRound)
      : displayed;
    // 주관식(2차) 탭은 컬럼 정렬 없이 항상 시험 최신순으로 표시 — prev/next 도 동일 순서.
    if (cur?.examRound === "second") scoped.sort(compareSubjectiveDisplay);
    const idx = scoped.findIndex((p) => p.problemId === problem.problemId);
    const toAdj = (
      p: (typeof scoped)[number] | undefined,
    ): AdjacentProblem | null =>
      p
        ? {
            problemId: p.problemId,
            year: p.year,
            problemNumber: p.problemNumber,
            examNumber: p.examNumber ?? null,
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

  // 주관식 해설·모범답안·채점기준은 staff 전용 — 서버에서 걷어낸다(answer-visibility).
  // answerCaseGroups 는 모범답안·채점기준에서 뽑은 인용 판례라 함께 비운다.
  const viewerIsStaff = staffRole !== null;
  return {
    subject: LAW_SUBJECTS[lawCode],
    axisCounts,
    problem: redactSubjectiveAnswer(problem, viewerIsStaff),
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
    placementNodeId,
    subjectivePlacements: placementsByProblem[problem.problemId] ?? [],
    answerCaseGroups:
      viewerIsStaff || problem.format !== "subjective" ? answerCaseGroups : [],
    explanationCaseRefs,
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

// loader 가 반환하는 두 형태 중 정상(문제 존재) 브랜치만.
type ProblemViewerData = Exclude<
  Route.ComponentProps["loaderData"],
  { deleted: true }
>;

// 통합·삭제된 문제 URL(옛 링크·중복 정리 대상) 친절 안내. 404 대신 목록·검색으로 유도.
function DeletedProblemNotice({ lawCode }: { lawCode: string }) {
  return (
    <div className="bg-muted/20 flex min-h-[calc(100vh-56px)] items-center justify-center px-4">
      <div className="border-border bg-card w-full max-w-md rounded-xl border p-8 text-center shadow-sm">
        <div className="bg-muted text-muted-foreground mx-auto flex size-12 items-center justify-center rounded-full">
          <SearchIcon className="size-6" />
        </div>
        <h1 className="text-foreground mt-4 text-lg font-bold tracking-tight">
          통합·삭제된 문제입니다
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          이 링크의 문제는 중복 정리 등으로 삭제되었습니다. 같은 내용의 문제가
          현행 목록에 남아 있을 수 있으니, 목록이나 검색(⌘K)에서 다시 찾아
          주세요.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/subjects/${lawCode}/problems`} viewTransition>
              <ArrowLeftIcon className="size-3.5" /> 문제 목록으로
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ProblemViewer({ loaderData }: Route.ComponentProps) {
  if ("deleted" in loaderData) {
    // lawCode 는 삭제 브랜치에서 항상 유효한 slug(loader 가 검증 후 채움).
    return <DeletedProblemNotice lawCode={loaderData.lawCode ?? ""} />;
  }
  return <ProblemViewerInner loaderData={loaderData} />;
}

function ProblemViewerInner({ loaderData }: { loaderData: ProblemViewerData }) {
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
    axisCounts,
    isStaff,
    isAdmin,
    currentUserId,
    adjacent,
    adjacentQuery,
    lectureResources,
    placementNodeId,
    subjectivePlacements,
    answerCaseGroups,
    explanationCaseRefs,
  } = loaderData;
  // 체계도 위치 배지 — 배치 노드에서 루트까지 parent 체인(루트→노드 순, depth=index).
  const placementChain = useMemo(() => {
    if (!placementNodeId) return [];
    const byId = new Map(systematicNodes.map((n) => [n.nodeId, n]));
    const chain: typeof systematicNodes = [];
    let cur = byId.get(placementNodeId);
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return chain;
  }, [placementNodeId, systematicNodes]);
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
          <div className="ml-auto">
            <GuideHelpButton screenKey="problem-viewer" />
          </div>
        </div>
      )}

      {/* 3-pane shell: left tree 260 / body / right panel 320. 축 내비는 좌패널 헤더로 이동. */}
      <div className="mx-auto flex max-w-screen-2xl flex-row items-start gap-0 px-0">
        <div
          className={`grid min-w-0 flex-1 gap-0 ${panelGridCls(leftCollapsed, rightCollapsed)}`}
        >
          {/* Left tree — desktop sticky, 경계 손잡이로 접기/펼치기. 문제는 체계도 고정
              (SortAxisProvider forced — 조문 leaf 로 이동해도 조문 뷰어가 체계도 유지). */}
          <aside className="lg:border-border relative hidden lg:sticky lg:top-[calc(3.5rem+41px)] lg:block lg:border-r">
            <SortAxisProvider forced="systematic">
              {leftCollapsed ? (
                <div className="flex h-[70vh] items-center justify-center">
                  <PanelEdgeHandle
                    side="left"
                    collapsed
                    onToggle={toggleLeft}
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-start">
                    <SubjectBookmarkRail
                      subjectSlug={subject.slug}
                      active={isSubjectiveProblem ? "subjective" : "problems"}
                      counts={axisCounts}
                      showSubjective={isStaff}
                    />
                    <div className="min-w-0 flex-1 lg:max-h-[calc(100vh-3.5rem-41px)] lg:overflow-y-auto">
                      {/* 헤더(상단 고정): [돋보기 토글][체계도/조문(조문 비활성)]. */}
                      <div className="bg-background sticky top-0 z-10">
                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                          <SortAxisToggle
                            size="sm"
                            disabledAxes={["statutory"]}
                          />
                        </div>
                      </div>
                      {systematicEmpty ? (
                        <p className="text-muted-foreground px-4 py-6 text-xs">
                          체계도가 아직 등록되지 않았습니다.
                        </p>
                      ) : (
                        <ProblemSystematicTree
                          searchVisible={false}
                          nodes={systematicNodes}
                          nodeStats={problemNodeStats}
                          activeNodeId={activeNodeId ?? undefined}
                          linkBase={`/subjects/${subject.slug}`}
                          tab={problem.format === "subjective" ? "subjective" : "problems"}
                        />
                      )}
                    </div>
                    {/* 경계 손잡이 — 패널 오른쪽 변 세로 중앙(국가법령정보센터식). */}
                    <PanelEdgeHandle
                      side="left"
                      collapsed={false}
                      onToggle={toggleLeft}
                      className="absolute top-1/2 -right-2.5 z-20 -translate-y-1/2"
                    />
                  </div>
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
                    <ListTreeIcon className="size-3.5" /> 목차로 찾기
                  </Button>
                }
              >
                <SheetHeader className="border-border border-b px-4 py-3">
                  <SheetTitle className="text-sm font-semibold">
                    목차
                  </SheetTitle>
                </SheetHeader>
                <div className="px-3 pb-4">
                  {systematicEmpty ? (
                    <p className="text-muted-foreground px-2 py-4 text-xs">
                      체계도가 아직 등록되지 않았습니다.
                    </p>
                  ) : (
                    <ProblemSystematicTree
                      searchVisible={false}
                      nodes={systematicNodes}
                      nodeStats={problemNodeStats}
                      activeNodeId={activeNodeId ?? undefined}
                      linkBase={`/subjects/${subject.slug}`}
                      tab={problem.format === "subjective" ? "subjective" : "problems"}
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
                {/* 체계도 위치 — 배치 노드의 번호+제목 경로(루트→소분류).
                    ★문제 탭의 좌측 체계도로 보낸다 — 단원 뷰어(/systematic/:id)로 보내면
                    조문 본문 화면이 열려, 문제를 보다 단원을 누른 사람이 조문 쪽으로
                    떨어진다(원장 지적 2026-08-21). 부모 노드는 subtree 로 묶여 필터된다. */}
                {placementChain.length > 0 ? (
                  <div
                    className="mb-2 flex flex-wrap items-center gap-1"
                    data-testid="problem-systematic-breadcrumb"
                  >
                    {placementChain.map((n, i) => (
                      <Fragment key={n.nodeId}>
                        {i > 0 ? (
                          <ChevronRightIcon className="text-muted-foreground/50 size-3 flex-none" />
                        ) : null}
                        <Link
                          to={`/subjects/${subject.slug}?tab=${
                            isSubjectiveProblem ? "subjective" : "problems"
                          }&node=${n.nodeId}`}
                          className="border-border/60 bg-muted/40 text-foreground/80 hover:bg-muted inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
                          title={`체계도 — ${n.displayLabel}`}
                        >
                          <SystematicNumberBadge depth={i} ord={n.ord} />
                          {stripSystematicNumber(n.displayLabel)}
                        </Link>
                      </Fragment>
                    ))}
                  </div>
                ) : null}
                {/* 주관식 체계도 배치 — 설문별 논점 기준 복수 노드. 클릭 시 주관식 탭 노드 필터. */}
                {isSubjectiveProblem && subjectivePlacements.length > 0 ? (
                  <div
                    className="mb-2 flex flex-wrap items-center gap-1"
                    data-testid="problem-subjective-placements"
                  >
                    {subjectivePlacements.map((pl) => (
                      <Link
                        key={pl.linkId}
                        to={`/subjects/${subject.slug}?tab=subjective&node=${pl.nodeId}`}
                        className="border-border/60 bg-muted/40 text-foreground/80 hover:bg-muted inline-flex max-w-[280px] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-xs font-medium"
                        title={pl.note ?? `체계도 — ${pl.label}`}
                      >
                        <MapPinIcon className="text-link size-3 flex-none" />
                        <span className="truncate">
                          {stripSystematicNumber(pl.label)}
                        </span>
                      </Link>
                    ))}
                    {isStaff ? (
                      <Link
                        to={`/admin/problems/${problem.problemId}?returnTo=${encodeURIComponent(`/subjects/${subject.slug}/problems/${problem.problemId}`)}`}
                        className="text-muted-foreground hover:text-foreground text-[11px] font-semibold underline-offset-2 hover:underline"
                        title="배치 추가·삭제는 문제 편집 화면에서"
                      >
                        배치 수정
                      </Link>
                    ) : null}
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
                  {problem.format === "subjective" &&
                  (problem.modelAnswerMd ?? "").trim() ? (
                    <span
                      className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-50/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                      title="채점기준·모범답안이 등록된 문제입니다"
                      data-testid="problem-model-answer-chip"
                    >
                      모범답안
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
                      {(() => {
                        const n = problemDisplayNumber(
                          problem.origin,
                          problem.examNumber,
                          problem.problemNumber,
                        );
                        return n != null ? ` · 문제 ${n}번` : "";
                      })()}
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
                  {/* 운영자 — 주관식 강의자료 PDF (문제·체크리스트·채점기준·모범답안 인쇄본) */}
                  {canEditComment && problem.format === "subjective" ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                    >
                      <a
                        href={`/subjects/${subject.slug}/problems/${problem.problemId}/handout`}
                        target="_blank"
                        rel="noreferrer"
                        data-testid="subjective-handout-pdf"
                      >
                        <PrinterIcon className="size-3" /> 강의자료 PDF
                      </a>
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
                {/* 주관식(2차) 본문은 마크다운 저작물(**(N점)**·박스·표) — 항상 마크다운 렌더.
                    객관식은 이미지·case-box 포함일 때만 — 그 외 plain 은 우발적 마크다운
                    오렌더 방지를 위해 기존 pre-line 유지. */}
                {problem.format === "subjective" ||
                MD_IMAGE_RE.test(problem.bodyMd) ||
                problem.bodyMd.includes("case-box") ? (
                  <div className="mb-7 text-[length:calc(17px*var(--study-fs))] leading-[1.8] font-medium dark:[&_img]:brightness-[.8]">
                    <MarkdownView
                      text={
                        problem.format === "subjective"
                          ? withQuestionDivider(problem.bodyMd)
                          : problem.bodyMd
                      }
                      breaks={problem.format === "subjective"}
                      literalNumbering={problem.format === "subjective"}
                      className="text-[length:calc(17px*var(--study-fs))] [&_hr]:my-5"
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

              {/* 주관식 키워드 — 분류 라벨의 키워드를 본문 아래 해시태그로 표시. */}
              {problem.format === "subjective" &&
              (problem.subjectiveKeywords ?? []).length > 0 ? (
                <div className="mb-6 flex flex-wrap gap-1.5">
                  {(problem.subjectiveKeywords ?? []).map((k) => (
                    <span
                      key={k}
                      className="text-link bg-primary/[0.07] rounded-full px-2.5 py-1 text-[13px] font-semibold"
                    >
                      #{k}
                    </span>
                  ))}
                </div>
              ) : null}

              {problem.format === "subjective" ? (
                <SubjectivePanel
                  problemId={problem.problemId}
                  modelAnswerMd={problem.modelAnswerMd}
                  gradingRubricMd={problem.gradingRubricMd}
                  explanationMd={problem.explanationMd}
                  rubricItems={problem.rubricItems}
                  rubricAiGenerated={Boolean(problem.rubricAiGeneratedAt) && isStaff}
                  rubricReviewedAt={problem.rubricReviewedAt}
                  viewerIsStaff={isStaff}
                  answerCaseGroups={answerCaseGroups}
                  initialAttempt={subjectiveAttempt}
                  totalPoints={problem.totalPoints}
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
                        // 복수정답 지원 + 전항 정답은 "정답 없음"으로 표기(SSOT).
                        const answerSuffix = answerLabelOf(problem.choices);
                        const allCorrect = isAllChoicesCorrect(problem.choices);
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
                        // 전항 정답 문항은 정/오를 가리지 않는다 — 무엇을 골라도 정답 처리라
                        // "정답입니다"가 오해를 부른다(출제 오류 안내로 대체).
                        if (allCorrect) {
                          return (
                            <div className="flex items-center gap-3">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                <CircleCheckIcon className="size-4" />
                                {answerSuffix}
                              </span>
                            </div>
                          );
                        }
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
                          {MD_IMAGE_RE.test(problem.explanationMd) ||
                          MD_FORMAT_RE.test(problem.explanationMd) ? (
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

                      {/* 해설 인용 판례 배지 — 팝업 요지·학습화면 이동 */}
                      <AnswerCaseBadges groups={answerCaseGroups} />

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
                                          {bi.explanationMd &&
                                          !hasMarkdownFormat(
                                            bi.explanationMd,
                                          ) ? (
                                            <span className="text-muted-foreground ml-2">
                                              {truth
                                                ? stripLeadingOxMark(
                                                    bi.explanationMd,
                                                  )
                                                : bi.explanationMd}
                                            </span>
                                          ) : null}
                                        </p>
                                        {bi.explanationMd &&
                                        hasMarkdownFormat(bi.explanationMd) ? (
                                          <MarkdownView
                                            text={
                                              truth
                                                ? stripLeadingOxMark(
                                                    bi.explanationMd,
                                                  )
                                                : bi.explanationMd
                                            }
                                            className="text-muted-foreground text-[length:calc(15px*var(--study-fs))] leading-[1.7]"
                                          />
                                        ) : null}
                                        {(explanationCaseRefs[bi.boxItemId] ??
                                          []).length > 0 ? (
                                          <div className="flex flex-wrap gap-1.5">
                                            {(
                                              explanationCaseRefs[
                                                bi.boxItemId
                                              ] ?? []
                                            ).map((r) => (
                                              <RefPreviewBadge
                                                key={r.caseId}
                                                kind="case"
                                                refId={r.caseId}
                                                label={r.caseNumber}
                                                studyHref={`/subjects/${r.subjectSlug}/cases/${r.caseId}`}
                                              />
                                            ))}
                                          </div>
                                        ) : null}
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
                              // mc_short·mc_case: polarity 반영해 O/X 산출 — 정오문제
                              // 적격성(oxIneligible)과 지문 진위 표시는 별개 개념이라 무시.
                              const derivedOx =
                                c.oxTruth ??
                                deriveDisplayChoiceOx({
                                  polarity: problem.polarity,
                                  format: problem.format,
                                  isCorrect: c.isCorrect,
                                });
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
                                      {c.explanationMd &&
                                      !hasMarkdownFormat(c.explanationMd) ? (
                                        <span className="text-muted-foreground ml-2">
                                          {label
                                            ? stripLeadingOxMark(
                                                c.explanationMd,
                                              )
                                            : c.explanationMd}
                                        </span>
                                      ) : null}
                                    </p>
                                    {c.explanationMd &&
                                    hasMarkdownFormat(c.explanationMd) ? (
                                      <MarkdownView
                                        text={
                                          label
                                            ? stripLeadingOxMark(
                                                c.explanationMd,
                                              )
                                            : c.explanationMd
                                        }
                                        className="text-muted-foreground text-[length:calc(15px*var(--study-fs))] leading-[1.7]"
                                      />
                                    ) : null}
                                    <div className="flex flex-wrap gap-1.5">
                                      {(() => {
                                        const articleRef = c.relatedArticleId
                                          ? choiceArticleRefs[
                                              c.relatedArticleId
                                            ]
                                          : null;
                                        if (articleRef && c.relatedArticleId) {
                                          return (
                                            <RefPreviewBadge
                                              kind="article"
                                              refId={c.relatedArticleId}
                                              label={articleRef.displayLabel}
                                              studyHref={`/subjects/${articleRef.lawCode}/articles/${articleRef.pathSlug}`}
                                              testId="choice-related-article"
                                            />
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
                                        if (caseRef && c.relatedCaseId) {
                                          return (
                                            <RefPreviewBadge
                                              kind="case"
                                              refId={c.relatedCaseId}
                                              label={caseRef.caseNumber}
                                              studyHref={`/subjects/${caseRef.lawCode}/cases/${c.relatedCaseId}`}
                                              testId="choice-related-case"
                                            />
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
                                      {(explanationCaseRefs[c.choiceId] ?? []).map(
                                        (r) => (
                                          <RefPreviewBadge
                                            key={r.caseId}
                                            kind="case"
                                            refId={r.caseId}
                                            label={r.caseNumber}
                                            studyHref={`/subjects/${r.subjectSlug}/cases/${r.caseId}`}
                                          />
                                        ),
                                      )}
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

          {/* Right panel — desktop sticky, 경계 손잡이로 접기/펼치기 */}
          <aside className="relative hidden lg:sticky lg:top-[calc(3.5rem+41px)] lg:block">
            {rightCollapsed ? (
              <div className="flex h-[70vh] items-center justify-center">
                <PanelEdgeHandle
                  side="right"
                  collapsed
                  onToggle={toggleRight}
                />
              </div>
            ) : (
              <>
                <div className="lg:max-h-[calc(100vh-3.5rem-41px)] lg:overflow-y-auto">
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
                </div>
                {/* 경계 손잡이 — 패널 왼쪽 변 세로 중앙(국가법령정보센터식). */}
                <PanelEdgeHandle
                  side="right"
                  collapsed={false}
                  onToggle={toggleRight}
                  className="absolute top-1/2 -left-2.5 z-20 -translate-y-1/2"
                />
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
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
  const num =
    problemDisplayNumber(
      target.origin,
      target.examNumber,
      target.problemNumber,
    ) ?? "?";
  const label = target.year ? `${target.year}년 #${num}` : `#${num}`;
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
