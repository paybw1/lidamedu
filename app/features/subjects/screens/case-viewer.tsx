import type { ReactNode } from "react";

import type { Route } from "./+types/case-viewer";

import {
  ListTreeIcon,
  NetworkIcon,
  PanelRightIcon,
  ScrollTextIcon,
} from "lucide-react";
import { Link, data, redirect, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardHeader } from "~/core/components/ui/card";
import { SheetHeader, SheetTitle } from "~/core/components/ui/sheet";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { HighlightToolbar } from "~/features/annotations/components/highlight-toolbar";
import {
  getBookmark,
  listHighlights,
  listMemos,
} from "~/features/annotations/queries.server";
import { CaseBody } from "~/features/cases/components/case-body";
import {
  type CaseSibling,
  findActiveCaseByDeletedId,
  getCaseById,
  getCaseIdsByArticleLinks,
  getCasePlacementMaps,
  getCaseSiblings,
  getCasesByIds,
  listCaseReferences,
} from "~/features/cases/queries.server";
import { listComments } from "~/features/comments/queries.server";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import {
  RelatedArticlesChips,
  RelatedSection,
} from "~/features/laws/components/related-chips";
import {
  type ArticleNode,
  type SystematicNode,
  getArticleSkeleton,
  getLawByCode,
  getStaffRole,
  getSystematicSkeleton,
} from "~/features/laws/queries.server";
import {
  getPdfLocations,
  listLectureResources,
} from "~/features/lectures/queries.server";
import { getPdfLocationsEnabled } from "~/features/lectures/settings.server";
import {
  getExamProblemsForCase,
  getRelatedProblemsByCase,
} from "~/features/problems/queries.server";
import { listThreadsForTarget } from "~/features/qna/queries.server";
import { getRelatedArticlesByCase } from "~/features/relations/queries.server";
import { FlowNav } from "~/features/study/components/flow-nav";
import { recordStudySession } from "~/features/study/queries.server";
import { CasesTree } from "~/features/subjects/components/cases-tree";
import {
  PanelEdgeHandle,
  panelGridCls,
  useLeftPanelCollapse,
  useRightPanelCollapse,
} from "~/features/subjects/components/left-panel-collapse";
import { MobileNavDrawer } from "~/features/subjects/components/mobile-nav-drawer";
import {
  SortAxisProvider,
  SortAxisToggle,
  useSortAxis,
} from "~/features/subjects/components/sort-axis";
import { SubjectAxisNav } from "~/features/subjects/components/subject-bookmark-rail";
import { ViewerBackButton } from "~/features/subjects/components/viewer-back-button";
import {
  type CaseTreeCounts,
  type CaseTreeFilter,
  buildCaseTreeCounts,
  getSubjectAxisCounts,
  systematicSubtreeNodeIds,
} from "~/features/subjects/lib/loader.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "판례 | 리담변리사학원" }];
  const c = loaderData.kase;
  return [
    {
      title: `${loaderData.subject.name} ${c.caseNumber} | 리담변리사학원`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) {
    throw data("Unknown subject", { status: 404 });
  }
  const lawCode = subjectParse.data;

  if (!params.caseId) {
    throw data("Missing case id", { status: 404 });
  }

  const [client] = makeServerClient(request);

  // Phase A2 — auth 는 lawCode/lawId 의존성 없어 처음부터 병렬 시작.
  const authPromise = client.auth.getUser();

  const law = await getLawByCode(client, lawCode);
  if (!law) {
    await authPromise.catch(() => {});
    throw data("Law not seeded", { status: 404 });
  }

  const [kase, articles, systematicNodes, placementMaps] = await Promise.all([
    getCaseById(client, params.caseId),
    getArticleSkeleton(client, law.lawId),
    getSystematicSkeleton(client, lawCode),
    getCasePlacementMaps(client, lawCode, law.lawId),
  ]);

  if (!kase) {
    // soft-deleted case 진입 — 같은 사건번호의 활성 row 가 있으면 그쪽으로 redirect.
    // (운영자가 case 를 삭제 후 같은 사건번호로 재등록한 경우 대비. dangling link 는
    // cleanup_case_links_on_soft_delete 트리거가 정리하지만, 기존 즐겨찾기/공유 URL
    // 같은 외부 진입은 여전히 deleted case_id 를 가리킬 수 있어 이 fallback 이 필요.)
    const { replacementCaseId, deletedCaseNumber } =
      await findActiveCaseByDeletedId(client, params.caseId);
    if (replacementCaseId) {
      throw redirect(
        `/subjects/${lawCode}/cases/${replacementCaseId}?from=replaced`,
      );
    }
    throw data(
      deletedCaseNumber
        ? `삭제된 판례입니다 (${deletedCaseNumber}). 같은 사건번호의 활성 판례가 없습니다.`
        : "판례를 찾을 수 없습니다.",
      { status: 404 },
    );
  }

  if (!kase.subjectLaws.includes(lawCode)) {
    throw data("Case does not belong to this subject", { status: 404 });
  }

  const {
    data: { user },
  } = await authPromise;
  if (!user) {
    throw data("Unauthorized", { status: 401 });
  }

  // prev/next 형제 list — 진입 컨텍스트(?back 의 case_node / case_article) 우선,
  // 컨텍스트 없으면 case 자체 primary placement 기반 fallback.
  // 컨텍스트 기반 시 cases-tab 의 트리 chip 과 동일한 set 사용 → 카운트 정합 보장.
  const url = new URL(request.url);
  const backRaw = url.searchParams.get("back");
  const backParams = backRaw
    ? new URLSearchParams(backRaw.startsWith("?") ? backRaw.slice(1) : backRaw)
    : null;
  const ctxNodeId = backParams?.get("case_node")?.trim() || null;
  const ctxArticleId = backParams?.get("case_article")?.trim() || null;

  const siblingsPromise: Promise<{
    kind: "node" | "article";
    placementId: string;
    siblings: CaseSibling[];
  } | null> = (async () => {
    if (ctxNodeId) {
      // 진입 컨텍스트의 노드 subtree 안 case set — placementMaps.caseSetByNodeId 의 union.
      // (체계도 axis: primary_node 직접 + primary_article→매핑 nodes + legacy ACL fallback)
      const subtreeNodeIds = systematicSubtreeNodeIds(
        systematicNodes,
        ctxNodeId,
      );
      const ids = new Set<string>();
      for (const nid of subtreeNodeIds) {
        for (const cid of placementMaps.caseSetByNodeId[nid] ?? [])
          ids.add(cid);
      }
      if (ids.size === 0) return null;
      const list = await getCasesByIds(client, [...ids]);
      return { kind: "node", placementId: ctxNodeId, siblings: list };
    }
    if (ctxArticleId) {
      // article axis 진입 — 해당 article 의 ACL case 들.
      const ids = await getCaseIdsByArticleLinks(client, [ctxArticleId]);
      if (ids.length === 0) return null;
      const list = await getCasesByIds(client, ids);
      return { kind: "article", placementId: ctxArticleId, siblings: list };
    }
    // 컨텍스트 없음 — case 자체 primary placement 기반.
    return getCaseSiblings(client, kase.caseId);
  })();

  // Phase A2 — getSubjectAxisCounts 를 12 병렬에 합쳐 별도 RTT 1단 제거.
  const [
    relatedArticles,
    relatedProblems,
    bookmark,
    memos,
    highlights,
    qnaThreads,
    references,
    staffRole,
    caseComments,
    examProblems,
    lectureResources,
    siblings,
    axisCounts,
  ] = await Promise.all([
    getRelatedArticlesByCase(client, kase.caseId),
    getRelatedProblemsByCase(client, kase.caseId, 12),
    getBookmark(client, user.id, "case", kase.caseId),
    listMemos(client, user.id, "case", kase.caseId),
    listHighlights(client, user.id, "case", kase.caseId),
    listThreadsForTarget(client, "case", kase.caseId, 20),
    listCaseReferences(client, kase.caseId),
    getStaffRole(client, user.id),
    listComments(client, "case", kase.caseId),
    getExamProblemsForCase(client, kase.caseId),
    listLectureResources(client, "case", kase.caseId),
    siblingsPromise,
    getSubjectAxisCounts(client, lawCode, law.lawId),
  ]);

  // 통합본 PDF 위치 링크(조각과 병존). staff 는 항상 미리보기, 학생은 플래그 on 시.
  const [pdfLocations, pdfFlag] = await Promise.all([
    getPdfLocations(client, "case", kase.caseId),
    getPdfLocationsEnabled(client),
  ]);
  const pdfLocationsEnabled = staffRole !== null || pdfFlag;

  recordStudySession(client, user.id, {
    subject: lawCode,
    target_type: "case",
    target_id: kase.caseId,
    tab: "cases",
  }).catch(() => {});

  const caseTreeCounts = buildCaseTreeCounts(
    articles,
    systematicNodes,
    placementMaps.caseSetByArticleId,
    placementMaps.caseSetByNodeId,
  );

  // 공식 전문 PDF — official_text_pdf_path 있을 때만 정적 redirect 라우트 URL 노출.
  // 그 라우트가 매 클릭마다 fresh signed URL 발급(1h) + 302 redirect → TTL 만료 무관.
  const officialPdfUrl = kase.officialTextPdfPath
    ? `/api/cases/${kase.caseId}/official-text-pdf`
    : null;

  return {
    subject: LAW_SUBJECTS[lawCode],
    axisCounts,
    lawId: law.lawId,
    kase,
    articles,
    systematicNodes,
    caseTreeCounts,
    relatedArticles,
    relatedProblems,
    examProblems,
    bookmark,
    memos,
    highlights,
    qnaThreads,
    references,
    canEditReferences: staffRole !== null,
    caseComments,
    canEditComment: staffRole !== null,
    canEditCase: staffRole !== null,
    isStaff: staffRole !== null,
    isAdmin: staffRole === "admin",
    currentUserId: user.id,
    lectureResources,
    pdfLocations,
    pdfLocationsEnabled,
    siblings,
    officialPdfUrl,
  };
}

