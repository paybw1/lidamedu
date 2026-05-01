// 한 chapter/section/part 안의 모든 조문을 한 화면에 모아 보여주는 viewer.
// 좌측 조문 트리에서 "제1장 총칙" 같은 상위 노드 클릭 시 진입.
//
// 구조는 systematic-node-viewer 와 비슷 — 다중 article 카드 + 우측 panel + 빈칸 모드.
// 차이: 그룹 식별자가 systematic node 가 아니라 article 트리의 chapter article id.

import { ArrowLeftIcon, EyeIcon, EyeOffIcon, PencilLineIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getBookmarksByArticleIds,
  getUserArticleAnnotationCounts,
  getUserArticleBookmarkLevels,
  listHighlightsByArticleIds,
  listMemosByArticleIds,
} from "~/features/annotations/queries.server";
import { HighlightOverlay } from "~/features/annotations/components/highlight-overlay";
import { HighlightToolbar } from "~/features/annotations/components/highlight-toolbar";
import { BlankFillView } from "~/features/blanks/components/blank-fill-view";
import { BlankOwnerPageSelector } from "~/features/blanks/components/blank-owner-page-selector";
import { PeriodAmbiguousPanel } from "~/features/blanks/components/period-ambiguous-panel";
import {
  computePeriodBlanks,
  type PeriodAmbiguousCase,
} from "~/features/blanks/lib/period-blanks";
import { computeSubjectBlanks } from "~/features/blanks/lib/subject-blanks";
import {
  listBlankSetsByArticle,
  type BlankItem,
} from "~/features/blanks/queries.server";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import { parseArticleBody } from "~/features/laws/lib/article-body";
import {
  getArticleSkeleton,
  getChapterWithArticles,
  getLawByCode,
  getSystematicSkeleton,
} from "~/features/laws/queries.server";
import { listThreadsForTarget } from "~/features/qna/queries.server";
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

import type { Route } from "./+types/chapter-viewer";

const LEVEL_KOREAN: Record<string, string> = {
  part: "편",
  chapter: "장",
  section: "절",
};

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "조문 그룹 | Lidam Edu" }];
  return [
    {
      title: `${loaderData.subject.name} ${loaderData.chapter.displayLabel} | Lidam Edu`,
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

  const chapter = await getChapterWithArticles(client, law.lawId, chapterId);
  if (!chapter) {
    throw data("Chapter not found", { status: 404 });
  }

  const articleIds = chapter.articles.map((a) => a.articleId);

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
        listBlankSetsByArticle(client, id).then(
          (sets) => [id, sets] as const,
        ),
      ),
    ).then((entries) => Object.fromEntries(entries)),
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

  return {
    subject: LAW_SUBJECTS[lawCode],
    chapter,
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
    selectedBlankOwner: ownerParam,
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
    chapter,
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
    selectedBlankOwner,
  } = loaderData;
  const { axis } = useSortAxis();
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
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <HighlightToolbar />

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
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
                />
              )}
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  {chapter.displayLabel}
                </h1>
                <Badge variant="secondary">{EXAM_LABEL[subject.exam]}</Badge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  {subject.name} · {levelLabel} · 조문 {chapter.articles.length}개
                </p>
                <div className="flex flex-wrap items-center gap-1">
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
                        className="h-7 gap-1 text-xs"
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
                      className="h-7 gap-1 text-xs"
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
                      className="h-7 gap-1 text-xs"
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
          </Card>

          {periodBlankMode && periodAmbiguousAll.length > 0 ? (
            <PeriodAmbiguousPanel cases={periodAmbiguousAll} />
          ) : null}

          {chapter.articles.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
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
                <Card key={a.articleId} id={`article-${a.articleId}`}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {a.articleNumber ? (
                        <Link
                          to={`/subjects/${subject.slug}/articles/${a.articleNumber}`}
                          viewTransition
                          className="hover:text-primary inline-flex items-center gap-2"
                        >
                          <h2 className="text-xl font-semibold tracking-tight">
                            {a.displayLabel}
                          </h2>
                        </Link>
                      ) : (
                        <h2 className="text-xl font-semibold tracking-tight">
                          {a.displayLabel}
                        </h2>
                      )}
                      {importance > 0 ? (
                        <Badge
                          variant={importance >= 3 ? "default" : "outline"}
                          className="gap-1 text-amber-600 dark:text-amber-400"
                        >
                          <span className="tracking-tight">
                            {"★".repeat(importance)}
                          </span>
                        </Badge>
                      ) : null}
                    </div>
                    {a.effectiveDate ? (
                      <p className="text-muted-foreground text-xs">
                        시행 {a.effectiveDate}
                      </p>
                    ) : null}
                  </CardHeader>
                  <Separator />
                  <CardContent className="pt-6">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
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

                      <ArticleRightPanel
                        target={{ type: "article", id: a.articleId }}
                        bookmark={bookmark}
                        memos={memos}
                        highlights={highlights}
                        qnaThreads={qnaThreads}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </main>
      </div>
    </div>
  );
}
