import type { LawSubjectMeta } from "../../lib/subjects";
import type { NodeProgressByArticle } from "../node-progress-gauge";

import {
  FileTextIcon,
  LayoutListIcon,
  ListTreeIcon,
  NetworkIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/core/components/ui/button";
import { SheetHeader, SheetTitle } from "~/core/components/ui/sheet";
import { cn } from "~/core/lib/utils";
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
import {
  LeftPanelResizer,
  useLeftPanelWidth,
} from "~/features/subjects/components/left-panel-collapse";

import {
  subjectHasDigestAxis,
  subjectHasSystematicAxis,
} from "../../lib/subjects";
import { ArticleTree } from "../article-tree";
import { DigestContent, DigestOutline, topLevelNodes } from "../digest-panel";
import { FilteredArticlesReader } from "../filtered-articles-reader";
import { MobileNavDrawer } from "../mobile-nav-drawer";
import { Segmented, useSortAxis } from "../sort-axis";
import { SubjectLearningHub } from "../subject-learning-hub";
import {
  SubjectStudyStatus,
  type SubjectStudyStatusProps,
} from "../subject-study-status";
import { SystematicTree } from "../systematic-tree";

// 좌패널 토글 — 축 두 칸(체계도·조문)에 이 탭 전용 화면(정리) 한 칸을 더한다.
const OUTLINE_OPTIONS = [
  { value: "systematic", label: "체계도", icon: NetworkIcon },
  { value: "statutory", label: "조문", icon: LayoutListIcon },
  { value: "digest", label: "정리", icon: FileTextIcon },
] as const;

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
  const { axis, setAxis } = useSortAxis();
  const articleCount = articles.filter((a) => a.level === "article").length;
  // 민법은 체계도 축이 조문 목차와 동일 → 축 토글·체계도 트리 숨김(조문 트리만).
  const hasSystematicAxis = subjectHasSystematicAxis(subject.slug);
  const systematicEmpty = systematicNodes.length === 0;

  // "정리" 는 축(체계도/조문)이 아니라 이 탭 안의 화면이다. 축에 넣으면 문제·판례 탭
  // 토글에도 칸이 생기므로 좌패널 토글에서만 세 칸으로 합쳐 보여 준다.
  const hasDigest = subjectHasDigestAxis(subject.slug) && !systematicEmpty;
  const [digestOpen, setDigestOpen] = useState(false);
  const [digestNodeId, setDigestNodeId] = useState<string | null>(null);
  const digestNodes = useMemo(
    () => (hasDigest ? topLevelNodes(systematicNodes) : []),
    [hasDigest, systematicNodes],
  );
  const showDigest = hasDigest && digestOpen;
  const digestNode = digestNodes.find((n) => n.nodeId === digestNodeId) ?? null;

  const renderSystematic =
    hasSystematicAxis &&
    !showDigest &&
    axis === "systematic" &&
    !systematicEmpty;

  // 트리 필터(중요도/즐겨찾기)가 켜지면 가운데 본문 영역을 매칭 조문 정독으로 전환.
  const [treeFilter, setTreeFilter] = useState({ importance: 0, bookmark: 0 });
  const { width: leftWidth, setWidth: setLeftWidth } = useLeftPanelWidth();
  const filterReading =
    !renderSystematic && (treeFilter.importance > 0 || treeFilter.bookmark > 0);

  // 목차 트리 — 데스크톱 사이드바 / 모바일 드로어 공용 마크업.
  const treePanel = (
    <div className="border-border bg-muted/30 overflow-hidden rounded-xl border lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
      {/* Outline header */}
      {/* 체계도/조문 토글이 있으면 그 자체가 무엇을 보는지 말해 준다 — 왼쪽 "목차" 라벨은
          군더더기라 뺀다(원장 2026-08-20). 토글이 없는 과목(민법)은 머리글이 비어 버리므로
          "조문 목차"를 남긴다. 문제 탭(problems-tab)과 같은 구조. */}
      <div
        className={cn(
          "border-border bg-card sticky top-0 z-10 flex items-center gap-2 rounded-t-xl border-b px-3 py-2",
          hasSystematicAxis ? "justify-end" : "justify-start",
        )}
      >
        {hasSystematicAxis ? (
          <Segmented
            size="sm"
            ariaLabel="목차 보기"
            value={showDigest ? "digest" : axis}
            options={hasDigest ? OUTLINE_OPTIONS : OUTLINE_OPTIONS.slice(0, 2)}
            disabled={systematicEmpty ? ["systematic"] : undefined}
            onChange={(next) => {
              if (next === "digest") {
                setDigestOpen(true);
                return;
              }
              setDigestOpen(false);
              setAxis(next);
            }}
          />
        ) : (
          <span className="text-muted-foreground text-[11px] font-medium">
            조문 목차
          </span>
        )}
      </div>
      <div className="p-2">
        {showDigest ? (
          <DigestOutline
            nodes={digestNodes}
            activeNodeId={digestNodeId}
            onSelect={setDigestNodeId}
            emptyHint={`${subject.name} 체계도가 아직 등록되지 않았습니다.`}
          />
        ) : renderSystematic ? (
          <SystematicTree
            nodes={systematicNodes}
            lawCode={subject.slug}
            emptyHint={`${subject.name} 체계도가 아직 등록되지 않았습니다.`}
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
            onFilterChange={setTreeFilter}
          />
        )}
        {!showDigest && axis === "systematic" && systematicEmpty ? (
          <p className="text-muted-foreground mt-2 px-2 text-xs">
            * {subject.name} 테크 트리 데이터 미입력 — 조문 트리로 표시
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      className="grid gap-6 lg:grid-cols-[var(--left-w,280px)_1fr]"
      style={{ ["--left-w" as string]: `${leftWidth}px` }}
    >
      {/* Left: chapter outline — 데스크톱만 sticky 사이드바. 모바일은 드로어. 경계 드래그로 폭 조절. */}
      <aside className="relative hidden lg:sticky lg:top-20 lg:block">
        <LeftPanelResizer width={leftWidth} onWidth={setLeftWidth} />
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
                <ListTreeIcon className="size-3.5" /> 목차로 찾기
              </Button>
            }
          >
            <SheetHeader className="border-border border-b px-4 py-3">
              <SheetTitle className="text-sm font-semibold">목차</SheetTitle>
            </SheetHeader>
            <div className="px-3 py-3">{treePanel}</div>
          </MobileNavDrawer>
        </div>

        {showDigest ? (
          <DigestContent node={digestNode} />
        ) : filterReading ? (
          // 필터 정독 — 매칭 조문 전문을 가운데에 순차 로드.
          <FilteredArticlesReader
            lawCode={subject.slug}
            importanceMin={treeFilter.importance}
            bookmarkMin={treeFilter.bookmark}
          />
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
