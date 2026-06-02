import type { Route } from "./+types/case-viewer";

import {
  ArrowLeftIcon,
  ListTreeIcon,
  NetworkIcon,
  PanelRightIcon,
} from "lucide-react";
import { Link, data, redirect, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/core/components/ui/sheet";
import makeServerClient from "~/core/lib/supa-client.server";
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
  getCaseSiblings,
  getCasePlacementMaps,
  getCasesByIds,
  listCaseReferences,
} from "~/features/cases/queries.server";
import { listComments } from "~/features/comments/queries.server";
import { listLectureResources } from "~/features/lectures/queries.server";
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
  getExamProblemsForCase,
  getRelatedProblemsByCase,
} from "~/features/problems/queries.server";
import { listThreadsForTarget } from "~/features/qna/queries.server";
import { getRelatedArticlesByCase } from "~/features/relations/queries.server";
import { FlowNav } from "~/features/study/components/flow-nav";
import { recordStudySession } from "~/features/study/queries.server";
import { CasesTree } from "~/features/subjects/components/cases-tree";
import {
  SortAxisProvider,
  SortAxisToggle,
  useSortAxis,
} from "~/features/subjects/components/sort-axis";
import { SubjectBookmarkRail } from "~/features/subjects/components/subject-bookmark-rail";
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
  if (!loaderData) return [{ title: "판례 | Lidam Patent Attorney Academy" }];
  const c = loaderData.kase;
  return [
    {
      title: `${loaderData.subject.name} ${c.caseNumber} | Lidam Patent Attorney Academy`,
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

  const [kase, articles, systematicNodes, placementMaps] =
    await Promise.all([
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
    ? new URLSearchParams(
        backRaw.startsWith("?") ? backRaw.slice(1) : backRaw,
      )
    : null;
  const ctxNodeId = backParams?.get("case_node")?.trim() || null;
  const ctxArticleId = backParams?.get("case_article")?.trim() || null;

  const siblingsPromise: Promise<
    | { kind: "node" | "article"; placementId: string; siblings: CaseSibling[] }
    | null
  > = (async () => {
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
    isAdmin: staffRole === "admin",
    currentUserId: user.id,
    lectureResources,
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
    siblings,
  } = loaderData;

  // soft-deleted 진입 fallback redirect 로 도착한 경우 — 한 번만 안내 배너.
  const [searchParams] = useSearchParams();
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

        {/* 뒤로가기 링크 — prev/next 는 CaseBody 카드 헤더 안으로 이동 (조문 뷰어와 동일 위치). */}
        <div className="mb-4">
          <Link
            to={listHref}
            viewTransition
            className="text-primary hover:text-primary/80 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          >
            <ArrowLeftIcon className="size-3.5" />
            판례 목록으로
          </Link>
        </div>

        {/* 책갈피 레일 + 3분할 그리드 — §5.1 */}
        <div className="flex flex-row items-start gap-0">
          <SubjectBookmarkRail
            subjectSlug={subject.slug}
            active="cases"
            counts={loaderData.axisCounts}
            className="lg:sticky lg:top-20"
          />
          <div className="grid min-w-0 flex-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
            {/* ── 좌측 조문 트리 (데스크톱 sticky) ── */}
            <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
              <Card className="border-border rounded-xl border py-3 shadow-sm">
                <CardHeader className="px-4 pb-2">
                  <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-widest uppercase">
                    {subject.name} 판례 트리
                  </p>
                </CardHeader>
                <CardContent className="px-2 pb-2">
                  <CaseTreeSidebar
                    subjectSlug={subject.slug}
                    articles={articles}
                    systematicNodes={systematicNodes}
                    caseTreeCounts={caseTreeCounts}
                    activeFilter={activeCaseTreeFilter}
                  />
                </CardContent>
              </Card>
            </aside>

            {/* ── 중앙 본문 ── */}
            <main className="min-w-0 space-y-4">
              {/* 모바일 드로어 트리거 */}
              <div className="flex flex-wrap gap-2 lg:hidden">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full text-xs"
                      data-testid="open-tree-drawer"
                    >
                      <ListTreeIcon className="size-3.5" /> 판례 트리
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="left"
                    className="w-[320px] overflow-y-auto p-0 sm:max-w-[360px]"
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
                  </SheetContent>
                </Sheet>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full text-xs"
                      data-testid="open-right-drawer"
                    >
                      <PanelRightIcon className="size-3.5" /> 학습 보조
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="right"
                    className="w-[340px] overflow-y-auto p-0 sm:max-w-[380px]"
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
                      />
                    </div>
                  </SheetContent>
                </Sheet>
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
              />
            </main>

            {/* ── 우측 학습 패널 (데스크톱 sticky) ── */}
            <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
              <Card className="border-border h-full rounded-xl border shadow-sm">
                <CardContent className="p-0">
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
                  />
                </CardContent>
              </Card>
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
}: {
  subjectSlug: string;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  caseTreeCounts: CaseTreeCounts;
  activeFilter: CaseTreeFilter | null;
}) {
  const { axis } = useSortAxis();
  const systematicEmpty = systematicNodes.length === 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <SortAxisToggle
          size="sm"
          disabledAxes={systematicEmpty ? ["systematic"] : undefined}
        />
      </div>
      <CasesTree
        axis={axis}
        articles={articles}
        systematicNodes={systematicNodes}
        caseTreeCounts={caseTreeCounts}
        active={activeFilter}
        linkBase={`/subjects/${subjectSlug}`}
      />
    </div>
  );
}

