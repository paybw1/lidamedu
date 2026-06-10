import type { Route } from "./+types/article-viewer";

import {
  BrainIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  FileEditIcon,
  HistoryIcon,
  ListTreeIcon,
  PanelRightIcon,
  PencilIcon,
  PencilLineIcon,
  ScrollTextIcon,
  WorkflowIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { AskAiButton } from "~/features/ai-qna/components/ask-ai-button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/core/components/ui/sheet";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { HighlightOverlay } from "~/features/annotations/components/highlight-overlay";
import { HighlightToolbar } from "~/features/annotations/components/highlight-toolbar";
import {
  getBookmark,
  getUserArticleAnnotationCounts,
  getUserArticleBookmarkLevels,
  listHighlights,
  listMemos,
} from "~/features/annotations/queries.server";
import { BlankFillView } from "~/features/blanks/components/blank-fill-view";
import { BlankOwnerSelector } from "~/features/blanks/components/blank-owner-selector";
import { PeriodAmbiguousPanel } from "~/features/blanks/components/period-ambiguous-panel";
import { computePeriodBlanks } from "~/features/blanks/lib/period-blanks";
import { computeSubjectBlanks } from "~/features/blanks/lib/subject-blanks";
import { listBlankSetsByArticle } from "~/features/blanks/queries.server";
import { listComments } from "~/features/comments/queries.server";
import { listLectureResources } from "~/features/lectures/queries.server";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import { ArticleEditor } from "~/features/laws/components/article-editor";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import { parseArticleBody } from "~/features/laws/lib/article-body";
import { compareArticlesNatural } from "~/features/laws/lib/article-sort";
import { dispatchOpenCommentTab } from "~/features/laws/lib/comment-event";
import {
  articleDisplayPrefix,
  articleNumberText,
  parseSlug,
} from "~/features/laws/lib/identifier";
import {
  type RevisionHistoryEntry,
  getArticleByNumber,
  getArticleByNumberAt,
  getArticleSkeleton,
  getLawByCode,
  getStaffRole,
  getSystematicSkeleton,
  getUpcomingArticleRevision,
  listArticleRevisionHistory,
} from "~/features/laws/queries.server";
import {
  getOxAnnotationsForRefs,
  getOxQuestionsForArticle,
} from "~/features/problems/queries.server";
import { listThreadsForTarget } from "~/features/qna/queries.server";
import { RecitationView } from "~/features/recitation/components/recitation-view";
import { getRelatedCasesByArticle } from "~/features/relations/queries.server";
import { FlowNav } from "~/features/study/components/flow-nav";
import { recordStudySession } from "~/features/study/queries.server";
import { ArticleTree } from "~/features/subjects/components/article-tree";
import {
  SortAxisProvider,
  SortAxisToggle,
  useSortAxis,
} from "~/features/subjects/components/sort-axis";
import { SubjectBookmarkRail } from "~/features/subjects/components/subject-bookmark-rail";
import { SystematicTree } from "~/features/subjects/components/systematic-tree";
import { getSubjectAxisCounts } from "~/features/subjects/lib/loader.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "조문 | Lidam Patent Attorney Academy" }];
  return [
    {
      title: `${loaderData.subject.name} ${loaderData.article.displayLabel} | Lidam Patent Attorney Academy`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) {
    throw data("Unknown subject", { status: 404 });
  }
  const lawCode = subjectParse.data;

  if (!params.articlePath) {
    throw data("Missing article path", { status: 404 });
  }
  const ident = parseSlug(params.articlePath, lawCode);
  if (!ident) {
    throw data("Invalid article path", { status: 404 });
  }

  const [client] = makeServerClient(request);

  // Phase A2 — auth 는 lawCode/lawId 의존성 없어 처음부터 병렬 시작. Stage 5 진입 시
  // 이미 완료돼 RTT 1단 감축. law 없는 early-throw 시 cleanup.
  const authPromise = client.auth.getUser();

  const law = await getLawByCode(client, lawCode);
  if (!law) {
    await authPromise.catch(() => {});
    throw data("Law not seeded", { status: 404 });
  }

  const lookupArticleNumber = articleNumberText(ident);

  // 시점 조회 ?at=YYYY-MM-DD — 그 시점에 시행 중이던 revision 을 반환.
  // 비교 모드 ?compare=YYYY-MM-DD — 동시에 다른 시점 본문을 한 화면에 함께 노출.
  const reqUrl0 = new URL(request.url);
  const atRaw = reqUrl0.searchParams.get("at");
  const atDate = atRaw && /^\d{4}-\d{2}-\d{2}$/.test(atRaw) ? atRaw : null;
  const compareRaw = reqUrl0.searchParams.get("compare");
  const compareDate =
    compareRaw && /^\d{4}-\d{2}-\d{2}$/.test(compareRaw) ? compareRaw : null;

  const [article, articles, systematicNodes] = await Promise.all([
    atDate
      ? getArticleByNumberAt(client, law.lawId, lookupArticleNumber, atDate)
      : getArticleByNumber(client, law.lawId, lookupArticleNumber),
    getArticleSkeleton(client, law.lawId),
    getSystematicSkeleton(client, lawCode),
  ]);

  if (!article) {
    throw data("Article not found", { status: 404 });
  }

  // 비교 본문 — compare 가 지정되고 article 이 있을 때만 별도 fetch.
  const compareArticle = compareDate
    ? await getArticleByNumberAt(
        client,
        law.lawId,
        lookupArticleNumber,
        compareDate,
      )
    : null;

  const {
    data: { user },
  } = await authPromise;
  if (!user) {
    throw data("Unauthorized", { status: 401 });
  }

  // Phase A2 — getSubjectAxisCounts 를 12 병렬에 합쳐 별도 RTT 1단 제거.
  const [
    relatedCases,
    bookmark,
    memos,
    highlights,
    bookmarkLevels,
    annotationCounts,
    qnaThreads,
    blankSets,
    staffRole,
    oxQuestions,
    articleComments,
    lectureResources,
    axisCounts,
  ] = await Promise.all([
    getRelatedCasesByArticle(client, article.articleId),
    getBookmark(client, user.id, "article", article.articleId),
    listMemos(client, user.id, "article", article.articleId),
    listHighlights(client, user.id, "article", article.articleId),
    getUserArticleBookmarkLevels(client, user.id),
    getUserArticleAnnotationCounts(client, user.id),
    listThreadsForTarget(client, "article", article.articleId, 20),
    listBlankSetsByArticle(client, article.articleId),
    getStaffRole(client, user.id),
    getOxQuestionsForArticle(client, article.articleId, 50),
    listComments(client, "article", article.articleId),
    listLectureResources(client, "article", article.articleId),
    getSubjectAxisCounts(client, lawCode, law.lawId),
  ]);

  // 시행 예정 본문 — 현재 시점(at/compare 아님)일 때만, 다가오는 시행본을 함께 노출.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming =
    !atDate && !compareDate
      ? await getUpcomingArticleRevision(client, article.articleId, today)
      : null;

  // 개정 이력은 staff (instructor/admin) 만 조회 — 학생에게는 노출 안 함.
  const revisions: RevisionHistoryEntry[] | null = staffRole
    ? await listArticleRevisionHistory(
        client,
        article.articleId,
        article.currentRevisionId,
      )
    : null;

  // OX 지문 별 메모/즐겨찾기 — 정답 확인 후 저장 가능하도록 oxQuestions 의 refId 단위로 prefetch.
  const oxAnnotationsByRef = await getOxAnnotationsForRefs(
    client,
    user.id,
    oxQuestions,
  );
  // ?blank=<setId> 로 owner 선택 가능. 없으면 첫 set.
  // ?subjectBlank=1 / ?periodBlank=1 / ?recitation=1 — 통계 화면에서 진입 시 해당 모드로 바로 시작.
  const reqUrl = new URL(request.url);
  const blankSetIdParam = reqUrl.searchParams.get("blank");
  const subjectBlankParam = reqUrl.searchParams.get("subjectBlank") === "1";
  const periodBlankParam = reqUrl.searchParams.get("periodBlank") === "1";
  const recitationParam = reqUrl.searchParams.get("recitation") === "1";
  const blankSet =
    blankSetIdParam != null
      ? (blankSets.find((s) => s.setId === blankSetIdParam) ??
        blankSets[0] ??
        null)
      : (blankSets[0] ?? null);

  // 진도 기록 (loader 안에서 1번 fire-and-forget; 실패해도 화면은 계속)
  recordStudySession(client, user.id, {
    subject: lawCode,
    target_type: "article",
    target_id: article.articleId,
    tab: "articles",
  }).catch(() => {});

  return {
    subject: LAW_SUBJECTS[lawCode],
    axisCounts,
    lawId: law.lawId,
    article,
    body: parseArticleBody(article.bodyJson),
    atDate,
    compareDate,
    compareBody: compareArticle
      ? parseArticleBody(compareArticle.bodyJson)
      : null,
    compareEffectiveDate: compareArticle?.effectiveDate ?? null,
    upcomingBody: upcoming ? parseArticleBody(upcoming.bodyJson) : null,
    upcomingEffectiveDate: upcoming?.effectiveDate ?? null,
    initialBlankMode: {
      subject: subjectBlankParam,
      period: periodBlankParam,
      recitation: recitationParam,
    },
    articles,
    systematicNodes,
    relatedCases,
    bookmark,
    memos,
    highlights,
    bookmarkLevels,
    annotationCounts,
    qnaThreads,
    blankSets,
    blankSet,
    staffRole,
    isAdmin: staffRole === "admin",
    currentUserId: user.id,
    revisions,
    oxQuestions,
    oxAnnotationsByRef,
    articleComments,
    lectureResources,
  };
}

export default function ArticleViewer({ loaderData }: Route.ComponentProps) {
  return (
    <SortAxisProvider>
      <ArticleViewerInner loaderData={loaderData} />
    </SortAxisProvider>
  );
}

function ArticleViewerInner({
  loaderData,
}: {
  loaderData: Route.ComponentProps["loaderData"];
}) {
  const {
    subject,
    lawId,
    article,
    body,
    atDate,
    compareDate,
    compareBody,
    compareEffectiveDate,
    upcomingBody,
    upcomingEffectiveDate,
    initialBlankMode,
    articles,
    systematicNodes,
    relatedCases,
    bookmark,
    memos,
    highlights,
    bookmarkLevels,
    annotationCounts,
    qnaThreads,
    blankSets,
    blankSet,
    staffRole,
    isAdmin,
    currentUserId,
    revisions,
    oxQuestions,
    oxAnnotationsByRef,
    articleComments,
    lectureResources,
  } = loaderData;
  const { axis } = useSortAxis();
  const systematicEmpty = systematicNodes.length === 0;
  const renderSystematic = axis === "systematic" && !systematicEmpty;

  const titleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of articles) {
      if (!a.articleNumber) continue;
      // displayLabel 에서 "제29조의2 제목" 또는 "제29조 제목" → 제목 추출
      const match = a.displayLabel.match(/^제\d+조(?:의\d+)?\s+(.+)$/);
      const title = match ? match[1] : a.displayLabel;
      m.set(a.articleNumber, title);
    }
    return m;
  }, [articles]);

  // prev / next 조문 (article level only, 자연 순서)
  // 삭제된 조문도 포함 — 구특허법 코멘트 박스를 학습할 수 있도록
  const { prev, next } = useMemo(() => {
    const onlyArticles = articles
      .filter((a) => a.level === "article" && a.articleNumber)
      .slice()
      .sort(compareArticlesNatural);
    const idx = onlyArticles.findIndex(
      (a) => a.articleId === article.articleId,
    );
    return {
      prev: idx > 0 ? onlyArticles[idx - 1] : null,
      next:
        idx >= 0 && idx < onlyArticles.length - 1
          ? onlyArticles[idx + 1]
          : null,
    };
  }, [articles, article.articleId]);

  const [subtitlesOnly, setSubtitlesOnly] = useState(false);
  const [blankMode, setBlankMode] = useState(false);
  const [subjectBlankMode, setSubjectBlankMode] = useState(
    initialBlankMode?.subject ?? false,
  );
  const [periodBlankMode, setPeriodBlankMode] = useState(
    initialBlankMode?.period ?? false,
  );
  const [recitationMode, setRecitationMode] = useState(
    initialBlankMode?.recitation ?? false,
  );
  const [editMode, setEditMode] = useState(false);
  const blankAvailable = blankSet !== null && blankSet.blanks.length > 0;
  const subjectBlanks = useMemo(
    () => (body ? computeSubjectBlanks(body) : []),
    [body],
  );
  const subjectBlankAvailable = subjectBlanks.length > 0;
  const periodResult = useMemo(
    () =>
      body
        ? computePeriodBlanks(body, {
            articleId: article.articleId,
            articleLabel: article.displayLabel,
            articleNumber: article.articleNumber,
            lawCode: subject.slug,
          })
        : { blanks: [], ambiguous: [] },
    [
      body,
      article.articleId,
      article.displayLabel,
      article.articleNumber,
      subject.slug,
    ],
  );
  const periodBlankAvailable =
    periodResult.blanks.length > 0 || periodResult.ambiguous.length > 0;
  const canEdit = staffRole !== null;
  // 빈칸 자료 편집 진입 — 자기 owner 의 set 이 있으면 거기, 없으면 새로 만들고 그 편집 화면으로
  // server action 이 알아서 redirect 처리.
  const blankSetFetcher = useFetcher();
  const blankSetSubmitting = blankSetFetcher.state !== "idle";

  // Derive current active mode label for toolbar
  const activeMode = editMode
    ? "edit"
    : blankMode
      ? "cloze"
      : subjectBlankMode
        ? "subject"
        : periodBlankMode
          ? "period"
          : recitationMode
            ? "memorize"
            : subtitlesOnly
              ? "outline"
              : "normal";

  return (
    <div className="bg-background flex min-h-[calc(100vh-56px)] flex-col">
      {article.articleNumber ? (
        <FlowNav
          subjectSlug={subject.slug}
          currentType="article"
          currentId={article.articleNumber}
        />
      ) : null}
      <HighlightToolbar targetType="article" targetId={article.articleId} />

      {/* 시점/비교 배너 — amber tone */}
      {atDate || compareDate ? (
        <div className="border-b border-amber-200 bg-amber-50/60 px-4 py-2 dark:border-amber-700/40 dark:bg-amber-950/20">
          <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
            <span>
              {compareDate ? (
                <strong>시점 비교 모드</strong>
              ) : (
                <strong>시점 조회 모드</strong>
              )}
              {atDate ? ` · 기준 ${atDate}` : null}
              {compareDate ? ` · 비교 ${compareDate}` : null}
            </span>
            <a
              href={
                typeof window !== "undefined" ? window.location.pathname : "."
              }
              className="text-primary ml-auto hover:underline"
            >
              현재 시점으로 돌아가기 →
            </a>
          </div>
        </div>
      ) : null}

      {/* 3-pane shell: left tree | body | right panel */}
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-row items-start gap-0 px-4 py-5 md:px-8 md:py-7">
        <SubjectBookmarkRail
          subjectSlug={subject.slug}
          active="articles"
          counts={loaderData.axisCounts}
          className="lg:sticky lg:top-20"
        />
        <div className="grid min-w-0 flex-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          {/* ── LEFT TREE (desktop sticky) ─────────────────────────────── */}
          <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
            <div className="border-border bg-card rounded-xl border shadow-sm">
              <div className="border-border flex items-center justify-end gap-2 border-b px-3 py-2.5">
                <SortAxisToggle
                  size="sm"
                  disabledAxes={systematicEmpty ? ["systematic"] : undefined}
                />
              </div>
              <div className="px-1.5 py-2">
                {renderSystematic ? (
                  <SystematicTree
                    nodes={systematicNodes}
                    activeArticleId={article.articleId}
                    lawCode={subject.slug}
                    bookmarkLevels={bookmarkLevels}
                    annotationCounts={annotationCounts}
                  />
                ) : (
                  <ArticleTree
                    nodes={articles}
                    activeArticleId={article.articleId}
                    lawCode={subject.slug}
                    bookmarkLevels={bookmarkLevels}
                    annotationCounts={annotationCounts}
                    lazyExpand={
                      subject.slug === "civil" ? { lawId } : undefined
                    }
                  />
                )}
                {axis === "systematic" && systematicEmpty ? (
                  <p className="text-muted-foreground mt-2 px-2 text-xs">
                    * {subject.name} 테크 트리 데이터 미입력 — 조문 트리로 표시
                  </p>
                ) : null}
              </div>
            </div>
          </aside>

          {/* ── MAIN BODY ───────────────────────────────────────────────── */}
          <main className="min-w-0 space-y-4">
            {/* Mobile drawer triggers */}
            <div className="flex flex-wrap gap-2 lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 rounded-full text-xs"
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
                        activeArticleId={article.articleId}
                        lawCode={subject.slug}
                        bookmarkLevels={bookmarkLevels}
                        annotationCounts={annotationCounts}
                      />
                    ) : (
                      <ArticleTree
                        nodes={articles}
                        activeArticleId={article.articleId}
                        lawCode={subject.slug}
                        bookmarkLevels={bookmarkLevels}
                        annotationCounts={annotationCounts}
                        lazyExpand={
                          subject.slug === "civil" ? { lawId } : undefined
                        }
                      />
                    )}
                    {axis === "systematic" && systematicEmpty ? (
                      <p className="text-muted-foreground mt-2 px-2 text-xs">
                        * {subject.name} 테크 트리 데이터 미입력 — 조문 트리로
                        표시
                      </p>
                    ) : null}
                  </div>
                </SheetContent>
              </Sheet>
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 rounded-full text-xs"
                    data-testid="open-right-drawer"
                  >
                    <PanelRightIcon className="size-3.5" /> 우측 패널
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
                      target={{ type: "article", id: article.articleId }}
                      bookmark={bookmark}
                      memos={memos}
                      highlights={highlights}
                      qnaThreads={qnaThreads}
                      relatedCases={relatedCases}
                      oxQuestions={oxQuestions}
                      oxAnnotationsByRef={oxAnnotationsByRef}
                      comments={articleComments}
                      canEditComment={staffRole !== null}
                      currentUserId={currentUserId}
                      isAdmin={isAdmin}
                      subjectSlug={subject.slug}
                      revisions={revisions ?? undefined}
                      viewerIsStaff={staffRole !== null}
                      importance={article.importance}
                      lectureResources={lectureResources}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* ── Article header card ───────────────────────────────────── */}
            <div className="border-border bg-card rounded-xl border shadow-sm">
              <div className="px-6 pt-5 pb-4">
                {/* Breadcrumb eyebrow */}
                <p className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-widest uppercase">
                  {subject.name}
                  {article.articleNumber
                    ? ` · ${articleDisplayPrefix(article.articleNumber)}`
                    : ""}
                </p>

                {/* Title row: big article number + prev/next */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Law name chip + importance stars */}
                    <div className="mb-2.5 flex flex-wrap items-center gap-2">
                      <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                        {subject.name}
                      </span>
                      {article.importance >= 1 ? (
                        <span className="inline-flex items-center gap-0.5">
                          {Array.from({
                            length: Math.min(3, article.importance),
                          }).map((_, i) => (
                            <svg
                              key={i}
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="#F7B500"
                              stroke="#F7B500"
                              strokeWidth={1.6}
                              aria-hidden="true"
                            >
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
                            </svg>
                          ))}
                          {Array.from({
                            length: Math.max(0, 3 - article.importance),
                          }).map((_, i) => (
                            <svg
                              key={`e-${i}`}
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#F7B500"
                              strokeWidth={1.6}
                              aria-hidden="true"
                            >
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
                            </svg>
                          ))}
                        </span>
                      ) : null}
                    </div>

                    {/* Article headline */}
                    <h1 className="text-foreground text-[28px] leading-tight font-extrabold tracking-tight md:text-[30px]">
                      <span className="text-primary">
                        {article.displayLabel.split(/\s+/)[0]}
                      </span>{" "}
                      <span>
                        {article.displayLabel.split(/\s+/).slice(1).join(" ")}
                      </span>
                    </h1>

                    {/* Sub-line: effective date + snapshot */}
                    {article.effectiveDate ? (
                      <p className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-[13px]">
                        <ClockIcon
                          className="size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        시행 {article.effectiveDate}
                      </p>
                    ) : null}
                  </div>

                  {/* Prev / Next buttons */}
                  <div className="flex shrink-0 items-center gap-2">
                    <PrevNextButton
                      direction="prev"
                      target={prev}
                      subjectSlug={subject.slug}
                    />
                    <PrevNextButton
                      direction="next"
                      target={next}
                      subjectSlug={subject.slug}
                    />
                  </div>
                </div>
              </div>

              {/* ── Snapshot / revision banner ─────────────────────────── */}
              {article.effectiveDate && !atDate && !compareDate ? (
                <div className="border-primary/15 bg-primary/10 text-primary mx-6 mb-4 flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs">
                  <HistoryIcon
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    <strong>최신 시행 ({article.effectiveDate})</strong>
                    {" · "}현재 시행 중인 개정 스냅샷입니다.
                  </span>
                  <Link
                    to="?at=prev"
                    className="ml-auto shrink-0 font-semibold underline underline-offset-2"
                  >
                    이전 시점 보기 →
                  </Link>
                </div>
              ) : null}

              {/* ── Mode toolbar ───────────────────────────────────────── */}
              <div className="border-border bg-muted/50 mx-6 mb-5 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5">
                {/* Pill-group segmented control */}
                <div className="border-border bg-background inline-flex items-center gap-0.5 rounded-full border p-1">
                  <ModeButton
                    active={activeMode === "normal"}
                    onClick={() => {
                      setBlankMode(false);
                      setSubjectBlankMode(false);
                      setPeriodBlankMode(false);
                      setRecitationMode(false);
                      setSubtitlesOnly(false);
                      setEditMode(false);
                    }}
                    disabled={false}
                  >
                    본문
                  </ModeButton>
                  {blankAvailable ? (
                    <ModeButton
                      active={activeMode === "cloze"}
                      onClick={() => {
                        setBlankMode((v) => !v);
                        if (!blankMode) {
                          setSubjectBlankMode(false);
                          setPeriodBlankMode(false);
                          setRecitationMode(false);
                          setSubtitlesOnly(false);
                          setEditMode(false);
                        }
                      }}
                      disabled={editMode}
                    >
                      <PencilLineIcon className="size-3" aria-hidden="true" />
                      내용 빈칸
                      <span className="text-[10px] tabular-nums opacity-70">
                        {blankSet!.blanks.length}
                      </span>
                    </ModeButton>
                  ) : null}
                  {subjectBlankAvailable ? (
                    <ModeButton
                      active={activeMode === "subject"}
                      onClick={() => {
                        setSubjectBlankMode((v) => !v);
                        if (!subjectBlankMode) {
                          setBlankMode(false);
                          setPeriodBlankMode(false);
                          setRecitationMode(false);
                          setSubtitlesOnly(false);
                          setEditMode(false);
                        }
                      }}
                      disabled={editMode}
                    >
                      <PencilLineIcon className="size-3" aria-hidden="true" />
                      주체 빈칸
                      <span className="text-[10px] tabular-nums opacity-70">
                        {subjectBlanks.length}
                      </span>
                    </ModeButton>
                  ) : null}
                  {periodBlankAvailable ? (
                    <ModeButton
                      active={activeMode === "period"}
                      onClick={() => {
                        setPeriodBlankMode((v) => !v);
                        if (!periodBlankMode) {
                          setBlankMode(false);
                          setSubjectBlankMode(false);
                          setRecitationMode(false);
                          setSubtitlesOnly(false);
                          setEditMode(false);
                        }
                      }}
                      disabled={editMode}
                    >
                      <PencilLineIcon className="size-3" aria-hidden="true" />
                      기간 빈칸
                      <span className="text-[10px] tabular-nums opacity-70">
                        {periodResult.blanks.length}
                        {periodResult.ambiguous.length > 0
                          ? `+${periodResult.ambiguous.length}?`
                          : ""}
                      </span>
                    </ModeButton>
                  ) : null}
                  <ModeButton
                    active={activeMode === "memorize"}
                    onClick={() => {
                      setRecitationMode((v) => !v);
                      if (!recitationMode) {
                        setBlankMode(false);
                        setSubjectBlankMode(false);
                        setPeriodBlankMode(false);
                        setSubtitlesOnly(false);
                        setEditMode(false);
                      }
                    }}
                    disabled={editMode}
                    title={
                      article.importance >= 2
                        ? "암기 추천 — 별 2개 이상 중요 조문"
                        : "조/항/호/목 골격만 두고 본문을 직접 입력해 암기"
                    }
                  >
                    <BrainIcon className="size-3" aria-hidden="true" />
                    암기
                    {article.importance >= 2 ? (
                      <span className="text-amber-500">★</span>
                    ) : null}
                  </ModeButton>
                  <ModeButton
                    active={activeMode === "outline"}
                    onClick={() => {
                      setSubtitlesOnly((v) => !v);
                      if (!subtitlesOnly) {
                        setEditMode(false);
                      }
                    }}
                    disabled={
                      blankMode ||
                      subjectBlankMode ||
                      periodBlankMode ||
                      recitationMode ||
                      editMode
                    }
                  >
                    {subtitlesOnly ? (
                      <EyeIcon className="size-3" aria-hidden="true" />
                    ) : (
                      <EyeOffIcon className="size-3" aria-hidden="true" />
                    )}
                    소제목만
                  </ModeButton>
                  {articleComments.length > 0 ? (
                    <ModeButton
                      active={false}
                      onClick={() =>
                        dispatchOpenCommentTab({
                          targetType: "article",
                          targetId: article.articleId,
                        })
                      }
                      disabled={false}
                      data-testid="open-article-comment"
                    >
                      <ScrollTextIcon className="size-3" aria-hidden="true" />
                      해설
                      <span className="text-[10px] tabular-nums opacity-70">
                        {articleComments.length}
                      </span>
                    </ModeButton>
                  ) : null}
                  {relatedCases.length > 0 && article.articleNumber ? (
                    <form method="post" action="/api/study/start-flow">
                      <input
                        type="hidden"
                        name="subject"
                        value={subject.slug}
                      />
                      <input
                        type="hidden"
                        name="articleId"
                        value={article.articleId}
                      />
                      <input
                        type="hidden"
                        name="articleNumber"
                        value={article.articleNumber}
                      />
                      <ModeButton
                        active={false}
                        asSubmit
                        disabled={false}
                        title="조문 → 관련 판례 → 그 판례를 다룬 문제 순회"
                      >
                        <WorkflowIcon className="size-3" aria-hidden="true" />
                        흐름 학습
                      </ModeButton>
                    </form>
                  ) : null}
                </div>

                {/* Ghost action buttons on the right */}
                <div className="ml-auto flex items-center gap-1.5">
                  {/* feat-9-004 — AI Q&A 진입. 현재 조문이 앵커. */}
                  <AskAiButton
                    anchorType="article"
                    anchorId={article.articleId}
                    seed={`${article.displayLabel ?? `${article.articleNumber}조`} 에 대해 설명해줘.`}
                  />
                  {canEdit ? (
                    <>
                      <Button
                        variant={editMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setEditMode((v) => !v);
                          if (!editMode) {
                            setBlankMode(false);
                            setSubtitlesOnly(false);
                          }
                        }}
                        className={cn(
                          "h-8 gap-1.5 rounded-full px-3.5 text-xs font-semibold",
                          editMode
                            ? ""
                            : "border-amber-400/70 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60",
                        )}
                        title={`${staffRole === "admin" ? "원장" : "강사"} 권한 — 본문을 수정하면 새 개정으로 저장됩니다`}
                      >
                        {editMode ? (
                          <XIcon className="size-3.5" />
                        ) : (
                          <PencilIcon className="size-3.5" />
                        )}
                        {editMode ? "편집 종료" : "조문 수정"}
                      </Button>
                      <blankSetFetcher.Form
                        method="post"
                        action="/api/blanks/admin-create-set"
                      >
                        <input
                          type="hidden"
                          name="articleId"
                          value={article.articleId}
                        />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={blankSetSubmitting}
                          className="h-7 gap-1.5 rounded-full px-3 text-xs"
                          title={
                            blankSets.some((s) => s.ownerName !== null)
                              ? "내 빈칸 자료 편집 (없으면 자동 생성)"
                              : "빈칸 자료 만들기 / 편집"
                          }
                        >
                          <FileEditIcon className="size-3.5" />
                          빈칸 자료
                        </Button>
                      </blankSetFetcher.Form>
                    </>
                  ) : null}
                  {blankMode && blankSets.length > 1 && blankSet ? (
                    <BlankOwnerSelector
                      options={blankSets}
                      currentSetId={blankSet.setId}
                    />
                  ) : null}
                </div>
              </div>

              <Separator />

              {/* ── Article body ───────────────────────────────────────── */}
              <div className="px-6 py-7">
                <div className="mx-auto max-w-[800px]">
                  {editMode ? (
                    <ArticleEditor
                      articleId={article.articleId}
                      initialBodyJson={article.bodyJson}
                      initialDisplayLabel={article.displayLabel}
                      initialImportance={article.importance}
                      lawCode={subject.slug}
                      titleMap={titleMap}
                      onCancel={() => setEditMode(false)}
                    />
                  ) : blankMode && blankSet && body ? (
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
                        articleId: article.articleId,
                        blankType: "subject",
                      }}
                      body={body}
                      blanks={subjectBlanks}
                      titleMap={titleMap}
                      lawCode={subject.slug}
                    />
                  ) : periodBlankMode && body ? (
                    <div className="space-y-3">
                      <BlankFillView
                        setId={null}
                        autoMeta={{
                          articleId: article.articleId,
                          blankType: "period",
                        }}
                        body={body}
                        blanks={periodResult.blanks}
                        titleMap={titleMap}
                        lawCode={subject.slug}
                      />
                      <PeriodAmbiguousPanel cases={periodResult.ambiguous} />
                    </div>
                  ) : recitationMode && body ? (
                    <RecitationView
                      articleId={article.articleId}
                      articleLabel={article.displayLabel}
                      body={body}
                    />
                  ) : (
                    <HighlightOverlay
                      fieldPath="article.body"
                      highlights={highlights}
                      targetType="article"
                      targetId={article.articleId}
                      viewerIsStaff={staffRole !== null}
                    >
                      {compareBody ? (
                        <div className="grid gap-6 md:grid-cols-2">
                          <div>
                            <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
                              {atDate ? `시점 ${atDate}` : "현재"}
                              {article.effectiveDate
                                ? ` (시행 ${article.effectiveDate})`
                                : ""}
                            </p>
                            {body ? (
                              <div className="text-foreground text-[17px] leading-[1.85]">
                                <ArticleBodyView
                                  body={body}
                                  titleMap={titleMap}
                                  subtitlesOnly={subtitlesOnly}
                                  lawCode={subject.slug}
                                  memos={memos}
                                />
                              </div>
                            ) : (
                              <p className="text-muted-foreground text-sm italic">
                                본문 없음
                              </p>
                            )}
                          </div>
                          <div className="border-border border-l md:pl-5">
                            <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
                              비교 시점 {compareDate}
                              {compareEffectiveDate
                                ? ` (시행 ${compareEffectiveDate})`
                                : ""}
                            </p>
                            <div className="text-foreground text-[17px] leading-[1.85]">
                              <ArticleBodyView
                                body={compareBody}
                                titleMap={titleMap}
                                subtitlesOnly={subtitlesOnly}
                                lawCode={subject.slug}
                                memos={[]}
                              />
                            </div>
                          </div>
                        </div>
                      ) : upcomingBody ? (
                        <div className="grid gap-6 md:grid-cols-2">
                          <div>
                            <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
                              현재 시행
                              {article.effectiveDate
                                ? ` (${article.effectiveDate})`
                                : ""}
                            </p>
                            {body ? (
                              <div className="text-foreground text-[17px] leading-[1.85]">
                                <ArticleBodyView
                                  body={body}
                                  titleMap={titleMap}
                                  subtitlesOnly={subtitlesOnly}
                                  lawCode={subject.slug}
                                  memos={memos}
                                />
                              </div>
                            ) : (
                              <p className="text-muted-foreground text-sm italic">
                                본문 없음
                              </p>
                            )}
                          </div>
                          <div className="rounded-lg border border-amber-300/60 bg-amber-50/40 p-4 dark:border-amber-700/40 dark:bg-amber-950/15 md:border-0 md:border-l md:border-amber-300/60 md:bg-transparent md:p-0 md:pl-5 md:dark:bg-transparent">
                            <p className="mb-2 inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">
                              🗓 {upcomingEffectiveDate} 시행 예정
                            </p>
                            <div className="text-foreground text-[17px] leading-[1.85]">
                              <ArticleBodyView
                                body={upcomingBody}
                                titleMap={titleMap}
                                subtitlesOnly={subtitlesOnly}
                                lawCode={subject.slug}
                                memos={[]}
                              />
                            </div>
                          </div>
                        </div>
                      ) : body ? (
                        <div className="text-foreground text-[17px] leading-[1.85]">
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
                          본문이 등록되지 않았거나 파싱할 수 없는 형식입니다.
                        </p>
                      )}
                    </HighlightOverlay>
                  )}
                </div>
              </div>
            </div>
          </main>

          {/* ── RIGHT PANEL (desktop sticky) ────────────────────────────── */}
          <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
            <div className="border-border bg-card rounded-xl border shadow-sm">
              <ArticleRightPanel
                target={{ type: "article", id: article.articleId }}
                bookmark={bookmark}
                memos={memos}
                highlights={highlights}
                qnaThreads={qnaThreads}
                relatedCases={relatedCases}
                oxQuestions={oxQuestions}
                oxAnnotationsByRef={oxAnnotationsByRef}
                comments={articleComments}
                canEditComment={staffRole !== null}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                subjectSlug={subject.slug}
                revisions={revisions ?? undefined}
                viewerIsStaff={staffRole !== null}
                importance={article.importance}
                lectureResources={lectureResources}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── ModeButton — pill segment inside the mode toolbar ───────────────────────
