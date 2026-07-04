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

import { ListTreeIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { SheetHeader, SheetTitle } from "~/core/components/ui/sheet";

import { ArticleTree } from "../article-tree";
import { MobileNavDrawer } from "../mobile-nav-drawer";
import { SortAxisToggle, useSortAxis } from "../sort-axis";
import { SubjectLearningHub } from "../subject-learning-hub";
import {
  SubjectStudyStatus,
  type SubjectStudyStatusProps,
} from "../subject-study-status";
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
  studyStatus,
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
  studyStatus: SubjectStudyStatusProps;
}) {
  const { axis } = useSortAxis();
  const articleCount = articles.filter((a) => a.level === "article").length;
  const systematicEmpty = systematicNodes.length === 0;
  const renderSystematic = axis === "systematic" && !systematicEmpty;

  // 목차 트리 — 데스크톱 사이드바 / 모바일 드로어 공용 마크업.
  const treePanel = (
    <div
      data-hub-left-panel=""
      className="border-border bg-muted/30 overflow-hidden rounded-xl border"
    >
      {/* Outline header */}
      <div className="border-border flex items-center justify-end border-b px-3 py-2">
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
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Left: chapter outline — 데스크톱만 sticky 사이드바. 모바일은 드로어. */}
      <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
        {treePanel}
      </aside>

      {/* Right: 학습 현황 + 학습 허브 */}
      <div className="min-w-0 space-y-4">
        {/* 모바일 목차 드로어 — 콘텐츠가 위로 오고, 목차는 버튼으로 연다 */}
        <div className="lg:hidden">
          <MobileNavDrawer
            side="left"
            contentClassName="w-[320px] overflow-y-auto p-0 sm:max-w-[360px]"
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-full text-xs"
                data-testid="open-tree-drawer"
              >
                <ListTreeIcon className="size-3.5" /> 장별 목차
              </Button>
            }
          >
            <SheetHeader className="border-border border-b px-4 py-3">
              <SheetTitle className="text-sm font-semibold">장별 목차</SheetTitle>
            </SheetHeader>
            <div className="px-3 py-3">{treePanel}</div>
          </MobileNavDrawer>
        </div>

        <SubjectStudyStatus {...studyStatus} kind="article" />
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
    </div>
  );
}
