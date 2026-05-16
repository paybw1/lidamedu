import {
  BookOpenIcon,
  ClockIcon,
  CompassIcon,
  StarIcon,
} from "lucide-react";
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
import type { NodeProgressByArticle } from "../node-progress-gauge";
import { SystematicTree } from "../systematic-tree";
import { SortAxisToggle, useSortAxis } from "../sort-axis";
import type { LawSubjectMeta } from "../../lib/subjects";

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
        <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
          {/* Outline header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.10em] text-muted-foreground">
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
                  subject.slug === "civil" && lawId
                    ? { lawId }
                    : undefined
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

      {/* Right: cards grid */}
      <section className="space-y-4">
        {/* Recent / Recommended row */}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* 최근 학습 card */}
          <Card className="rounded-xl border border-border shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="px-4 pb-2 pt-4">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.10em] text-muted-foreground">
                최근 학습
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {progress?.lastVisited ? (
                <ul className="space-y-0 divide-y divide-border">
                  <li className="flex items-baseline gap-2 py-2">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {progress.lastVisited.displayLabel}
                    </span>
                    <ClockIcon className="size-3 shrink-0 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">방금 전</span>
                  </li>
                </ul>
              ) : null}
              {!progress?.lastVisited ? (
                <p className="text-sm text-muted-foreground">
                  아직 학습 기록이 없습니다.
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {progress
                  ? `${progress.visitedArticleIds.size} / ${progress.totalArticleCount} 열람`
                  : "학습 진도 연결 예정"}
              </p>
            </CardContent>
          </Card>

          {/* 미열람 권장 card */}
          <Card className="rounded-xl border border-border shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="px-4 pb-2 pt-4">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.10em] text-muted-foreground">
                미열람 권장
              </p>
            </CardHeader>
            <CardContent
              className="px-4 pb-4"
              data-testid="recommended-articles"
            >
              {recommendedArticles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
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
              <p className="mt-2 text-xs text-muted-foreground">
                중요도 ★ 높은 순. 클릭 시 조문 viewer 진입.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Empty-state hint card — spans both columns */}
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center">
          <BookOpenIcon className="mx-auto size-5 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-semibold text-foreground">
            좌측에서 조문을 선택하세요
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            관련 판례·문제·메모가 우측 패널에 함께 표시됩니다.
          </p>
          {articleCount > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              조문 총 {articleCount}개
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