function ModeButton({
  children,
  active,
  onClick,
  disabled,
  title,
  asSubmit,
  "data-testid": dataTestId,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick?: () => void;
  disabled: boolean;
  title?: string;
  asSubmit?: boolean;
  "data-testid"?: string;
}) {
  return (
    <button
      type={asSubmit ? "submit" : "button"}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={dataTestId}
      className={[
        "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] leading-none font-medium transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-primary text-primary-foreground font-semibold shadow-sm"
          : "text-foreground hover:bg-accent hover:text-accent-foreground bg-transparent",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ── PrevNextButton ───────────────────────────────────────────────────────────
function PrevNextButton({
  direction,
  target,
  subjectSlug,
}: {
  direction: "prev" | "next";
  target: {
    articleId: string;
    articleNumber: string | null;
    displayLabel: string;
  } | null;
  subjectSlug: string;
}) {
  const Icon = direction === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  const ariaLabel = direction === "prev" ? "이전 조문" : "다음 조문";

  if (!target || !target.articleNumber) {
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

  return (
    <Link
      to={`/subjects/${subjectSlug}/articles/${target.articleNumber}`}
      viewTransition
      prefetch="intent"
      aria-label={`${ariaLabel}: ${target.displayLabel}`}
      className="border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors"
    >
      {direction === "prev" ? <Icon className="size-3.5 shrink-0" /> : null}
      {/* 모바일: 조문번호만 (제29조) / sm 이상: 전체 라벨 (제29조 발명의 정의) */}
      <span className="sm:hidden">
        {articleDisplayPrefix(target.articleNumber)}
      </span>
      <span className="hidden max-w-[140px] truncate sm:inline">
        {target.displayLabel}
      </span>
      {direction === "next" ? <Icon className="size-3.5 shrink-0" /> : null}
    </Link>
  );
}
