// 한 chapter/section/part 안의 모든 조문을 한 화면에 모아 보여주는 viewer.
// 좌측 조문 트리에서 "제1장 총칙" 같은 상위 노드 클릭 시 진입.
//
// 구조는 systematic-node-viewer 와 비슷 — 다중 article 카드 + 우측 panel + 빈칸 모드.
// 차이: 그룹 식별자가 systematic node 가 아니라 article 트리의 chapter article id.
import type { Route } from "./+types/chapter-viewer";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  ListTreeIcon,
  PencilLineIcon,
  ScrollTextIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, data, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
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
  getChapterWithArticles,
  getLawByCode,
  getStaffRole,
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
} from "~/features/problems/queries.server";
import { listThreadsForTarget } from "~/features/qna/queries.server";
import { ArticleTree } from "~/features/subjects/components/article-tree";
import {
  LeftPanelToggle,
  leftOnlyGridCls,
  useLeftPanelCollapse,
} from "~/features/subjects/components/left-panel-collapse";
import {
  SortAxisProvider,
  SortAxisToggle,
  useSortAxis,
} from "~/features/subjects/components/sort-axis";
import { SubjectAxisNav } from "~/features/subjects/components/subject-bookmark-rail";
import { SystematicTree } from "~/features/subjects/components/systematic-tree";
import { getSubjectAxisCounts } from "~/features/subjects/lib/loader.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

