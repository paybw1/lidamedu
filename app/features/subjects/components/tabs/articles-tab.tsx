import type { LawSubjectMeta } from "../../lib/subjects";
import type { NodeProgressByArticle } from "../node-progress-gauge";

import { BookOpenIcon, ClockIcon, CompassIcon, StarIcon } from "lucide-react";
import { Link } from "react-router";

import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import type { ArticleAnnotationCounts } from "~/features/annotations/queries.server";
import type {
  ArticleNode,
  SystematicNode,
} from "~/features/laws/queries.server";
import type {
  RecommendedArticleItem,
  SubjectProgress,
} from "~/features/study/queries.server";

import { ArticleTree } from "../article-tree";
import { SortAxisToggle, useSortAxis } from "../sort-axis";
import { SystematicTree } from "../systematic-tree";

export function ArticlesTab({
  subject,
  lawId,
  articles,
  systematicNodes,
  progress,
  bookmarkLevels,
  annotationCounts,
  recommendedArticles,
  progressByArticle,
}: {
  subject: LawSubjectMeta;
  lawId?: string;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  progress: SubjectProgress | null;
  bookmarkLevels?: Record<string, number>;
  annotationCounts?: Record<string, ArticleAnnotationCounts>;
  recommendedArticles: RecommendedArticleItem[];
  progressByArticle?: NodeProgressByArticle;
}) {
  const { axis } = useSortAxis();
  const articleCount = articles.filter((a) => a.level === "article").length;
  const systematicEmpty = systematicNodes.length === 0;
  const renderSystematic = axis === "systematic" && !systematicEmpty;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Left: chapter outline */}
      <aside>
        <div className="border-border bg-muted/30 overflow-hidden rounded-xl border">
          {/* Outline header */}
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.10em] uppercase">
              장별 목차
            </p>
            <SortAxisToggle
              size="sm"
              disabledAxes={systematicEmpty ? ["systematic"] : undefined}
            />
          </div>
          <div className="p-2">
            {renderSystematic ? (
              <SystematicTree
                nodes={systematicNodes}
                lawCode={subject.slug}
                emptyHint={`${subject.name} 테크 트리가 아직 등록되지 않았습니다.`}
                bookmarkLevels={bookmarkLevels}
                annotationCounts={annotationCounts}
                progressByArticle={progressByArticle}
              />
            ) : (
              <ArticleTree
                nodes={articles}
                emptyHint={`${subject.name} 조문 시드가 아직 없습니다.`}
                lawCode={subject.slug}
                bookmarkLevels={bookmarkLevels}
                annotationCounts={annotationCounts}
                lazyExpand={
                  subject.slug === "civil" && lawId ? { lawId } : undefined
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

      {/* Right: cards grid */}
      <section className="space-y-4">
        {/* Recent / Recommended row */}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* 최근 학습 card */}
          <Card className="border-border rounded-xl border shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="px-4 pt-4 pb-2">
              <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.10em] uppercase">
                최근 학습
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {progress?.lastVisited ? (
                <ul className="divide-border space-y-0 divide-y">
                  <li className="flex items-baseline gap-2 py-2">
                    <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold">
                      {progress.lastVisited.displayLabel}
                    </span>
                    <ClockIcon className="text-muted-foreground size-3 shrink-0" />
                    <span className="text-muted-foreground text-xs">
                      방금 전
                    </span>
                  </li>
                </ul>
              ) : null}
              {!progress?.lastVisited ? (
                <p className="text-muted-foreground text-sm">
                  아직 학습 기록이 없습니다.
                </p>
              ) : null}
              <p className="text-muted-foreground mt-2 text-xs">
                {progress
                  ? `${progress.visitedArticleIds.size} / ${progress.totalArticleCount} 열람`
                  : "학습 진도 연결 예정"}
              </p>
            </CardContent>
          </Card>

          {/* 미열람 권장 card */}
          <Card className="border-border rounded-xl border shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="px-4 pt-4 pb-2">
              <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.10em] uppercase">
                미열람 권장
              </p>
            </CardHeader>
            <CardContent
              className="px-4 pb-4"
              data-testid="recommended-articles"
            >
              {recommendedArticles.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  모든 조문을 한 번씩 열어봤습니다 🎉
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {recommendedArticles.map((a) => (
                    <li
                      key={a.articleId}
                      className="rounded-lg bg-amber-500/[0.08] px-3 py-2"
                    >
                      <Link
                        to={`/subjects/${subject.slug}/articles/${a.pathSlug}`}
                        viewTransition
                        className="block"
                        title={a.displayLabel}
                      >
                        <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          {a.importance >= 2 ? (
                            <StarIcon className="size-3" />
                          ) : null}
                          {a.displayLabel}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-muted-foreground mt-2 text-xs">
                중요도 ★ 높은 순. 클릭 시 조문 viewer 진입.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Empty-state hint card — spans both columns */}
        <div className="border-border bg-muted/20 rounded-xl border border-dashed px-6 py-8 text-center">
          <BookOpenIcon className="text-muted-foreground/50 mx-auto size-5" />
          <p className="text-foreground mt-2 text-sm font-semibold">
            좌측에서 조문을 선택하세요
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            관련 판례·문제·포스트잇이 우측 패널에 함께 표시됩니다.
          </p>
          {articleCount > 0 ? (
            <p className="text-muted-foreground mt-3 text-xs">
              조문 총 {articleCount}개
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
