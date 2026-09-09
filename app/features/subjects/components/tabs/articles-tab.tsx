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
  SystematicDigest,
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
import { DigestPopup } from "../digest-popup";
import { FilteredArticlesReader } from "../filtered-articles-reader";
import { MobileNavDrawer } from "../mobile-nav-drawer";
import { Segmented, useSortAxis } from "../sort-axis";
import { SubjectLearningHub } from "../subject-learning-hub";
import {
  SubjectStudyStatus,
  type SubjectStudyStatusProps,
} from "../subject-study-status";
import { SystematicTree } from "../systematic-tree";

// 좌패널 토글 — 축 두 칸(체계도·조문).
const OUTLINE_OPTIONS = [
  { value: "systematic", label: "체계도", icon: NetworkIcon },
  { value: "statutory", label: "조문", icon: LayoutListIcon },
] as const;

export function ArticlesTab({
  subject,
  lawId,
  articles,
  systematicNodes,
  systematicDigests,
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
  /** 체계도 대분류별 정리비교표. staff 전용(RLS) — 학생에게는 빈 배열. */
  systematicDigests: SystematicDigest[];
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

  // 정리비교표는 **단원 화면의 「정리」 배지**에서 본다(원장 지시 2026-09-10 — 좌패널
  // 목차는 걷어냈다). 다만 전체 체계도(2p)는 어느 단원에도 속하지 않아 그 길로는 닿지
  // 않는다 — 여기 토글 옆 버튼 하나로 남긴다.
  const overviewDigests = useMemo(
    () =>
      subjectHasDigestAxis(subject.slug)
        ? systematicDigests.filter((d) => d.nodeId === null)
        : [],
    [subject.slug, systematicDigests],
  );
  const [overviewOpen, setOverviewOpen] = useState(false);

  const renderSystematic =
    hasSystematicAxis && axis === "systematic" && !systematicEmpty;

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
        {/* 전체 체계도(정리비교표 2p) — 어느 단원에도 속하지 않아 단원 화면의 「정리」
            배지로는 닿지 않는다. 여기서 화면 전체 팝업으로 연다. */}
        {overviewDigests.length > 0 ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOverviewOpen(true)}
              title="특허법 전체 체계도(교재 정리비교표)"
              className="mr-auto h-7 gap-1 rounded-full px-2 text-[11px] font-bold"
            >
              <FileTextIcon className="size-3" />
              전체 체계도
            </Button>
            <DigestPopup
              label="특허법"
              digests={overviewDigests}
              open={overviewOpen}
              onOpenChange={setOverviewOpen}
            />
          </>
        ) : null}
        {hasSystematicAxis ? (
          <Segmented
            size="sm"
            ariaLabel="목차 보기"
            value={axis}
            options={OUTLINE_OPTIONS}
            disabled={systematicEmpty ? ["systematic"] : undefined}
            onChange={setAxis}
          />
        ) : (
          <span className="text-muted-foreground text-[11px] font-medium">
            조문 목차
          </span>
        )}
      </div>
      <div className="p-2">
        {renderSystematic ? (
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
        {axis === "systematic" && systematicEmpty ? (
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

        {filterReading ? (
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