const LEVEL_KOREAN: Record<string, string> = {
  part: "편",
  chapter: "장",
  section: "절",
};

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData)
    return [{ title: "조문 그룹 | 리담변리사학원" }];
  return [
    {
      title: `${loaderData.subject.name} ${loaderData.chapter.displayLabel} | 리담변리사학원`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) {
    throw data("Unknown subject", { status: 404 });
  }
  const lawCode = subjectParse.data;
  const chapterId = params.chapterId;
  if (!chapterId) {
    throw data("Missing chapterId", { status: 404 });
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

  // 본문은 페이지 단위(150조)로 끝까지 열람. 대용량 편(채권 405조)도 다음 페이지로 전부 본다.
  const PAGE_SIZE = 150;
  const pageParam = Number(new URL(request.url).searchParams.get("page"));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const chapter = await getChapterWithArticles(client, law.lawId, chapterId, {
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  if (!chapter) {
    throw data("Chapter not found", { status: 404 });
  }
  const totalPages = Math.max(1, Math.ceil(chapter.totalArticles / PAGE_SIZE));

  // 편/큰 장처럼 자손 조문이 많으면 per-article apparatus(주석·Q&A·OX·빈칸·강의자료)
  // 팬아웃이 수백 쿼리가 되어 서버리스(Vercel) 타임아웃을 유발한다(민법 제5편 상속 127조 등).
  // → 임계 초과 그룹은 본문만 표시하고 apparatus 조회를 건너뛴다(본문은 페이지로 끝까지 열람).
  // 임계 60: 기존 flat 법령 최대 장(특허 55조)을 무회귀로 유지하고, 민법/민소의
  // 편·대형 장(자손 60+)만 건너뛴다(절·소형 장은 그대로 전체 기능). totalArticles 기준이라
  // 모든 페이지에서 일관 적용.
  const APPARATUS_LIMIT = 60;
  const apparatusSkipped = chapter.totalArticles > APPARATUS_LIMIT;
  const articleIds = apparatusSkipped
    ? []
    : chapter.articles.map((a) => a.articleId);

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
    Promise.all(
      articleIds.map((id) =>
        listBlankSetsByArticle(client, id).then((sets) => [id, sets] as const),
      ),
    ).then((entries) => Object.fromEntries(entries)),
    Promise.all(
      articleIds.map((id) =>
        // 표시 컷 500 — 조문별 OX(기출·변형·예상)를 origin 누락 없이 전부 싣는다.
        getOxQuestionsForArticle(client, id, 500, {
          includeUnapproved: viewerStaffRole !== null,
        }).then((items) => [id, items] as const),
      ),
    ).then((entries) => Object.fromEntries(entries)),
    listCommentsBulk(client, "article", articleIds),
    Promise.resolve(viewerStaffRole),
    listLectureResourcesByArticleIds(client, articleIds),
    getPdfLocationsByTargetIds(client, "article", articleIds),
    getPdfLocationsEnabled(client),
  ]);

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

  // 모든 OX refId 를 모아 한 번에 메모/즐겨찾기 prefetch — 카드별 OxQuestionsPanel 에 그대로 전달.
  const allOxItems = Object.values(oxQuestionsByArticle).flat();
  const oxAnnotationsByRef: Record<string, OxRefAnnotations> =
    await getOxAnnotationsForRefs(client, user.id, allOxItems);

  // 책갈피 조문 수는 전체가 아니라 이 장의 조문 수 — 헤더 "조문 N" 과 일치.
  // 판례·문제 탭은 전체 색인으로 가는 링크라 과목 전체 수를 그대로 둔다.
  const axisCounts = {
    ...(await getSubjectAxisCounts(client, lawCode, law.lawId)),
    articles: chapter.totalArticles,
  };

  return {
    subject: LAW_SUBJECTS[lawCode],
    axisCounts,
    lawId: law.lawId,
    chapter,
    apparatusSkipped,
    page,
    totalPages,
    pageSize: PAGE_SIZE,
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

export default function ChapterViewer({ loaderData }: Route.ComponentProps) {
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
    chapter,
    apparatusSkipped,
    page,
    totalPages,
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
    selectedBlankOwner,
    commentsByArticle,
    canEditComment,
    isAdmin,
    lectureResourcesByArticle,
    pdfLocationsByArticle,
    pdfLocationsEnabled,
    currentUserId,
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
    () =>
      chapter.articles.filter((a) => blankSetsByArticle[a.articleId]).length,
    [chapter.articles, blankSetsByArticle],
  );
  // article 별 주체 빈칸 (즉석 생성). 본문이 있는 모든 카드에서 활성화 가능.
  const subjectBlanksByArticle = useMemo(() => {
    const m = new Map<string, BlankItem[]>();
    for (const a of chapter.articles) {
      const body = parseArticleBody(a.bodyJson);
      if (!body) continue;
      const sb = computeSubjectBlanks(body);
      if (sb.length > 0) m.set(a.articleId, sb);
    }
    return m;
  }, [chapter.articles]);
  const subjectBlankAvailableCount = subjectBlanksByArticle.size;
  // article 별 기간 빈칸 + 모호 케이스 사전 계산.
  const periodResultByArticle = useMemo(() => {
    const m = new Map<
      string,
      { blanks: BlankItem[]; ambiguous: PeriodAmbiguousCase[] }
    >();
    for (const a of chapter.articles) {
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
  }, [chapter.articles, subject.slug]);
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

  const firstArticleId = chapter.articles[0]?.articleId;
  const levelLabel = LEVEL_KOREAN[chapter.level] ?? "그룹";

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-row items-start gap-0 px-5 py-6 md:px-10 md:py-8">
      <HighlightToolbar />

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
              {/* 축 내비+토글+정렬축 헤더 — 트리 스크롤해도 상단 고정(sticky top-0). */}
              <CardHeader className="border-border bg-card sticky top-0 z-10 space-y-2 border-b px-4 pb-3">
                <SubjectAxisNav
                  subjectSlug={subject.slug}
                  active="articles"
                  counts={loaderData.axisCounts}
                  showSubjective={loaderData.isStaff}
                />
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
                  />
                ) : (
                  <ArticleTree
                    nodes={articles}
                    activeArticleId={firstArticleId}
                    activeChapterId={chapter.chapterId}
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
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-full"
                  data-testid="open-tree-drawer"
                >
                  <ListTreeIcon className="size-3.5" /> 조문 트리
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[320px] overflow-y-auto p-0 sm:max-w-[360px]"
              >
                <SheetHeader>
                  <SheetTitle>조문 트리</SheetTitle>
                </SheetHeader>
                <div className="space-y-3 px-3 pb-4">
                  <div className="flex justify-end">
                    <SortAxisToggle
                      size="sm"
                      disabledAxes={
                        systematicEmpty ? ["systematic"] : undefined
                      }
                    />
                  </div>
                  {renderSystematic ? (
                    <SystematicTree
                      nodes={systematicNodes}
                      activeArticleId={firstArticleId}
                      lawCode={subject.slug}
                      bookmarkLevels={bookmarkLevels}
                      annotationCounts={annotationCounts}
                    />
                  ) : (
                    <ArticleTree
                      nodes={articles}
                      activeArticleId={firstArticleId}
                      activeChapterId={chapter.chapterId}
                      lawCode={subject.slug}
                      bookmarkLevels={bookmarkLevels}
                      annotationCounts={annotationCounts}
                      lazyExpand={
                        subject.slug === "civil" ? { lawId } : undefined
                      }
                    />
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* ── 장 헤더 카드 ── */}
          <Card className="overflow-hidden rounded-xl border shadow-sm">
            <CardHeader className="px-6 pt-5 pb-4">
              {/* eyebrow */}
              <p className="text-link mb-2 text-[11px] font-bold tracking-widest uppercase">
                {subject.name} · {levelLabel}
              </p>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-foreground text-[28px] leading-tight font-extrabold tracking-tight">
                  {chapter.displayLabel}
                </h1>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                조문{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {chapter.articles.length}
                </span>
                개
              </p>
              {/* 모드 토글 버튼 행 */}
              <div className="border-border mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
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
                      className="h-7 gap-1.5 rounded-full text-xs"
                    >
                      <PencilLineIcon className="size-3.5" />
                      내용 빈칸 모드
                      <span className="text-muted-foreground ml-0.5 tabular-nums">
                        {blankAvailableCount}/{chapter.articles.length}
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
                      {subjectBlankAvailableCount}/{chapter.articles.length}
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
                      {periodBlankAvailableCount}/{chapter.articles.length}
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

          {/* 자손 조문이 많은 편/장 — apparatus 생략 안내 (본문은 페이지로 끝까지 열람) */}
          {apparatusSkipped ? (
            <Card className="mb-4 rounded-xl border-amber-300 bg-amber-50 shadow-sm dark:border-amber-700/50 dark:bg-amber-950/20">
              <CardContent className="py-3 text-sm text-amber-900 dark:text-amber-200">
                이 {levelLabel}에는 조문이 <b>{chapter.totalArticles}개</b>로
                많아 <b>본문만</b> 표시합니다
                {totalPages > 1 ? (
                  <>
                    {" "}
                    (<b>{totalPages}페이지</b>로 끝까지 열람)
                  </>
                ) : null}
                . 즐겨찾기·포스트잇·관련 문제·빈칸 자료 등 전체 기능은 좌측
                트리에서 <b>장·절</b>로 좁혀 들어가면 사용할 수 있습니다.
              </CardContent>
            </Card>
          ) : null}

          <ChapterPagination page={page} totalPages={totalPages} />

          {/* ── 조문 카드 목록 ── */}
          {chapter.articles.length === 0 ? (
            <Card className="rounded-xl border shadow-sm">
              <CardContent className="py-16 text-center">
                <p className="text-muted-foreground text-sm">
                  이 {levelLabel}에 포함된 조문이 없습니다.
                </p>
              </CardContent>
            </Card>
          ) : (
            chapter.articles.map((a) => {
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
                    {/* 우측 패널 열 */}
                    <div className="bg-muted/40 dark:bg-muted/20 lg:relative lg:min-h-[26rem]">
                      <ArticleRightPanel
                        target={{ type: "article", id: a.articleId }}
                        className="lg:absolute lg:inset-0"
                        bookmark={bookmark}
                        memos={memos}
                        highlights={highlights}
                        qnaThreads={qnaThreads}
                        oxQuestions={oxQuestionsByArticle[a.articleId] ?? []}
                        oxAnnotationsByRef={oxAnnotationsByRef}
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
                        pdfLocations={pdfLocationsByArticle[a.articleId] ?? []}
                        pdfLocationsEnabled={pdfLocationsEnabled}
                      />
                    </div>
                  </div>
                </Card>
              );
            })
          )}

          <ChapterPagination page={page} totalPages={totalPages} />
        </main>
      </div>
    </div>
  );
}

// 대용량 편/장 본문을 페이지 단위로 끝까지 열람. totalPages<=1 이면 표시 안 함.
// 다른 쿼리 파라미터(blank-owner 등)는 보존하고 page 만 교체.
function ChapterPagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const [searchParams] = useSearchParams();
  if (totalPages <= 1) return null;
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(p));
    return `?${next.toString()}`;
  };
  return (
    <nav
      className="mt-5 flex items-center justify-center gap-3 text-sm"
      aria-label="조문 페이지"
    >
      {page > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link to={hrefFor(page - 1)} aria-label="이전 페이지">
            <ChevronLeftIcon className="size-4" /> 이전
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          <ChevronLeftIcon className="size-4" /> 이전
        </Button>
      )}
      <span className="text-muted-foreground tabular-nums">
        {page} / {totalPages} 페이지
      </span>
      {page < totalPages ? (
        <Button asChild variant="outline" size="sm">
          <Link to={hrefFor(page + 1)} aria-label="다음 페이지">
            다음 <ChevronRightIcon className="size-4" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          다음 <ChevronRightIcon className="size-4" />
        </Button>
      )}
    </nav>
  );
}
