import type { Route } from "./+types/systematic-node-viewer";

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  ListTreeIcon,
  PanelRightIcon,
  PencilLineIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { SheetHeader, SheetTitle } from "~/core/components/ui/sheet";
import makeServerClient from "~/core/lib/supa-client.server";
import { HighlightOverlay } from "~/features/annotations/components/highlight-overlay";
import { HighlightToolbar } from "~/features/annotations/components/highlight-toolbar";
import {
  getBookmarksByArticleIds,
  getUserArticleAnnotationCounts,
  getUserArticleBookmarkLevels,
  listHighlightsByArticleIds,
  listMemosByArticleIds,
} from "~/features/annotations/queries.server";
import { BlankFillView } from "~/features/blanks/components/blank-fill-view";
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
import { listThreadsForTarget } from "~/features/qna/queries.server";
import { getRelatedCasesByArticle } from "~/features/relations/queries.server";
import { ArticleTree } from "~/features/subjects/components/article-tree";
import {
  LeftPanelToggle,
  leftOnlyGridCls,
  useLeftPanelCollapse,
} from "~/features/subjects/components/left-panel-collapse";
import { MobileNavDrawer } from "~/features/subjects/components/mobile-nav-drawer";
import { NodeMiniGraph } from "~/features/subjects/components/node-mini-graph";
import {
  SortAxisProvider,
  SortAxisToggle,
  useSortAxis,
} from "~/features/subjects/components/sort-axis";
import { SubjectBookmarkRail } from "~/features/subjects/components/subject-bookmark-rail";
import { stripSystematicNumber } from "~/features/subjects/components/systematic-node-label";
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
    return [{ title: "체계도 그룹 | Lidam Patent Attorney Academy" }];
  return [
    {
      title: `${loaderData.subject.name} ${stripSystematicNumber(loaderData.node.displayLabel)} | Lidam Patent Attorney Academy`,
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
  ] = await Promise.all([
    getArticleSkeleton(client, law.lawId),
    getSystematicSkeleton(client, lawCode),
    getUserArticleBookmarkLevels(client, user.id),
    getUserArticleAnnotationCounts(client, user.id),
    getBookmarksByArticleIds(client, user.id, articleIds),
    listMemosByArticleIds(client, user.id, articleIds),
    listHighlightsByArticleIds(client, user.id, articleIds),
    Promise.all(
      articleIds.map((id) =>
        listThreadsForTarget(client, "article", id, 20).then(
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
        getOxQuestionsForArticle(client, id, 50, {
          nodeSubtreeIds: subtreeNodeIds,
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
    getStaffRole(client, user.id),
    listLectureResourcesByArticleIds(client, articleIds),
    getPdfLocationsByTargetIds(client, "article", articleIds),
    getPdfLocationsEnabled(client),
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

  return {
    subject: LAW_SUBJECTS[lawCode],
    axisCounts,
    lawId: law.lawId,
    node,
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
    selectedBlankOwner: ownerParam,
    commentsByArticle,
    canEditComment: staffRole !== null,
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
    lawId,
    node,
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

      <SubjectBookmarkRail
        subjectSlug={subject.slug}
        active="articles"
        counts={loaderData.axisCounts}
        className="lg:sticky lg:top-20"
      />
      <div
        className={`grid min-w-0 flex-1 gap-5 ${leftOnlyGridCls(leftCollapsed)}`}
      >
        {/* ── 좌측 트리 (데스크톱, 접기/펼치기) ── */}
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-auto">
          {leftCollapsed ? (
            <div className="border-border bg-card flex justify-center rounded-xl border py-2 shadow-sm">
              <LeftPanelToggle collapsed onToggle={toggleLeft} />
            </div>
          ) : (
            <Card className="rounded-xl border py-4 shadow-sm">
              {/* 토글+정렬축 헤더 — 트리 스크롤해도 상단 고정(sticky top-0). */}
              <CardHeader className="border-border bg-card sticky top-0 z-10 border-b px-4 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <LeftPanelToggle collapsed={false} onToggle={toggleLeft} />
                  <SortAxisToggle
                    size="sm"
                    disabledAxes={systematicEmpty ? ["systematic"] : undefined}
                  />
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-2">
                {renderSystematic ? (
                  <SystematicTree
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
                    lazyExpand={
                      subject.slug === "civil" ? { lawId } : undefined
                    }
                  />
                )}
              </CardContent>
            </Card>
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
                  <ListTreeIcon className="size-3.5" /> 조문 트리
                </Button>
              }
            >
              <SheetHeader>
                <SheetTitle>조문 트리</SheetTitle>
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
                <p className="text-primary text-[11px] font-bold tracking-widest uppercase">
                  {subject.name} · 체계도 노드{" "}
                  {nodePrevNext.total > 1 ? (
                    <span className="text-muted-foreground ml-1 tracking-normal normal-case">
                      ({nodePrevNext.idx + 1} / {nodePrevNext.total})
                    </span>
                  ) : null}
                </p>
                <div className="flex items-center gap-2">
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
                매핑된 조문{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {node.articles.length}
                </span>
                개
              </p>
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
                  이 노드에 매핑된 조문이 없습니다.
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
                          className="hover:text-primary group inline-flex items-baseline gap-0"
                        >
                          <h2 className="text-foreground group-hover:text-primary text-[22px] leading-snug font-bold tracking-tight transition-colors">
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
                        <BlankFillView
                          setId={blankSet.setId}
                          body={body}
                          blanks={blankSet.blanks}
                          titleMap={titleMap}
                          lawCode={subject.slug}
                        />
                      ) : subjectBlankMode && body ? (
                        <BlankFillView
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
                        <BlankFillView
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
                              본문이 등록되지 않았거나 파싱할 수 없는
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
  const aria = direction === "prev" ? "이전 노드" : "다음 노드";
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
