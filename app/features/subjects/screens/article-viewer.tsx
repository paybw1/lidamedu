import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  GavelIcon,
  NetworkIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { compareArticlesNatural } from "~/features/laws/lib/article-sort";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getBookmark,
  listHighlights,
  listMemos,
} from "~/features/annotations/queries.server";
import { recordStudySession } from "~/features/study/queries.server";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import {
  RelatedArticlesChips,
  RelatedCasesList,
  RelatedSection,
} from "~/features/laws/components/related-chips";
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
} from "~/features/laws/queries.server";
import {
  getRelatedArticlesByArticle,
  getRelatedCasesByArticle,
} from "~/features/relations/queries.server";
import { ArticleTree } from "~/features/subjects/components/article-tree";
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
  const [article, articles] = await Promise.all([
    getArticleByNumber(client, law.lawId, lookupArticleNumber),
    getArticleSkeleton(client, law.lawId),
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

  const [relatedCases, relatedArticles, bookmark, memos, highlights] =
    await Promise.all([
      getRelatedCasesByArticle(client, article.articleId),
      getRelatedArticlesByArticle(client, article.articleId),
      getBookmark(client, user.id, "article", article.articleId),
      listMemos(client, user.id, "article", article.articleId),
      listHighlights(client, user.id, "article", article.articleId),
    ]);

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
    articles,
    relatedCases,
    relatedArticles,
    bookmark,
    memos,
    highlights,
  };
}

export default function ArticleViewer({ loaderData }: Route.ComponentProps) {
  const {
    subject,
    article,
    body,
    articles,
    relatedCases,
    relatedArticles,
    bookmark,
    memos,
    highlights,
  } = loaderData;

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

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/subjects/${subject.slug}`}
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {subject.name} 조문 트리
      </Link>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
          <Card className="py-4">
            <CardHeader className="px-4 pb-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {subject.name} 조문 트리
              </p>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ArticleTree
                nodes={articles}
                activeArticleId={article.articleId}
                lawCode={subject.slug}
              />
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
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-xs">
                  {subject.name} ·{" "}
                  {article.articleNumber
                    ? articleDisplayPrefix(article.articleNumber)
                    : ""}
                </p>
                <Button
                  variant={subtitlesOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSubtitlesOnly((v) => !v)}
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
            </CardHeader>
            <Separator />
            <CardContent className="pt-6">
              <div data-highlight-field="article.body">
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                관련 자료
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <RelatedSection
                title="관련 조문"
                icon={NetworkIcon}
                count={relatedArticles.length}
              >
                <RelatedArticlesChips
                  articles={relatedArticles}
                  subject={subject.slug}
                />
              </RelatedSection>
              <RelatedSection
                title="관련 판례"
                icon={GavelIcon}
                count={relatedCases.length}
              >
                <RelatedCasesList cases={relatedCases} subject={subject.slug} />
              </RelatedSection>
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

