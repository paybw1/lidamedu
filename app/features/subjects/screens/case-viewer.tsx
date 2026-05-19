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
  findActiveCaseByDeletedId,
  getCaseById,
  getCaseCountsByArticle,
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
  buildCaseTreeCounts,
  getSubjectAxisCounts,
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
  const law = await getLawByCode(client, lawCode);
  if (!law) {
    throw data("Law not seeded", { status: 404 });
  }

  const [kase, articles, systematicNodes, caseCountsByArticle] =
    await Promise.all([
      getCaseById(client, params.caseId),
      getArticleSkeleton(client, law.lawId),
      getSystematicSkeleton(client, lawCode),
      getCaseCountsByArticle(client, law.lawId),
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
  } = await client.auth.getUser();
  if (!user) {
    throw data("Unauthorized", { status: 401 });
  }

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
    caseCountsByArticle,
  );

  const axisCounts = await getSubjectAxisCounts(client, lawCode, law.lawId);

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
  } = loaderData;

  // soft-deleted 진입 fallback redirect 로 도착한 경우 — 한 번만 안내 배너.
  const [searchParams] = useSearchParams();
  const replacedNotice = searchParams.get("from") === "replaced";

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

        {/* 뒤로가기 링크 */}
        <div className="mb-4">
          <Link
            to={`/subjects/${subject.slug}?tab=cases`}
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
function CaseTreeSidebar(props: {
  subjectSlug: string;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  caseTreeCounts: CaseTreeCounts;
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
}: {
  subjectSlug: string;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  caseTreeCounts: CaseTreeCounts;
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
        active={null}
        linkBase={`/subjects/${subjectSlug}`}
      />
    </div>
  );
}
