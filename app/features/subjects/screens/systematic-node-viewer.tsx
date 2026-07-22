import type { Route } from "./+types/systematic-node-viewer";

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  ListTreeIcon,
  MessageCircleQuestionIcon,
  PanelRightIcon,
  PencilLineIcon,
  ScrollTextIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { SheetHeader, SheetTitle } from "~/core/components/ui/sheet";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { HighlightOverlay } from "~/features/annotations/components/highlight-overlay";
import { HighlightToolbar } from "~/features/annotations/components/highlight-toolbar";
import {
  getBookmarksByArticleIds,
  getUserArticleAnnotationCounts,
  getUserArticleBookmarkLevels,
  listHighlightsByArticleIds,
  listMemosByArticleIds,
} from "~/features/annotations/queries.server";
import { BlankFill } from "~/features/blanks/components/blank-fill-dispatch";
import { BlankOwnerPageSelector } from "~/features/blanks/components/blank-owner-page-selector";
import { PeriodAmbiguousPanel } from "~/features/blanks/components/period-ambiguous-panel";
import {
  type PeriodAmbiguousCase,
  computePeriodBlanks,
} from "~/features/blanks/lib/period-blanks";
import { computeSubjectBlanks } from "~/features/blanks/lib/subject-blanks";
import {
  type BlankItem,
  listBlankSetsByArticle,
} from "~/features/blanks/queries.server";
import { listCommentsBulk } from "~/features/comments/queries.server";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import { parseArticleBody } from "~/features/laws/lib/article-body";
import {
  getArticleSkeleton,
  getLawByCode,
  getStaffRole,
  getSystematicNodeWithArticles,
  getSystematicSkeleton,
} from "~/features/laws/queries.server";
import {
  getPdfLocationsByTargetIds,
  listLectureResourcesByArticleIds,
} from "~/features/lectures/queries.server";
import { getPdfLocationsEnabled } from "~/features/lectures/settings.server";
import type { OxRefAnnotations } from "~/features/problems/labels";
import {
  getOxAnnotationsForRefs,
  getOxQuestionsForArticle,
  listProblemsByArticleIds,
} from "~/features/problems/queries.server";
import { QnaPanel } from "~/features/qna/components/qna-panel";
import {
  listThreadsAnchoredToNode,
  listThreadsForArticleInNode,
  listThreadsForTarget,
} from "~/features/qna/queries.server";
import { getCaseIdsByPlacement } from "~/features/cases/queries.server";
import { getRelatedCasesByArticle } from "~/features/relations/queries.server";
import { ArticleTree } from "~/features/subjects/components/article-tree";
import {
  LeftPanelResizer,
  PanelEdgeHandle,
  leftOnlyGridCls,
  useLeftPanelCollapse,
  useLeftPanelWidth,
} from "~/features/subjects/components/left-panel-collapse";
import { MobileNavDrawer } from "~/features/subjects/components/mobile-nav-drawer";
import { NodeMiniGraph } from "~/features/subjects/components/node-mini-graph";
import {
  SortAxisProvider,
  SortAxisToggle,
  useSortAxis,
} from "~/features/subjects/components/sort-axis";
import { stripSystematicNumber } from "~/features/subjects/components/systematic-node-label";
import { SubjectBookmarkRail } from "~/features/subjects/components/subject-bookmark-rail";
import { SystematicTree } from "~/features/subjects/components/systematic-tree";
import { getSubjectAxisCounts } from "~/features/subjects/lib/loader.server";
import { buildNodeProgressByArticle } from "~/features/subjects/lib/node-progress.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

