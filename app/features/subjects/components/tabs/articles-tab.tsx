import type { LawSubjectMeta } from "../../lib/subjects";
import type { NodeProgressByArticle } from "../node-progress-gauge";

import type { ArticleAnnotationCounts } from "~/features/annotations/queries.server";
import type { CaseListItem } from "~/features/cases/labels";
import type {
  ArticleNode,
  SystematicNode,
} from "~/features/laws/queries.server";
import type { ProblemListItem } from "~/features/problems/labels";
import type {
  RecommendedArticleItem,
  SubjectProgress,
  UserProblemStats,
} from "~/features/study/queries.server";

import { ArticleTree } from "../article-tree";
import { SortAxisToggle, useSortAxis } from "../sort-axis";
import { SubjectLearningHub } from "../subject-learning-hub";
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
  cases,
  casesTotal,
  problems,
  problemStats,
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
  cases: CaseListItem[];
  casesTotal: number;
  problems: ProblemListItem[];
  problemStats: UserProblemStats | null;
}) {
  const { axis } = useSortAxis();
  const articleCount = articles.filter((a) => a.level === "article").length;
  const systematicEmpty = systematicNodes.length === 0;
  const renderSystematic = axis === "systematic" && !systematicEmpty;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Left: chapter outline — sticky 사이드바 + 트리 내부 스크롤 (긴 우측 콘텐츠와 무관하게 항상 접근) */}
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
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

      {/* Right: 조문·판례·문제 학습 허브 */}
      <SubjectLearningHub
        subject={subject}
        articleCount={articleCount}
        progress={progress}
        recommendedArticles={recommendedArticles}
        cases={cases}
        casesTotal={casesTotal}
        problems={problems}
        problemStats={problemStats}
      />
    </div>
  );
}
