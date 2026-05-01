import {
  ArrowLeftIcon,
  BrainIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  FileEditIcon,
  PencilIcon,
  PencilLineIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { compareArticlesNatural } from "~/features/laws/lib/article-sort";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
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
  getArticleSkeleton,
  getLawByCode,
  getStaffRole,
  getSystematicSkeleton,
  listArticleRevisionHistory,
  type RevisionHistoryEntry,
} from "~/features/laws/queries.server";
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
  if (!loaderData) return [{ title: "조문 | Lidam Edu" }];
  return [
    {
      title: `${loaderData.subject.name} ${loaderData.article.displayLabel} | Lidam Edu`,
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
  const [article, articles, systematicNodes] = await Promise.all([
    getArticleByNumber(client, law.lawId, lookupArticleNumber),
    getArticleSkeleton(client, law.lawId),
    getSystematicSkeleton(client, lawCode),
  ]);

  if (!article) {
    throw data("Article not found", { status: 404 });
  }

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
  ]);

  // 개정 이력은 staff (instructor/admin) 만 조회 — 학생에게는 노출 안 함.
  const revisions: RevisionHistoryEntry[] | null = staffRole
    ? await listArticleRevisionHistory(
        client,
        article.articleId,
        article.currentRevisionId,
      )
    : null;
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
    article,
    body: parseArticleBody(article.bodyJson),
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
    revisions,
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
    article,
    body,
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
    revisions,
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

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <HighlightToolbar
        targetType="article"
        targetId={article.articleId}
      />

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
          <Card className="py-4">
            <CardHeader className="px-4 pb-3">
              <div className="flex items-center justify-end gap-2">
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
                />
              )}
              {axis === "systematic" && systematicEmpty ? (
                <p className="text-muted-foreground mt-2 px-2 text-xs">
                  * {subject.name} 테크 트리 데이터 미입력 — 조문 트리로 표시
                </p>
              ) : null}
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  {article.displayLabel}
                </h1>
                <div className="flex items-center gap-1">
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
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{EXAM_LABEL[subject.exam]}</Badge>
                {article.importance >= 1 ? (
                  <Badge
                    variant={article.importance >= 3 ? "default" : "outline"}
                    className="gap-1 text-amber-600 dark:text-amber-400"
                  >
                    <span className="tracking-tight">
                      {"★".repeat(Math.min(3, article.importance))}
                    </span>
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  {subject.name} ·{" "}
                  {article.articleNumber
                    ? articleDisplayPrefix(article.articleNumber)
                    : ""}
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  {canEdit ? (
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
                      className="h-7 gap-1 text-xs"
                      title={`${staffRole === "admin" ? "원장" : "강사"} 권한 — 새 개정으로 저장`}
                    >
                      {editMode ? (
                        <XIcon className="size-3.5" />
                      ) : (
                        <PencilIcon className="size-3.5" />
                      )}
                      {editMode ? "편집 종료" : "편집"}
                    </Button>
                  ) : null}
                  {canEdit ? (
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
                        variant="outline"
                        size="sm"
                        disabled={blankSetSubmitting}
                        className="h-7 gap-1 text-xs"
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
                  ) : null}
                  {blankAvailable ? (
                    <>
                      <Button
                        variant={blankMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setBlankMode((v) => !v);
                          if (!blankMode) {
                            setSubjectBlankMode(false);
                            setPeriodBlankMode(false);
                            setRecitationMode(false);
                          }
                        }}
                        disabled={editMode}
                        className="h-7 gap-1 text-xs"
                      >
                        <PencilLineIcon className="size-3.5" />
                        내용 빈칸 모드
                        <span className="text-muted-foreground ml-0.5 tabular-nums">
                          {blankSet!.blanks.length}
                        </span>
                      </Button>
                      {blankMode && blankSets.length > 1 ? (
                        <BlankOwnerSelector
                          options={blankSets}
                          currentSetId={blankSet!.setId}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {subjectBlankAvailable ? (
                    <Button
                      variant={subjectBlankMode ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSubjectBlankMode((v) => !v);
                        if (!subjectBlankMode) {
                          setBlankMode(false);
                          setPeriodBlankMode(false);
                          setRecitationMode(false);
                        }
                      }}
                      disabled={editMode}
                      className="h-7 gap-1 text-xs"
                    >
                      <PencilLineIcon className="size-3.5" />
                      주체 빈칸 모드
                      <span className="text-muted-foreground ml-0.5 tabular-nums">
                        {subjectBlanks.length}
                      </span>
                    </Button>
                  ) : null}
                  {periodBlankAvailable ? (
                    <Button
                      variant={periodBlankMode ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setPeriodBlankMode((v) => !v);
                        if (!periodBlankMode) {
                          setBlankMode(false);
                          setSubjectBlankMode(false);
                          setRecitationMode(false);
                        }
                      }}
                      disabled={editMode}
                      className="h-7 gap-1 text-xs"
                    >
                      <PencilLineIcon className="size-3.5" />
                      기간 빈칸 모드
                      <span className="text-muted-foreground ml-0.5 tabular-nums">
                        {periodResult.blanks.length}
                        {periodResult.ambiguous.length > 0
                          ? `+${periodResult.ambiguous.length}?`
                          : ""}
                      </span>
                    </Button>
                  ) : null}
                  <Button
                    variant={recitationMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setRecitationMode((v) => !v);
                      if (!recitationMode) {
                        setBlankMode(false);
                        setSubjectBlankMode(false);
                        setPeriodBlankMode(false);
                      }
                    }}
                    disabled={editMode}
                    className="h-7 gap-1 text-xs"
                    title={
                      article.importance >= 2
                        ? "암기 추천 — 별 2개 이상 중요 조문"
                        : "조/항/호/목 골격만 두고 본문을 직접 입력해 암기"
                    }
                  >
                    <BrainIcon className="size-3.5" />
                    암기 모드
                    {article.importance >= 2 ? (
                      <span className="ml-0.5 text-amber-500">★</span>
                    ) : null}
                  </Button>
                  <Button
                    variant={subtitlesOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSubtitlesOnly((v) => !v)}
                    disabled={
                      blankMode ||
                      subjectBlankMode ||
                      periodBlankMode ||
                      recitationMode ||
                      editMode
                    }
                    className="h-7 gap-1 text-xs"
                  >
                    {subtitlesOnly ? (
                      <EyeIcon className="size-3.5" />
                    ) : (
                      <EyeOffIcon className="size-3.5" />
                    )}
                    소제목만 보기
                  </Button>
                </div>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="pt-6">
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
                >
                  {body ? (
                    <ArticleBodyView
                      body={body}
                      titleMap={titleMap}
                      subtitlesOnly={subtitlesOnly}
                      lawCode={subject.slug}
                      memos={memos}
                    />
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      본문이 등록되지 않았거나 파싱할 수 없는 형식입니다.
                    </p>
                  )}
                </HighlightOverlay>
              )}
            </CardContent>
          </Card>

        </main>

        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
          <Card className="h-full">
            <CardHeader>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                우측 패널
              </p>
            </CardHeader>
            <CardContent>
              <ArticleRightPanel
                target={{ type: "article", id: article.articleId }}
                bookmark={bookmark}
                memos={memos}
                highlights={highlights}
                qnaThreads={qnaThreads}
                relatedCases={relatedCases}
                subjectSlug={subject.slug}
                revisions={revisions ?? undefined}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled
        className="h-8 gap-1 px-2 text-xs"
        aria-label={ariaLabel}
      >
        {direction === "prev" ? <Icon /> : null}
        <span className="text-muted-foreground">
          {direction === "prev" ? "처음" : "마지막"}
        </span>
        {direction === "next" ? <Icon /> : null}
      </Button>
    );
  }

  // displayLabel 에서 "제29조 특허요건" 형태 → 그대로 표시 (조문번호+제목)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      asChild
      className="h-8 gap-1 px-2 text-xs"
    >
      <Link
        to={`/subjects/${subjectSlug}/articles/${target.articleNumber}`}
        viewTransition
        aria-label={`${ariaLabel}: ${target.displayLabel}`}
      >
        {direction === "prev" ? <Icon /> : null}
        <span className="max-w-[160px] truncate font-medium">
          {target.displayLabel}
        </span>
        {direction === "next" ? <Icon /> : null}
      </Link>
    </Button>
  );
}

