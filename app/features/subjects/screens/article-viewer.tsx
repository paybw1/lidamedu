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
import { compareArticlesNatural } from "~/features/laws/lib/article-sort";
import { dispatchOpenCommentTab } from "~/features/laws/lib/comment-event";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/core/components/ui/sheet";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getBookmark,
  getUserArticleAnnotationCounts,
  getUserArticleBookmarkLevels,
  listHighlights,
  listMemos,
} from "~/features/annotations/queries.server";
import { recordStudySession } from "~/features/study/queries.server";
import { HighlightOverlay } from "~/features/annotations/components/highlight-overlay";
import { HighlightToolbar } from "~/features/annotations/components/highlight-toolbar";
import { CommentHighlightOverlay } from "~/features/comments/components/comment-highlight-overlay";
import { FlowNav } from "~/features/study/components/flow-nav";
import { BlankFillView } from "~/features/blanks/components/blank-fill-view";
import { RecitationView } from "~/features/recitation/components/recitation-view";
import { BlankOwnerSelector } from "~/features/blanks/components/blank-owner-selector";
import { PeriodAmbiguousPanel } from "~/features/blanks/components/period-ambiguous-panel";
import { computePeriodBlanks } from "~/features/blanks/lib/period-blanks";
import { computeSubjectBlanks } from "~/features/blanks/lib/subject-blanks";
import { listBlankSetsByArticle } from "~/features/blanks/queries.server";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import { ArticleEditor } from "~/features/laws/components/article-editor";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import { parseArticleBody } from "~/features/laws/lib/article-body";
import {
  articleDisplayPrefix,
  articleNumberText,
  parseSlug,
} from "~/features/laws/lib/identifier";
import {
  getArticleByNumber,
  getArticleByNumberAt,
  getArticleSkeleton,
  getLawByCode,
  getStaffRole,
  getSystematicSkeleton,
  listArticleRevisionHistory,
  type RevisionHistoryEntry,
} from "~/features/laws/queries.server";
import { listComments } from "~/features/comments/queries.server";
import {
  getOxAnnotationsForRefs,
  getOxQuestionsForArticle,
} from "~/features/problems/queries.server";
import { listThreadsForTarget } from "~/features/qna/queries.server";
import { getRelatedCasesByArticle } from "~/features/relations/queries.server";
import { ArticleTree } from "~/features/subjects/components/article-tree";
import {
  SortAxisProvider,
  SortAxisToggle,
  useSortAxis,
} from "~/features/subjects/components/sort-axis";
import { SystematicTree } from "~/features/subjects/components/systematic-tree";
import {
  EXAM_LABEL,
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/article-viewer";

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
  const law = await getLawByCode(client, lawCode);
  if (!law) {
    throw data("Law not seeded", { status: 404 });
  }

  const lookupArticleNumber = articleNumberText(ident);

  // 시점 조회 ?at=YYYY-MM-DD — 그 시점에 시행 중이던 revision 을 반환.
  // 비교 모드 ?compare=YYYY-MM-DD — 동시에 다른 시점 본문을 한 화면에 함께 노출.
  const reqUrl0 = new URL(request.url);
  const atRaw = reqUrl0.searchParams.get("at");
  const atDate =
    atRaw && /^\d{4}-\d{2}-\d{2}$/.test(atRaw) ? atRaw : null;
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
  } = await client.auth.getUser();
  if (!user) {
    throw data("Unauthorized", { status: 401 });
  }

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
  ]);

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
      ? blankSets.find((s) => s.setId === blankSetIdParam) ?? blankSets[0] ?? null
      : blankSets[0] ?? null;

  // 진도 기록 (loader 안에서 1번 fire-and-forget; 실패해도 화면은 계속)
  recordStudySession(client, user.id, {
    subject: lawCode,
    target_type: "article",
    target_id: article.articleId,
    tab: "articles",
  }).catch(() => {});

  return {
    subject: LAW_SUBJECTS[lawCode],
    lawId: law.lawId,
    article,
    body: parseArticleBody(article.bodyJson),
    atDate,
    compareDate,
    compareBody: compareArticle
      ? parseArticleBody(compareArticle.bodyJson)
      : null,
    compareEffectiveDate: compareArticle?.effectiveDate ?? null,
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
    const idx = onlyArticles.findIndex((a) => a.articleId === article.articleId);
    return {
      prev: idx > 0 ? onlyArticles[idx - 1] : null,
      next: idx >= 0 && idx < onlyArticles.length - 1 ? onlyArticles[idx + 1] : null,
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
    <div className="flex min-h-[calc(100vh-56px)] flex-col bg-background">
      {article.articleNumber ? (
        <FlowNav
          subjectSlug={subject.slug}
          currentType="article"
          currentId={article.articleNumber}
        />
      ) : null}
      <HighlightToolbar
        targetType="article"
        targetId={article.articleId}
        staff={staffRole !== null}
      />

      {/* 시점/비교 배너 — amber tone */}
      {atDate || compareDate ? (
        <div className="border-b border-amber-200 bg-amber-50/60 px-4 py-2 dark:border-amber-700/40 dark:bg-amber-950/20">
          <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
            <span>
              {compareDate ? <strong>시점 비교 모드</strong> : <strong>시점 조회 모드</strong>}
              {atDate ? ` · 기준 ${atDate}` : null}
              {compareDate ? ` · 비교 ${compareDate}` : null}
            </span>
            <a
              href={
                typeof window !== "undefined"
                  ? window.location.pathname
                  : "."
              }
              className="ml-auto text-primary hover:underline"
            >
              현재 시점으로 돌아가기 →
            </a>
          </div>
        </div>
      ) : null}

      {/* 3-pane shell: left tree | body | right panel */}
      <div className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-5 md:px-8 md:py-7">
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">

          {/* ── LEFT TREE (desktop sticky) ─────────────────────────────── */}
          <aside className="hidden lg:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-end gap-2 border-b border-border px-3 py-2.5">
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
                  <p className="mt-2 px-2 text-xs text-muted-foreground">
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
                <SheetContent side="left" className="w-[320px] overflow-y-auto p-0 sm:max-w-[360px]">
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
                      <p className="mt-2 px-2 text-xs text-muted-foreground">
                        * {subject.name} 테크 트리 데이터 미입력 — 조문 트리로 표시
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
                <SheetContent side="right" className="w-[340px] overflow-y-auto p-0 sm:max-w-[380px]">
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
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* ── Article header card ───────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <div className="px-6 pt-5 pb-4">

                {/* Breadcrumb eyebrow */}
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {subject.name}
                  {article.articleNumber
                    ? ` · ${articleDisplayPrefix(article.articleNumber)}`
                    : ""}
                </p>

                {/* Title row: big article number + prev/next */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Law name chip + exam badge + importance stars */}
                    <div className="mb-2.5 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                        {subject.name}
                      </span>
                      <Badge variant="secondary" className="rounded-full text-[11px]">
                        {EXAM_LABEL[subject.exam]}
                      </Badge>
                      {article.importance >= 1 ? (
                        <span className="inline-flex items-center gap-0.5">
                          {Array.from({ length: Math.min(3, article.importance) }).map((_, i) => (
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
                          {Array.from({ length: Math.max(0, 3 - article.importance) }).map((_, i) => (
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
                    <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground md:text-[30px]">
                      <span className="text-primary">{article.displayLabel.split(/\s+/)[0]}</span>
                      {" "}
                      <span>{article.displayLabel.split(/\s+/).slice(1).join(" ")}</span>
                    </h1>

                    {/* Sub-line: effective date + snapshot */}
                    {article.effectiveDate ? (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <ClockIcon className="size-3.5 shrink-0" aria-hidden="true" />
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
                <div className="mx-6 mb-4 flex items-center gap-2.5 rounded-lg border border-primary/15 bg-primary/10 px-3.5 py-2.5 text-xs text-primary">
                  <HistoryIcon className="size-3.5 shrink-0" aria-hidden="true" />
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
              <div className="mx-6 mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2.5">
                {/* Pill-group segmented control */}
                <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-background p-1">
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
                      <span className="tabular-nums text-[10px] opacity-70">
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
                      <span className="tabular-nums text-[10px] opacity-70">
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
                      <span className="tabular-nums text-[10px] opacity-70">
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
                      <span className="tabular-nums text-[10px] opacity-70">
                        {articleComments.length}
                      </span>
                    </ModeButton>
                  ) : null}
                  {relatedCases.length > 0 && article.articleNumber ? (
                    <form method="post" action="/api/study/start-flow">
                      <input type="hidden" name="subject" value={subject.slug} />
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
                  {canEdit ? (
                    <>
                      <Button
                        variant={editMode ? "default" : "ghost"}
                        size="sm"
                        onClick={() => {
                          setEditMode((v) => !v);
                          if (!editMode) {
                            setBlankMode(false);
                            setSubtitlesOnly(false);
                          }
                        }}
                        className="h-7 gap-1.5 rounded-full px-3 text-xs"
                        title={`${staffRole === "admin" ? "원장" : "강사"} 권한 — 새 개정으로 저장`}
                      >
                        {editMode ? (
                          <XIcon className="size-3.5" />
                        ) : (
                          <PencilIcon className="size-3.5" />
                        )}
                        {editMode ? "편집 종료" : "편집"}
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
                    <CommentHighlightOverlay
                      fieldPath="article.body"
                      comments={articleComments}
                      targetType="article"
                      targetId={article.articleId}
                    >
                    <HighlightOverlay
                      fieldPath="article.body"
                      highlights={highlights}
                    >
                      {compareBody ? (
                        <div className="grid gap-6 md:grid-cols-2">
                          <div>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {atDate ? `시점 ${atDate}` : "현재"}
                              {article.effectiveDate
                                ? ` (시행 ${article.effectiveDate})`
                                : ""}
                            </p>
                            {body ? (
                              <div className="text-[17px] leading-[1.85] text-foreground">
                                <ArticleBodyView
                                  body={body}
                                  titleMap={titleMap}
                                  subtitlesOnly={subtitlesOnly}
                                  lawCode={subject.slug}
                                  memos={memos}
                                />
                              </div>
                            ) : (
                              <p className="text-sm italic text-muted-foreground">
                                본문 없음
                              </p>
                            )}
                          </div>
                          <div className="border-l border-border md:pl-5">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              비교 시점 {compareDate}
                              {compareEffectiveDate
                                ? ` (시행 ${compareEffectiveDate})`
                                : ""}
                            </p>
                            <div className="text-[17px] leading-[1.85] text-foreground">
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
                      ) : body ? (
                        <div className="text-[17px] leading-[1.85] text-foreground">
                          <ArticleBodyView
                            body={body}
                            titleMap={titleMap}
                            subtitlesOnly={subtitlesOnly}
                            lawCode={subject.slug}
                            memos={memos}
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          본문이 등록되지 않았거나 파싱할 수 없는 형식입니다.
                        </p>
                      )}
                    </HighlightOverlay>
                    </CommentHighlightOverlay>
                  )}
                </div>
              </div>
            </div>
          </main>

          {/* ── RIGHT PANEL (desktop sticky) ────────────────────────────── */}
          <aside className="hidden lg:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
            <div className="rounded-xl border border-border bg-card shadow-sm">
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
        "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium leading-none transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-primary text-primary-foreground font-semibold shadow-sm"
          : "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
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
  target:
    | {
        articleId: string;
        articleNumber: string | null;
        displayLabel: string;
      }
    | null;
  subjectSlug: string;
}) {
  const Icon = direction === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  const ariaLabel =
    direction === "prev" ? "이전 조문" : "다음 조문";

  if (!target || !target.articleNumber) {
    return (
      <button
        type="button"
        disabled
        aria-label={ariaLabel}
        className="inline-flex h-9 cursor-not-allowed items-center gap-1 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground opacity-40"
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
      aria-label={`${ariaLabel}: ${target.displayLabel}`}
      className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {direction === "prev" ? <Icon className="size-3.5 shrink-0" /> : null}
      <span className="max-w-[140px] truncate">{target.displayLabel}</span>
      {direction === "next" ? <Icon className="size-3.5 shrink-0" /> : null}
    </Link>
  );
}