export default function CaseViewer({ loaderData }: Route.ComponentProps) {
  const {
    subject,
    kase,
    articles,
    systematicNodes,
    caseTreeCounts,
    relatedArticles,
    relatedProblems,
    examProblems,
    bookmark,
    memos,
    highlights,
    qnaThreads,
    references,
    canEditReferences,
    caseComments,
    canEditComment,
    canEditCase,
    isAdmin,
    currentUserId,
    lectureResources,
    pdfLocations,
    pdfLocationsEnabled,
    siblings,
  } = loaderData;

  // soft-deleted 진입 fallback redirect 로 도착한 경우 — 한 번만 안내 배너.
  const [searchParams] = useSearchParams();
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
  const replacedNotice = searchParams.get("from") === "replaced";

  // 좌측 판례 트리 active 필터 — 이 case 의 primary placement 위치를 자동
  // 펼침/하이라이트. node > article 우선 (트리에서도 동일한 placement 규칙).
  // null 이면 트리는 루트 collapsed (placement 미설정 case).
  const activeCaseTreeFilter: CaseTreeFilter | null = kase.primaryNodeId
    ? { kind: "node", nodeId: kase.primaryNodeId }
    : kase.primaryArticleId
      ? { kind: "article", articleId: kase.primaryArticleId }
      : null;
  // 목록 페이지에서 전달된 ?back=… (cases-tab CaseRow 가 부착) — 원래 페이지·필터 보존.
  // staff "수정" → 변경 저장 → returnTo 로 복귀해도 back 은 그대로 유지되므로
  // "판례 목록으로" 클릭 시 page/search 잃지 않는다.
  const backRaw = searchParams.get("back");
  const backSafe = backRaw && backRaw.startsWith("?") ? backRaw : null;
  const listHref = `/subjects/${subject.slug}${backSafe ?? "?tab=cases"}`;

  // ←/→ 이동 — 같은 placement (primary_node_id 우선, 없으면 primary_article_id)
  // 형제 case 들 사이를 source_asc 순서대로 이동. siblings 는 loader 에서 미리 계산.
  // 현재 ?back= 는 prev/next 링크에도 동일 value 로 보존 (encode 한 번만) — 다음
  // case viewer 의 "판례 목록으로" 가 같은 list URL 로 복귀할 수 있게.
  const prevNext = (() => {
    if (!siblings) return null;
    const list = siblings.siblings;
    const idx = list.findIndex((s) => s.caseId === kase.caseId);
    if (idx < 0 || list.length <= 1) return null;
    const prev = idx > 0 ? list[idx - 1] : null;
    const next = idx < list.length - 1 ? list[idx + 1] : null;
    // backSafe 는 이미 "?..." 형태 — 그 값을 한 번 encode 해서 ?back= 로 넘긴다.
    // 이전 코드는 backSafe 를 그대로 붙여 새 URL 의 query string 으로 합쳐버려
    // ?back= prefix 가 사라지고 → 그 다음 prev/next 클릭 시 back 컨텍스트 손실.
    const qs = backSafe ? `?back=${encodeURIComponent(backSafe)}` : "";
    return {
      idx,
      total: list.length,
      prevHref: prev
        ? `/subjects/${subject.slug}/cases/${prev.caseId}${qs}`
        : null,
      prevLabel: prev?.caseNumber ?? null,
      nextHref: next
        ? `/subjects/${subject.slug}/cases/${next.caseId}${qs}`
        : null,
      nextLabel: next?.caseNumber ?? null,
    };
  })();

  return (
    <div className="bg-background min-h-[calc(100vh-56px)]">
      <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
        <FlowNav
          subjectSlug={subject.slug}
          currentType="case"
          currentId={kase.caseId}
        />
        <HighlightToolbar targetType="case" targetId={kase.caseId} />

        {replacedNotice ? (
          <div className="mb-3 rounded-lg border border-amber-300/60 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            이전에 같은 사건번호({kase.caseNumber})로 등록된 판례가 삭제되어,
            새로 등록된 활성 판례로 이동했습니다.
          </div>
        ) : null}

        {/* 뒤로가기 — 교차 이동(조문/문제→판례) 시 이전 화면으로, 없으면 판례 목록. */}
        <div className="mb-4">
          <ViewerBackButton listHref={listHref} listLabel="판례 목록으로" />
        </div>

        {/* 3분할 그리드 — §5.1. 축 내비는 좌패널 헤더로 이동. */}
        <div className="flex flex-row items-start gap-0">
          <div
            className={`grid min-w-0 flex-1 gap-5 ${panelGridCls(leftCollapsed, rightCollapsed)}`}
          >
            {/* ── 좌측 조문 트리 (데스크톱 sticky, 경계 손잡이로 접기/펼치기) ── */}
            <aside className="relative hidden lg:sticky lg:top-20 lg:block lg:self-start">
              {leftCollapsed ? (
                <div className="flex h-[70vh] items-center justify-start">
                  <PanelEdgeHandle side="left" collapsed onToggle={toggleLeft} />
                </div>
              ) : (
                <>
                <div className="border-border bg-card rounded-xl border shadow-sm lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
                  {/* 조문 뷰어와 동일 — [축 언더라인 탭] / [체계도·조문] sticky 헤더. */}
                  <CaseTreeSidebar
                    subjectSlug={subject.slug}
                    articles={articles}
                    systematicNodes={systematicNodes}
                    caseTreeCounts={caseTreeCounts}
                    activeFilter={activeCaseTreeFilter}
                    desktopHeader
                    axisNav={
                      <SubjectAxisNav
                        subjectSlug={subject.slug}
                        active="cases"
                        counts={loaderData.axisCounts}
                        showSubjective={loaderData.isStaff}
                        className="px-2 pt-1.5"
                      />
                    }
                  />
                </div>
                {/* 경계 손잡이 — 패널 오른쪽 변 세로 중앙(국가법령정보센터식). */}
                <PanelEdgeHandle
                  side="left"
                  collapsed={false}
                  onToggle={toggleLeft}
                  className="absolute top-1/2 -right-2.5 z-20 -translate-y-1/2"
                />
                </>
              )}
            </aside>

            {/* ── 중앙 본문 ── */}
            <main
              className={cn(
                "min-w-0 space-y-4",
                // 패널(좌/우 중 하나라도) 접힘 → 본문 컬럼(.case-prose)을 넓혀 빈 공간 활용.
                // 800 캡은 3패널 기본 레이아웃 가독성용 — max-w 라 main 폭 안에서 fill.
                (leftCollapsed || rightCollapsed) &&
                  "[&_.case-prose]:max-w-[1080px]",
                // 읽기 모드(양 패널 접힘) → main 폭 캡+중앙정렬(좌우 모두 비어 전체폭이 되므로).
                readingMode && "mx-auto w-full max-w-[1128px]",
              )}
            >
              {/* 모바일 드로어 트리거 */}
              <div className="flex flex-wrap gap-2 lg:hidden">
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
                      <ListTreeIcon className="size-3.5" /> 판례 트리
                    </Button>
                  }
                >
                  <SheetHeader>
                    <SheetTitle>{subject.name} 판례 트리</SheetTitle>
                  </SheetHeader>
                  <div className="px-3 pb-4">
                    <CaseTreeSidebar
                      subjectSlug={subject.slug}
                      articles={articles}
                      systematicNodes={systematicNodes}
                      caseTreeCounts={caseTreeCounts}
                      activeFilter={activeCaseTreeFilter}
                    />
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
                  <SheetHeader>
                    <SheetTitle>학습 보조</SheetTitle>
                  </SheetHeader>
                  <div className="px-3 pb-4">
                    <ArticleRightPanel
                      target={{ type: "case", id: kase.caseId }}
                      bookmark={bookmark}
                      memos={memos}
                      highlights={highlights}
                      qnaThreads={qnaThreads}
                      relatedProblems={relatedProblems}
                      comments={caseComments}
                      canEditComment={canEditComment}
                      currentUserId={currentUserId}
                      isAdmin={isAdmin}
                      viewerIsStaff={canEditCase}
                      importance={kase.importance}
                      lectureResources={lectureResources}
                      pdfLocations={pdfLocations}
                      pdfLocationsEnabled={pdfLocationsEnabled}
                    />
                  </div>
                </MobileNavDrawer>
              </div>

              {/* 관련 조문 chip 행 */}
              <Card className="border-border rounded-xl border shadow-sm">
                <CardHeader className="px-5 py-3">
                  <RelatedSection
                    title="관련 조문"
                    icon={NetworkIcon}
                    count={relatedArticles.length}
                  >
                    <RelatedArticlesChips
                      articles={relatedArticles}
                      subject={subject.slug}
                      emptyHint="이 판례에 연결된 조문이 아직 없습니다."
                    />
                  </RelatedSection>
                </CardHeader>
              </Card>

              {/* 읽기 모드 — 좌우 패널 접고 본문 집중(데스크톱). */}
              <div className="mb-3 hidden justify-end lg:flex">
                <button
                  type="button"
                  onClick={toggleReadingMode}
                  aria-pressed={readingMode}
                  title="읽기 모드 — 좌우 패널 접고 본문 집중"
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
                    readingMode
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <ScrollTextIcon className="size-3.5" /> 읽기 모드
                </button>
              </div>

              {/* ── 판례 본문 (헤더 + 요지/이유/PDF/비고) — feat-3-205 공용 컴포넌트 ── */}
              <CaseBody
                kase={kase}
                examProblems={examProblems}
                references={references}
                highlights={highlights}
                viewerIsStaff={canEditComment}
                canEditCase={canEditCase}
                canEditReferences={canEditReferences}
                prevNext={prevNext}
                officialPdfUrl={loaderData.officialPdfUrl}
                showAskAi={false}
              />
            </main>

            {/* ── 우측 학습 패널 (데스크톱 sticky, 경계 손잡이로 접기/펼치기) ── */}
            <aside className="relative hidden lg:sticky lg:top-20 lg:block lg:self-start">
              {rightCollapsed ? (
                <div className="flex h-[70vh] items-center justify-end">
                  <PanelEdgeHandle
                    side="right"
                    collapsed
                    onToggle={toggleRight}
                  />
                </div>
              ) : (
                <>
                <div className="border-border bg-card rounded-xl border shadow-sm lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
                  <ArticleRightPanel
                    target={{ type: "case", id: kase.caseId }}
                    bookmark={bookmark}
                    memos={memos}
                    highlights={highlights}
                    qnaThreads={qnaThreads}
                    relatedProblems={relatedProblems}
                    comments={caseComments}
                    canEditComment={canEditComment}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    viewerIsStaff={canEditCase}
                    importance={kase.importance}
                    lectureResources={lectureResources}
                    pdfLocations={pdfLocations}
                    pdfLocationsEnabled={pdfLocationsEnabled}
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
    </div>
  );
}

// ── 좌측 판례 트리 (조문 / 체계도 축) ─────────────────────────
// 노드 클릭 → /subjects/{slug}?tab=cases 로 이동해 그 노드의 판례 목록을 연다.
// SortAxisProvider 를 자체 보유 — 데스크톱·모바일 인스턴스가 따로 떠도 localStorage 로 축 동기화.
// activeFilter — 현재 보고 있는 case 의 primary placement (node/article).
// CasesTree 가 그 위치 조상까지 자동 펼침 + 해당 노드 하이라이트.
// 사용자 의도: "판례 화면에서 체계도가 처음부터(루트 collapsed)로 돌아가지 않고
// 이 case 가 속한 위치에 고정". 매번 case 진입 시 fresh 마운트로 expansion state
// 가 휘발되던 문제 해결.
function CaseTreeSidebar(props: {
  subjectSlug: string;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  caseTreeCounts: CaseTreeCounts;
  activeFilter: CaseTreeFilter | null;
  // 데스크톱 패널 헤더(sticky, 축 내비 포함) 렌더 여부. 모바일 드로어는 미지정.
  desktopHeader?: boolean;
  // 축 내비(조문·판례·객관식·주관식) — 데스크톱 헤더 첫 줄. 모바일 미지정.
  axisNav?: ReactNode;
}) {
  return (
    <SortAxisProvider>
      <CaseTreeSidebarInner {...props} />
    </SortAxisProvider>
  );
}

function CaseTreeSidebarInner({
  subjectSlug,
  articles,
  systematicNodes,
  caseTreeCounts,
  activeFilter,
  desktopHeader = false,
  axisNav,
}: {
  subjectSlug: string;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  caseTreeCounts: CaseTreeCounts;
  activeFilter: CaseTreeFilter | null;
  desktopHeader?: boolean;
  axisNav?: ReactNode;
}) {
  const { axis } = useSortAxis();
  const systematicEmpty = systematicNodes.length === 0;
  return (
    <div>
      {/* 헤더 — 데스크톱: [축 언더라인 탭] → [체계도/조문] sticky.
          모바일 드로어: 정렬축 토글만 우측 정렬(기존 동작). */}
      {desktopHeader ? (
        <div className="border-border bg-card sticky top-0 z-10 rounded-t-xl border-b">
          {axisNav}
          <div className="flex justify-end px-3 py-2">
            <SortAxisToggle
              size="sm"
              disabledAxes={systematicEmpty ? ["systematic"] : undefined}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2 pb-2">
          <SortAxisToggle
            size="sm"
            disabledAxes={systematicEmpty ? ["systematic"] : undefined}
          />
        </div>
      )}
      <div className={desktopHeader ? "px-1.5 py-2" : ""}>
        <CasesTree
          axis={axis}
          articles={articles}
          systematicNodes={systematicNodes}
          caseTreeCounts={caseTreeCounts}
          active={activeFilter}
          linkBase={`/subjects/${subjectSlug}`}
        />
      </div>
    </div>
  );
}
