import { ArrowLeftIcon, EyeIcon, EyeOffIcon, PencilLineIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { BlankFillView } from "~/features/blanks/components/blank-fill-view";
import { BlankOwnerPageSelector } from "~/features/blanks/components/blank-owner-page-selector";
import { listBlankSetsByArticle } from "~/features/blanks/queries.server";
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
import { ArticleBodyView } from "~/features/laws/components/article-body";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import { parseArticleBody } from "~/features/laws/lib/article-body";
import {
  getArticleSkeleton,
  getLawByCode,
  getSystematicNodeWithArticles,
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

import type { Route } from "./+types/systematic-node-viewer";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "체계도 그룹 | Lidam Edu" }];
  return [
    {
      title: `${loaderData.subject.name} ${loaderData.node.displayLabel} | Lidam Edu`,
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
    // article 별로 모든 owner set 조회 (owner selector dropdown 옵션 산출)
    Promise.all(
      articleIds.map((id) =>
        listBlankSetsByArticle(client, id).then(
          (sets) => [id, sets] as const,
        ),
      ),
    ).then((entries) => Object.fromEntries(entries)),
  ]);

  // ?blank-owner=<uuid> 로 모든 카드의 빈칸 set 일괄 owner 적용. 없으면 article별 첫 set.
  const ownerParam = new URL(request.url).searchParams.get("blank-owner");
  const blankSetsByArticle: Record<string, (typeof allBlankSetsByArticle)[string][number]> = {};
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

  return {
    subject: LAW_SUBJECTS[lawCode],
    node,
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
    node,
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
  const blankAvailableCount = useMemo(
    () =>
      node.articles.filter((a) => blankSetsByArticle[a.articleId]).length,
    [node.articles, blankSetsByArticle],
  );

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
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      {/* multi-article 환경: HighlightToolbar 1개를 root 에 mount, prop 없이 selection 컨테이너의 dataset 으로 article 결정 */}
      <HighlightToolbar />

      <Link
        to={`/subjects/${subject.slug}`}
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {subject.name}{" "}
        {renderSystematic ? "테크 트리" : "조문 트리"}
      </Link>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
          <Card className="py-4">
            <CardHeader className="px-4 pb-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  {renderSystematic ? "테크 트리" : "조문 트리"}
                </p>
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
                  {node.displayLabel}
                </h1>
                <Badge variant="secondary">{EXAM_LABEL[subject.exam]}</Badge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  {subject.name} · 매핑된 조문 {node.articles.length}개
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  {blankAvailableCount > 0 ? (
                    <>
                      <Button
                        variant={blankMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => setBlankMode((v) => !v)}
                        className="h-7 gap-1 text-xs"
                      >
                        <PencilLineIcon className="size-3.5" />
                        빈칸 모드
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
                  <Button
                    variant={subtitlesOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSubtitlesOnly((v) => !v)}
                    disabled={blankMode}
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

          {node.articles.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
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