// 연관 자료 미니맵은 다듬기 끝날 때까지 비노출. true 로 바꾸면 다시 표시.
const SHOW_NODE_MINI_GRAPH = false;

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData)
    return [{ title: "체계도 그룹 | 리담변리사학원" }];
  return [
    {
      title: `${loaderData.subject.name} ${stripSystematicNumber(loaderData.node.displayLabel)} | 리담변리사학원`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) {
    throw data("Unknown subject", { status: 404 });
  }
  const lawCode = subjectParse.data;
  const nodeId = params.nodeId;
  if (!nodeId) {
    throw data("Missing nodeId", { status: 404 });
  }

  const [client] = makeServerClient(request);
  const law = await getLawByCode(client, lawCode);
  if (!law) {
    throw data("Law not seeded", { status: 404 });
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw data("Unauthorized", { status: 401 });
  }

  const node = await getSystematicNodeWithArticles(client, lawCode, nodeId);
  if (!node) {
    throw data("Node not found", { status: 404 });
  }

  const articleIds = node.articles.map((a) => a.articleId);

  // feat-4-A-341 — 이 노드 subtree 의 node_id 들. OX 지문을 부모 문제 primary_node_id 로
  // 정밀 배치(체계도 트리에서 제29조 OX 가 4개 소분류로 합쳐지던 문제 해결).
  const { data: allNodeRows } = await client
    .from("systematic_nodes")
    .select("node_id, path")
    .eq("law_code", lawCode);
  const nodePath = String(node.path);
  const subtreeNodeIds = (allNodeRows ?? [])
    .filter((n) => {
      const p = String(n.path);
      return p === nodePath || p.startsWith(`${nodePath}.`);
    })
    .map((n) => n.node_id);

  // OX 검토 게이트 — staff 는 초안 포함, 학생은 승인분만. OX 쿼리에 넘겨야 해 먼저 조회.
  const viewerStaffRole = await getStaffRole(client, user.id);

  const [
    articles,
    systematicNodes,
    bookmarkLevels,
    annotationCounts,
    bookmarksByArticle,
    memosByArticle,
    highlightsByArticle,
    qnaByArticle,
    allBlankSetsByArticle,
    oxQuestionsByArticle,
    relatedCasesByArticle,
    problemsByArticle,
    commentsByArticle,
    staffRole,
    lectureResourcesByArticle,
    pdfLocationsByArticle,
    pdfFlag,
    nodePlacedCaseIds,
  ] = await Promise.all([
    getArticleSkeleton(client, law.lawId),
    getSystematicSkeleton(client, lawCode),
    getUserArticleBookmarkLevels(client, user.id),
    getUserArticleAnnotationCounts(client, user.id),
    getBookmarksByArticleIds(client, user.id, articleIds),
    listMemosByArticleIds(client, user.id, articleIds),
    listHighlightsByArticleIds(client, user.id, articleIds),
    // 노드 맥락의 조문 질문 탭 — 이 쟁점(노드)에 배정된 질문만, 잘림 없이(300).
    // 여러 쟁점에 걸친 조문(29조 등)에서 다른 쟁점 질문이 섞이지 않게 한다.
    Promise.all(
      articleIds.map((id) =>
        listThreadsForArticleInNode(client, id, nodeId, 300).then(
          (threads) => [id, threads] as const,
        ),
      ),
    ).then((entries) => Object.fromEntries(entries)),
    // article 별로 모든 owner set 조회 (owner selector dropdown 옵션 산출)
    Promise.all(
      articleIds.map((id) =>
        listBlankSetsByArticle(client, id).then((sets) => [id, sets] as const),
      ),
    ).then((entries) => Object.fromEntries(entries)),
    Promise.all(
      articleIds.map((id) =>
        // 표시 컷 500 — 조문별 OX(기출·변형·예상)를 origin 누락 없이 전부 싣는다.
        getOxQuestionsForArticle(client, id, 500, {
          nodeSubtreeIds: subtreeNodeIds,
          includeUnapproved: viewerStaffRole !== null,
        }).then((items) => [id, items] as const),
      ),
    ).then((entries) => Object.fromEntries(entries)),
    Promise.all(
      articleIds.map((id) =>
        getRelatedCasesByArticle(client, id).then(
          (cases) => [id, cases] as const,
        ),
      ),
    ).then((entries) => Object.fromEntries(entries)),
    listProblemsByArticleIds(client, articleIds),
    listCommentsBulk(client, "article", articleIds),
    Promise.resolve(viewerStaffRole),
    listLectureResourcesByArticleIds(client, articleIds),
    getPdfLocationsByTargetIds(client, "article", articleIds),
    getPdfLocationsEnabled(client),
    // 이 노드(쟁점) subtree 에 배치된 판례 id — primary_node_id 우선 placement.
    // cases-tab 의 체계도 필터와 동일 기준으로 노드별 판례를 정확히 한정한다.
    getCaseIdsByPlacement(client, articleIds, subtreeNodeIds),
  ]);

  // ?blank-owner=<uuid> 로 모든 카드의 빈칸 set 일괄 owner 적용. 없으면 article별 첫 set.
  const ownerParam = new URL(request.url).searchParams.get("blank-owner");
  const blankSetsByArticle: Record<
    string,
    (typeof allBlankSetsByArticle)[string][number]
  > = {};
  for (const [aid, sets] of Object.entries(allBlankSetsByArticle)) {
    if (sets.length === 0) continue;
    if (ownerParam) {
      const m = sets.find((s) => s.ownerId === ownerParam);
      blankSetsByArticle[aid] = m ?? sets[0];
    } else {
      blankSetsByArticle[aid] = sets[0];
    }
  }
  // owner selector options — 모든 article 의 unique owner 합집합
  const ownerMap = new Map<
    string,
    { ownerId: string; ownerName: string | null }
  >();
  for (const sets of Object.values(allBlankSetsByArticle)) {
    for (const s of sets) {
      if (!ownerMap.has(s.ownerId)) {
        ownerMap.set(s.ownerId, {
          ownerId: s.ownerId,
          ownerName: s.ownerName,
        });
      }
    }
  }
  const blankOwners = [...ownerMap.values()];

  // 전체 OX refId 모아 한 번에 메모/즐겨찾기 prefetch.
  const allOxItems = Object.values(oxQuestionsByArticle).flat();
  const oxAnnotationsByRef: Record<string, OxRefAnnotations> =
    await getOxAnnotationsForRefs(client, user.id, allOxItems);

  // 노드 진척도 — 사이드바 트리 게이지용. 전체 article skeleton 으로 계산.
  const allArticleIds = articles
    .filter((a) => a.level === "article")
    .map((a) => a.articleId);
  const progressByArticle = await buildNodeProgressByArticle(
    client,
    user.id,
    allArticleIds,
  );

  // 책갈피 조문 수는 전체가 아니라 이 체계도 노드의 조문 수 — 헤더 "매핑된 조문 N개" 와 일치.
  // 판례·문제 탭은 전체 색인으로 가는 링크라 과목 전체 수를 그대로 둔다.
  const axisCounts = {
    ...(await getSubjectAxisCounts(client, lawCode, law.lawId)),
    articles: node.articles.length,
  };

  // ←/→ 형제 노드 이동 — 같은 parent_id 안의 노드 ord 순. parent_id null 인 루트는
  // 같은 law 의 다른 루트들 사이 이동. 조문 viewer 의 PrevNextButton 과 동일 위치(헤더 우측).
  // SystematicNodeWithArticles 는 parentId 필드가 없어 skeleton 에서 self 매칭으로 추출.
  const selfInSkeleton = systematicNodes.find((n) => n.nodeId === node.nodeId);
  const selfParentId = selfInSkeleton?.parentId ?? null;
  const siblings = systematicNodes
    .filter((n) => n.parentId === selfParentId)
    .sort((a, b) => a.ord - b.ord);
  const sibIdx = siblings.findIndex((s) => s.nodeId === node.nodeId);
  const prevSibling = sibIdx > 0 ? siblings[sibIdx - 1] : null;
  const nextSibling =
    sibIdx >= 0 && sibIdx < siblings.length - 1 ? siblings[sibIdx + 1] : null;
  const nodePrevNext = {
    idx: sibIdx,
    total: siblings.length,
    prevNodeId: prevSibling?.nodeId ?? null,
    prevLabel: prevSibling?.displayLabel ?? null,
    nextNodeId: nextSibling?.nodeId ?? null,
    nextLabel: nextSibling?.displayLabel ?? null,
  };

  // 체계도 노드 뷰어는 "이 노드(쟁점)에 분류된 판례"만 보여준다. 제29조처럼 한 조문이
  // 여러 쟁점(산업상이용가능성/신규성/진보성/확대선출원)으로 나뉘면 article_case_links
  // (조문 단위)는 모든 쟁점 노드에 같은 76건을 붙인다. primary_node_id placement 로
  // 이 노드 subtree 에 배치된 case 만 남겨 cases-tab 과 일치시킨다.
  const nodePlacedSet = new Set(nodePlacedCaseIds);
  const relatedCasesByArticleScoped: typeof relatedCasesByArticle = {};
  for (const aid of Object.keys(relatedCasesByArticle)) {
    relatedCasesByArticleScoped[aid] = relatedCasesByArticle[aid].filter((c) =>
      nodePlacedSet.has(c.caseId),
    );
  }

  // feat-9-010 — 이 쟁점(노드)에 대한 Q&A. node 대상 스레드 + 단원 앵커(node_id)
  // 스레드 합집합 — 아카이브 조문 질문이 주제별(신규성/진보성 등)로 구분 열람된다.
  // 상한 500 — 최다 노드(국제특허출원 특례 135건 등)도 잘림 없이 전량 노출.
  const [nodeTargetThreads, nodeAnchoredThreads] = await Promise.all([
    listThreadsForTarget(client, "node", nodeId, 100),
    listThreadsAnchoredToNode(client, nodeId, 500),
  ]);
  const seenThreadIds = new Set<string>();
  const nodeQnaThreads = [...nodeTargetThreads, ...nodeAnchoredThreads]
    .filter((t) => {
      if (seenThreadIds.has(t.threadId)) return false;
      seenThreadIds.add(t.threadId);
      return true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return {
    subject: LAW_SUBJECTS[lawCode],
    axisCounts,
    // feat-4-A-130b — 빈칸 V2(단일 contenteditable) 기본. ?blankv1=1 이면 구 모델 롤백.
    blankV2: new URL(request.url).searchParams.get("blankv1") !== "1",
    lawId: law.lawId,
    node,
    nodeQnaThreads,
    nodePrevNext,
    articles,
    systematicNodes,
    bookmarkLevels,
    annotationCounts,
    bookmarksByArticle,
    memosByArticle,
    highlightsByArticle,
    qnaByArticle,
    blankSetsByArticle,
    blankOwners,
    oxQuestionsByArticle,
    oxAnnotationsByRef,
    relatedCasesByArticle: relatedCasesByArticleScoped,
    problemsByArticle,
    progressByArticle,
    selectedBlankOwner: ownerParam,
    commentsByArticle,
    canEditComment: staffRole !== null,
    isStaff: staffRole !== null,
    isAdmin: staffRole === "admin",
    currentUserId: user.id,
    lectureResourcesByArticle,
    pdfLocationsByArticle,
    pdfLocationsEnabled: staffRole !== null || pdfFlag,
  };
}

export default function SystematicNodeViewer({
  loaderData,
}: Route.ComponentProps) {
  return (
    <SortAxisProvider>
      <Inner loaderData={loaderData} />
    </SortAxisProvider>
  );
}

function Inner({
  loaderData,
}: {
  loaderData: Route.ComponentProps["loaderData"];
}) {
  const {
    subject,
    blankV2,
    lawId,
    node,
    nodeQnaThreads,
    nodePrevNext,
    articles,
    systematicNodes,
    bookmarkLevels,
    annotationCounts,
    bookmarksByArticle,
    memosByArticle,
    highlightsByArticle,
    qnaByArticle,
    blankSetsByArticle,
    blankOwners,
    oxQuestionsByArticle,
    oxAnnotationsByRef,
    relatedCasesByArticle,
    problemsByArticle,
    progressByArticle,
    selectedBlankOwner,
    commentsByArticle,
    canEditComment,
    isAdmin,
    currentUserId,
    lectureResourcesByArticle,
    pdfLocationsByArticle,
    pdfLocationsEnabled,
  } = loaderData;
  const { axis } = useSortAxis();
  const { collapsed: leftCollapsed, toggle: toggleLeft } =
    useLeftPanelCollapse();
  const { width: leftWidth, setWidth: setLeftWidth } = useLeftPanelWidth();
  const systematicEmpty = systematicNodes.length === 0;
  const renderSystematic = axis === "systematic" && !systematicEmpty;
  const [subtitlesOnly, setSubtitlesOnly] = useState(false);
  const [blankMode, setBlankMode] = useState(false);
  const [subjectBlankMode, setSubjectBlankMode] = useState(false);
  const [periodBlankMode, setPeriodBlankMode] = useState(false);
  const blankAvailableCount = useMemo(
    () => node.articles.filter((a) => blankSetsByArticle[a.articleId]).length,
    [node.articles, blankSetsByArticle],
  );
  const subjectBlanksByArticle = useMemo(() => {
    const m = new Map<string, BlankItem[]>();
    for (const a of node.articles) {
      const body = parseArticleBody(a.bodyJson);
      if (!body) continue;
      const sb = computeSubjectBlanks(body);
      if (sb.length > 0) m.set(a.articleId, sb);
    }
    return m;
  }, [node.articles]);
  const subjectBlankAvailableCount = subjectBlanksByArticle.size;
  const periodResultByArticle = useMemo(() => {
    const m = new Map<
      string,
      { blanks: BlankItem[]; ambiguous: PeriodAmbiguousCase[] }
    >();
    for (const a of node.articles) {
      const body = parseArticleBody(a.bodyJson);
      if (!body) continue;
      const r = computePeriodBlanks(body, {
        articleId: a.articleId,
        articleLabel: a.displayLabel,
        articleNumber: a.articleNumber,
        lawCode: subject.slug,
      });
      if (r.blanks.length > 0 || r.ambiguous.length > 0) {
        m.set(a.articleId, r);
      }
    }
    return m;
  }, [node.articles, subject.slug]);
  const periodBlankAvailableCount = periodResultByArticle.size;
  const periodAmbiguousAll = useMemo(() => {
    const out: PeriodAmbiguousCase[] = [];
    for (const r of periodResultByArticle.values()) {
      out.push(...r.ambiguous);
    }
    return out;
  }, [periodResultByArticle]);

  const titleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of articles) {
      if (!a.articleNumber) continue;
      const match = a.displayLabel.match(/^제\d+조(?:의\d+)?\s+(.+)$/);
      m.set(a.articleNumber, match ? match[1] : a.displayLabel);
    }
    return m;
  }, [articles]);

  const firstArticleId = node.articles[0]?.articleId;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-row items-start gap-0 px-5 py-6 md:px-10 md:py-8">
      {/* multi-article 환경: HighlightToolbar 1개를 root 에 mount, prop 없이 selection 컨테이너의 dataset 으로 article 결정 */}
      <HighlightToolbar />

      <div
        className={`grid min-w-0 flex-1 gap-5 ${leftOnlyGridCls(leftCollapsed)}`}
        style={{ ["--left-w" as string]: `${leftWidth}px` }}
      >
        {/* ── 좌측 트리 (데스크톱, 경계 손잡이로 접기/펼치기) ── */}
        <aside className="relative hidden lg:sticky lg:top-20 lg:block lg:self-start">
          {!leftCollapsed ? (
            <LeftPanelResizer width={leftWidth} onWidth={setLeftWidth} />
          ) : null}
          {leftCollapsed ? (
            <div className="flex h-[70vh] items-center justify-start">
              <PanelEdgeHandle side="left" collapsed onToggle={toggleLeft} />
            </div>
          ) : (
            <>
            <div className="flex items-start">
            <SubjectBookmarkRail
              subjectSlug={subject.slug}
              active="articles"
              counts={loaderData.axisCounts}
              showSubjective={loaderData.isStaff}
            />
            <Card className="min-w-0 flex-1 gap-0 rounded-xl border py-0 shadow-sm lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
              {/* 헤더(스크롤해도 상단 고정): [축 언더라인 탭] → [체계도/조문]. */}
              <div className="border-border bg-card sticky top-0 z-10 rounded-t-xl border-b px-4">
                <div className="flex items-center justify-between gap-2 py-2">
                  <SortAxisToggle
                    size="sm"
                    disabledAxes={systematicEmpty ? ["systematic"] : undefined}
                  />
                </div>
              </div>
              <CardContent className="px-2 py-2">
                {renderSystematic ? (
                  <SystematicTree
                    searchVisible={false}
                    nodes={systematicNodes}
                    activeArticleId={firstArticleId}
                    lawCode={subject.slug}
                    bookmarkLevels={bookmarkLevels}
                    annotationCounts={annotationCounts}
                    progressByArticle={progressByArticle}
                  />
                ) : (
                  <ArticleTree
                    nodes={articles}
                    activeArticleId={firstArticleId}
                    lawCode={subject.slug}
                    bookmarkLevels={bookmarkLevels}
                    annotationCounts={annotationCounts}
                    searchVisible={false}
                    lazyExpand={
                      subject.slug === "civil" ? { lawId } : undefined
                    }
                  />
                )}
              </CardContent>
            </Card>
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
        </aside>

        <main className="space-y-5">
          {/* 모바일 트리 드로어 */}
          <div className="flex flex-wrap gap-2 lg:hidden">
            <MobileNavDrawer
              side="left"
              contentClassName="w-[320px] overflow-y-auto p-0 sm:max-w-[360px]"
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 rounded-full"
                  data-testid="open-tree-drawer"
                >
                  <ListTreeIcon className="size-3.5" /> 목차로 찾기
                </Button>
              }
            >
              <SheetHeader>
                <SheetTitle>목차</SheetTitle>
              </SheetHeader>
              <div className="space-y-3 px-3 pb-4">
                <div className="flex justify-end">
                  <SortAxisToggle
                    size="sm"
                    disabledAxes={systematicEmpty ? ["systematic"] : undefined}
                  />
                </div>
                {renderSystematic ? (
                  <SystematicTree
                    searchVisible={false}
                    nodes={systematicNodes}
                    activeArticleId={firstArticleId}
                    lawCode={subject.slug}
                    bookmarkLevels={bookmarkLevels}
                    annotationCounts={annotationCounts}
                    progressByArticle={progressByArticle}
                  />
                ) : (
                  <ArticleTree
                    nodes={articles}
                    activeArticleId={firstArticleId}
                    lawCode={subject.slug}
                    bookmarkLevels={bookmarkLevels}
                    annotationCounts={annotationCounts}
                    searchVisible={false}
                    lazyExpand={
                      subject.slug === "civil" ? { lawId } : undefined
                    }
                  />
                )}
              </div>
            </MobileNavDrawer>
          </div>

          {/* ── 체계도 노드 헤더 카드 ── */}
          <Card className="overflow-hidden rounded-xl border shadow-sm">
            <CardHeader className="px-6 pt-5 pb-4">
              {/* eyebrow + 형제 노드 ←/→ — 같은 parent 안 ord 순. 조문 viewer 와 동일 위치. */}
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-link text-[11px] font-bold tracking-widest uppercase">
                  {subject.name} · 체계도 단원{" "}
                  {nodePrevNext.total > 1 ? (
                    <span className="text-muted-foreground ml-1 tracking-normal normal-case">
                      ({nodePrevNext.idx + 1} / {nodePrevNext.total})
                    </span>
                  ) : null}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleLeft}
                    aria-pressed={leftCollapsed}
                    title="읽기 모드 — 트리 접고 본문 집중"
                    className={`hidden h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors lg:inline-flex ${
                      leftCollapsed
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <ScrollTextIcon className="size-3.5" /> 읽기 모드
                  </button>
                  <NodePrevNextButton
                    direction="prev"
                    subjectSlug={subject.slug}
                    nodeId={nodePrevNext.prevNodeId}
                    label={nodePrevNext.prevLabel}
                  />
                  <NodePrevNextButton
                    direction="next"
                    subjectSlug={subject.slug}
                    nodeId={nodePrevNext.nextNodeId}
                    label={nodePrevNext.nextLabel}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-foreground text-[28px] leading-tight font-extrabold tracking-tight">
                  {stripSystematicNumber(node.displayLabel)}
                </h1>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                연결된 조문{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {node.articles.length}
                </span>
                개
              </p>
              {/* feat-9-010 — 이 쟁점(노드) 대상 Q&A. 조문 단위 Q&A(각 조문 패널)와 별개로,
                  이 쟁점으로 특정해 물은 질문을 여기 모아 보여준다. */}
              <details
                // 조문 없는 노드(실용신안법 등)는 Q&A 가 본문 콘텐츠 — 기본 펼침.
                open={node.articles.length === 0 && nodeQnaThreads.length > 0}
                className="border-border bg-muted/20 mt-3 rounded-xl border px-3 py-2"
              >
                <summary className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs font-semibold">
                  <MessageCircleQuestionIcon className="size-3.5" />이 쟁점에 대한 질문
                  {nodeQnaThreads.length > 0 ? ` ${nodeQnaThreads.length}` : ""}
                </summary>
                <div className="mt-3">
                  <QnaPanel
                    threads={nodeQnaThreads}
                    targetType="node"
                    targetId={node.nodeId}
                    showQuality={loaderData.isStaff}
                    fromCtx={`node:${node.nodeId}`}
                  />
                </div>
              </details>
              {/* 모드 토글 버튼 행 */}
              <div className="border-border mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                {blankAvailableCount > 0 ? (
                  <>
                    <Button
                      variant={blankMode ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setBlankMode((v) => !v);
                        if (!blankMode) {
                          setSubjectBlankMode(false);
                          setPeriodBlankMode(false);
                        }
                      }}
                      className="h-9 gap-1.5 rounded-full text-xs sm:h-7"
                    >
                      <PencilLineIcon className="size-3.5" />
                      내용 빈칸 모드
                      <span className="text-muted-foreground ml-0.5 tabular-nums">
                        {blankAvailableCount}/{node.articles.length}
                      </span>
                    </Button>
                    {blankMode && blankOwners.length > 1 ? (
                      <BlankOwnerPageSelector
                        owners={blankOwners}
                        current={selectedBlankOwner}
                      />
                    ) : null}
                  </>
                ) : null}
                {subjectBlankAvailableCount > 0 ? (
                  <Button
                    variant={subjectBlankMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSubjectBlankMode((v) => !v);
                      if (!subjectBlankMode) {
                        setBlankMode(false);
                        setPeriodBlankMode(false);
                      }
                    }}
                    className="h-7 gap-1.5 rounded-full text-xs"
                  >
                    <PencilLineIcon className="size-3.5" />
                    주체 빈칸 모드
                    <span className="text-muted-foreground ml-0.5 tabular-nums">
                      {subjectBlankAvailableCount}/{node.articles.length}
                    </span>
                  </Button>
                ) : null}
                {periodBlankAvailableCount > 0 ? (
                  <Button
                    variant={periodBlankMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setPeriodBlankMode((v) => !v);
                      if (!periodBlankMode) {
                        setBlankMode(false);
                        setSubjectBlankMode(false);
                      }
                    }}
                    className="h-7 gap-1.5 rounded-full text-xs"
                  >
                    <PencilLineIcon className="size-3.5" />
                    기간 빈칸 모드
                    <span className="text-muted-foreground ml-0.5 tabular-nums">
                      {periodBlankAvailableCount}/{node.articles.length}
                      {periodAmbiguousAll.length > 0
                        ? ` · ?${periodAmbiguousAll.length}`
                        : ""}
                    </span>
                  </Button>
                ) : null}
                <Button
                  variant={subtitlesOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSubtitlesOnly((v) => !v)}
                  disabled={blankMode || subjectBlankMode || periodBlankMode}
                  className="h-7 gap-1.5 rounded-full text-xs"
                >
                  {subtitlesOnly ? (
                    <EyeIcon className="size-3.5" />
                  ) : (
                    <EyeOffIcon className="size-3.5" />
                  )}
                  소제목만 보기
                </Button>
              </div>
            </CardHeader>
          </Card>

          {periodBlankMode && periodAmbiguousAll.length > 0 ? (
            <PeriodAmbiguousPanel cases={periodAmbiguousAll} />
          ) : null}

          {/* 연관 자료 미니맵 — 후속 다듬기 위해 일시 숨김. */}
          {SHOW_NODE_MINI_GRAPH && node.articles.length > 0 ? (
            <NodeMiniGraph
              articles={node.articles.map((a) => ({
                articleId: a.articleId,
                articleNumber: a.articleNumber,
                displayLabel: a.displayLabel,
              }))}
              relatedCasesByArticle={relatedCasesByArticle}
              problemsByArticle={problemsByArticle}
              subjectSlug={subject.slug}
            />
          ) : null}

          {/* ── 조문 카드 목록 ── */}
          {node.articles.length === 0 ? (
            <Card className="rounded-xl border shadow-sm">
              <CardContent className="py-16 text-center">
                <p className="text-muted-foreground text-sm">
                  이 단원에 연결된 조문이 없습니다.
                </p>
              </CardContent>
            </Card>
          ) : (
            node.articles.map((a) => {
              const body = parseArticleBody(a.bodyJson);
              const importance = Math.max(0, Math.min(3, a.importance));
              const bookmark = bookmarksByArticle[a.articleId] ?? null;
              const memos = memosByArticle[a.articleId] ?? [];
              const highlights = highlightsByArticle[a.articleId] ?? [];
              const qnaThreads = qnaByArticle[a.articleId] ?? [];
              const blankSet = blankSetsByArticle[a.articleId];
              return (
                <Card
                  key={a.articleId}
                  id={`article-${a.articleId}`}
                  className="overflow-hidden rounded-xl border shadow-sm"
                >
                  {/* 조문 카드 헤더 */}
                  <CardHeader className="border-border border-b px-6 pt-5 pb-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* 조문 제목 + 링크 */}
                      {a.articleNumber ? (
                        <Link
                          to={`/subjects/${subject.slug}/articles/${a.articleNumber}`}
                          viewTransition
                          className="hover:text-link group inline-flex items-baseline gap-0"
                        >
                          <h2 className="text-foreground group-hover:text-link text-[22px] leading-snug font-bold tracking-tight transition-colors">
                            {a.displayLabel}
                          </h2>
                        </Link>
                      ) : (
                        <h2 className="text-foreground text-[22px] leading-snug font-bold tracking-tight">
                          {a.displayLabel}
                        </h2>
                      )}
                      {/* 중요도 별 */}
                      {importance > 0 ? (
                        <span
                          className="inline-flex items-center gap-0.5 text-sm text-amber-500 dark:text-amber-400"
                          aria-label={`중요도 ${importance}성급`}
                        >
                          {Array.from({ length: 3 }, (_, i) => (
                            <span
                              key={i}
                              className={
                                i < importance
                                  ? "text-amber-500 dark:text-amber-400"
                                  : "text-muted-foreground/30"
                              }
                            >
                              ★
                            </span>
                          ))}
                        </span>
                      ) : null}
                      {/* 시행일 */}
                      {a.effectiveDate ? (
                        <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                          시행 {a.effectiveDate}
                        </span>
                      ) : null}
                    </div>
                  </CardHeader>
                  {/* 조문 카드 본문 — 2열 분할 (본문 | 우측 패널) */}
                  <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
                    {/* 본문 열 */}
                    <div className="lg:border-border px-6 py-5 lg:border-r">
                      {blankMode && blankSet && body ? (
                        <BlankFill
                          v2={blankV2}
                          setId={blankSet.setId}
                          body={body}
                          blanks={blankSet.blanks}
                          titleMap={titleMap}
                          lawCode={subject.slug}
                        />
                      ) : subjectBlankMode && body ? (
                        <BlankFill
                          v2={blankV2}
                          setId={null}
                          autoMeta={{
                            articleId: a.articleId,
                            blankType: "subject",
                          }}
                          body={body}
                          blanks={subjectBlanksByArticle.get(a.articleId) ?? []}
                          titleMap={titleMap}
                          lawCode={subject.slug}
                        />
                      ) : periodBlankMode && body ? (
                        <BlankFill
                          v2={blankV2}
                          setId={null}
                          autoMeta={{
                            articleId: a.articleId,
                            blankType: "period",
                          }}
                          body={body}
                          blanks={
                            periodResultByArticle.get(a.articleId)?.blanks ?? []
                          }
                          titleMap={titleMap}
                          lawCode={subject.slug}
                        />
                      ) : (
                        <HighlightOverlay
                          fieldPath="article.body"
                          targetType="article"
                          targetId={a.articleId}
                          highlights={highlights}
                          viewerIsStaff={canEditComment}
                        >
                          {body ? (
                            <div className="text-foreground text-[17px] leading-[1.8] [&_*]:leading-[1.8]">
                              <ArticleBodyView
                                body={body}
                                titleMap={titleMap}
                                subtitlesOnly={subtitlesOnly}
                                lawCode={subject.slug}
                                memos={memos}
                              />
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-sm">
                              본문이 등록되지 않았거나 표시할 수 없는
                              형식입니다.
                            </p>
                          )}
                        </HighlightOverlay>
                      )}
                    </div>
                    {/* 우측 패널 열 — 모바일: 접기(스크롤 단축) / lg↑: 본문 높이에 맞춰
                        채우고(absolute) 넘치면 내부 스크롤. 짧은 조문 대비 최소 높이로 레일 보호. */}
                    <div className="bg-muted/40 dark:bg-muted/20 lg:relative lg:min-h-[26rem]">
                      <MobileCollapsiblePanel>
                        <ArticleRightPanel
                          target={{ type: "article", id: a.articleId }}
                          className="lg:absolute lg:inset-0"
                          bookmark={bookmark}
                          memos={memos}
                          highlights={highlights}
                          qnaThreads={qnaThreads}
                          qnaFromCtx={`artnode:${a.articleId}:${node.nodeId}`}
                          oxQuestions={oxQuestionsByArticle[a.articleId] ?? []}
                          oxAnnotationsByRef={oxAnnotationsByRef}
                          relatedCases={
                            relatedCasesByArticle[a.articleId] ?? []
                          }
                          subjectSlug={subject.slug}
                          comments={commentsByArticle[a.articleId] ?? []}
                          canEditComment={canEditComment}
                          currentUserId={currentUserId}
                          isAdmin={isAdmin}
                          viewerIsStaff={canEditComment}
                          importance={a.importance}
                          lectureResources={
                            lectureResourcesByArticle[a.articleId] ?? []
                          }
                          pdfLocations={
                            pdfLocationsByArticle[a.articleId] ?? []
                          }
                          pdfLocationsEnabled={pdfLocationsEnabled}
                        />
                      </MobileCollapsiblePanel>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </main>
      </div>
    </div>
  );
}

// ── 조문 카드 우측 패널 — 모바일 접기 ─────────────────────────
// 체계도 노드는 한 화면에 여러 조문 카드를 쌓으므로, 모바일에선 카드마다 우측
// 패널(학습 보조/관련 자료)이 본문 아래로 길게 누적된다. 모바일은 기본 접힘 +
// 토글 버튼, lg↑ 는 grid 2열에서 항상 표시(버튼 숨김 · 내용 강제 표시).
function MobileCollapsiblePanel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="border-border text-foreground hover:bg-accent flex w-full items-center justify-between gap-2 border-t px-6 py-3 text-sm font-medium transition-colors lg:hidden"
      >
        <span className="flex items-center gap-1.5">
          <PanelRightIcon className="size-4" aria-hidden="true" />
          학습 보조 · 관련 자료
        </span>
        <ChevronDownIcon
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <div className={`lg:block ${open ? "block" : "hidden"}`}>{children}</div>
    </>
  );
}

// ── 같은 parent 안 형제 노드 ←/→ ─────────────────────────────
// 조문 viewer 의 PrevNextButton 과 동일 톤(rounded-full border, font-mono 라벨).
// href null → disabled "처음"/"마지막" pill.
function NodePrevNextButton({
  direction,
  subjectSlug,
  nodeId,
  label,
}: {
  direction: "prev" | "next";
  subjectSlug: string;
  nodeId: string | null;
  label: string | null;
}) {
  const Icon = direction === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  const aria = direction === "prev" ? "이전 단원" : "다음 단원";
  if (!nodeId || !label) {
    return (
      <button
        type="button"
        disabled
        aria-label={aria}
        className="border-border bg-background text-muted-foreground inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-full border px-3 text-xs opacity-40"
      >
        {direction === "prev" ? <Icon className="size-3.5" /> : null}
        <span>{direction === "prev" ? "처음" : "마지막"}</span>
        {direction === "next" ? <Icon className="size-3.5" /> : null}
      </button>
    );
  }
  return (
    <Link
      to={`/subjects/${subjectSlug}/systematic/${nodeId}`}
      aria-label={`${aria}: ${stripSystematicNumber(label)}`}
      className="border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12px] font-semibold transition-colors"
    >
      {direction === "prev" ? <Icon className="size-3.5 shrink-0" /> : null}
      <span className="max-w-[160px] truncate">
        {stripSystematicNumber(label)}
      </span>
      {direction === "next" ? <Icon className="size-3.5 shrink-0" /> : null}
    </Link>
  );
}
