import type {
  CaseFiltersApplied,
  CaseTreeCounts,
  ProblemFiltersApplied,
  ProblemNodeFilter,
} from "../lib/loader.server";

import { type ComponentType, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/core/components/ui/tabs";
import { cn } from "~/core/lib/utils";
import type { ArticleAnnotationCounts } from "~/features/annotations/queries.server";
import type { CaseListItem } from "~/features/cases/queries.server";
import type {
  ArticleNode,
  SystematicNode,
} from "~/features/laws/queries.server";
import type {
  ProblemListItem,
  SystematicNodeProblemStat,
} from "~/features/problems/queries.server";
import type { ProblemAggregateStats } from "~/features/study/lib/difficulty";
import type {
  RecommendedArticleItem,
  SubjectProgress,
  UserProblemStats,
} from "~/features/study/queries.server";

import {
  DEFAULT_SUBJECT_TAB,
  type LawSubjectMeta,
  type SubjectTab,
  subjectTabSchema,
} from "../lib/subjects";
import { SortAxisProvider, SortAxisToggle } from "./sort-axis";
import { BOOKMARK_AXES, BookmarkTabInner } from "./subject-bookmark-rail";
import type { SubjectStudyStatusProps } from "./subject-study-status";
import { ArticlesTab } from "./tabs/articles-tab";
import { CasesTab } from "./tabs/cases-tab";
import { ProblemsTab } from "./tabs/problems-tab";

interface SubjectHubProps {
  subject: LawSubjectMeta;
  lawId?: string;
  articles?: ArticleNode[];
  systematicNodes?: SystematicNode[];
  progressByArticle?: import("./node-progress-gauge").NodeProgressByArticle;
  cases?: CaseListItem[];
  casesTotal?: number;
  caseFilters?: CaseFiltersApplied;
  caseTreeCounts?: CaseTreeCounts;
  problems?: ProblemListItem[];
  caseQuery?: string;
  progress?: SubjectProgress | null;
  recentRevisionDate?: string | null;
  bookmarkLevels?: Record<string, number>;
  annotationCounts?: Record<string, ArticleAnnotationCounts>;
  problemYears?: number[];
  problemFilters?: ProblemFiltersApplied;
  problemStats?: UserProblemStats | null;
  problemAggStats?: Record<string, ProblemAggregateStats>;
  recommendedArticles?: RecommendedArticleItem[];
  systematicNodeProblemStats?: Record<string, SystematicNodeProblemStat>;
  problemNodeFilter?: ProblemNodeFilter | null;
  // 책갈피 레일 3축 총량 — BookmarkTab 옆 카운트 배지.
  axisCounts?: Record<SubjectTab, number>;
}

export function SubjectHub(props: SubjectHubProps) {
  return (
    <SortAxisProvider>
      <SubjectHubInner {...props} />
    </SortAxisProvider>
  );
}

function SubjectHubInner({
  subject,
  lawId,
  articles,
  systematicNodes,
  cases,
  casesTotal,
  caseFilters,
  caseTreeCounts,
  problems,
  caseQuery,
  progress,
  recentRevisionDate,
  bookmarkLevels,
  annotationCounts,
  problemYears,
  problemFilters,
  problemStats,
  problemAggStats,
  recommendedArticles,
  progressByArticle,
  systematicNodeProblemStats,
  problemNodeFilter,
  axisCounts,
}: SubjectHubProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo<SubjectTab>(() => {
    const raw = searchParams.get("tab");
    const parsed = subjectTabSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_SUBJECT_TAB;
  }, [searchParams]);

  const onTabChange = useCallback(
    (next: string) => {
      const parsed = subjectTabSchema.safeParse(next);
      if (!parsed.success) return;
      setSearchParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (parsed.data === DEFAULT_SUBJECT_TAB) {
            out.delete("tab");
          } else {
            out.set("tab", parsed.data);
          }
          return out;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  const problemTotal = (problems ?? []).length;
  // 즐겨찾기·노트 합산 — 인포라인 카운트용. 현재는 article 만 합산(loader 가
  // article 만 가져옴). case 도 표시하려면 추후 polymorphic 카운트 헬퍼 도입.
  const bookmarkCount = Object.keys(bookmarkLevels ?? {}).length;
  const annotationCount = Object.values(annotationCounts ?? {}).reduce(
    (sum, c) => sum + c.memos + c.highlights,
    0,
  );

  // 학습 현황 카드 — 헤더에서 빼고 각 탭 본문 컬럼 최상단에 동일하게 표시.
  // 책갈피 레일·좌측 트리와 같은 행에 옆으로 보이게 하기 위함.
  const studyStatus: SubjectStudyStatusProps = {
    subject,
    progress: progress ?? null,
    problemStats: problemStats ?? null,
    problemTotal,
    bookmarkCount,
    annotationCount,
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <SubjectHeader subject={subject} />

      {/* 세로 책갈피 내비게이션 — 조문·판례·문제 3축을 좌측 패널 바깥에 부착.
          활성 탭은 네이비로 좌측 트리 패널에 맞물린다. */}
      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        orientation="vertical"
        className="mt-6 flex flex-row items-start gap-0"
      >
        {/* 책갈피 레일 — pt 로 패널 둥근 모서리를 비켜 직선 변에 부착 */}
        <TabsList className="flex h-auto w-[58px] shrink-0 flex-col items-stretch gap-2.5 rounded-none border-0 bg-transparent p-0 pt-5 lg:sticky lg:top-20">
          {BOOKMARK_AXES.map((axis) => (
            <BookmarkTab
              key={axis.value}
              value={axis.value}
              icon={axis.icon}
              label={axis.label}
              count={axisCounts?.[axis.value]}
            />
          ))}
        </TabsList>

        <div className="min-w-0 flex-1">
          <TabsContent value="articles" className="mt-0">
            <ArticlesTab
              subject={subject}
              lawId={lawId}
              articles={articles ?? []}
              systematicNodes={systematicNodes ?? []}
              progress={progress ?? null}
              bookmarkLevels={bookmarkLevels}
              annotationCounts={annotationCounts}
              recommendedArticles={recommendedArticles ?? []}
              progressByArticle={progressByArticle}
              cases={cases ?? []}
              casesTotal={casesTotal ?? cases?.length ?? 0}
              problems={problems ?? []}
              problemStats={problemStats ?? null}
              studyStatus={studyStatus}
            />
          </TabsContent>
          <TabsContent value="cases" className="mt-0">
            <CasesTab
              subject={subject}
              cases={cases ?? []}
              casesTotal={casesTotal ?? cases?.length ?? 0}
              caseFilters={caseFilters}
              initialQuery={caseQuery ?? ""}
              articles={articles ?? []}
              systematicNodes={systematicNodes ?? []}
              caseTreeCounts={
                caseTreeCounts ?? {
                  byArticleId: {},
                  byChapterId: {},
                  byNodeId: {},
                }
              }
              studyStatus={studyStatus}
            />
          </TabsContent>
          <TabsContent value="problems" className="mt-0">
            <ProblemsTab
              subject={subject}
              problems={problems ?? []}
              availableYears={problemYears ?? []}
              appliedFilters={problemFilters ?? {}}
              stats={problemStats ?? null}
              aggStats={problemAggStats ?? {}}
              systematicNodes={systematicNodes ?? []}
              nodeStats={systematicNodeProblemStats ?? {}}
              nodeFilter={problemNodeFilter ?? null}
              studyStatus={studyStatus}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/**
 * 세로 책갈피 탭 (정보형) — 아이콘 + 세로 라벨 + 구분선 + 콘텐츠 수.
 * 활성 시 네이비로 채워지며(역상) 1px 우측 이동해 좌측 트리 패널 변에 맞물린다.
 *
 * 주의: `TabsTrigger` 기본 클래스에 `flex-1`(세로 레일에서 높이를 먹어버림)과
 * `data-[state=active]:bg-background`(우선순위로 일반 클래스를 이김)가 있다.
 * 그래서 반드시 `flex-none` + `data-[state=active]:` 변형으로 덮어써야
 * 크기·역상이 실제로 적용된다.
 */
function BookmarkTab({
  value,
  icon,
  label,
  count,
}: {
  value: SubjectTab;
  icon: ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        // flex-none — 기본 flex-1 을 눌러 h-[148px] 가 실제로 적용되게 한다.
        "relative flex h-[148px] w-[58px] flex-none flex-col items-center justify-center gap-2 p-0",
        "rounded-l-xl rounded-r-none border border-r-0 transition-all",
        // 비활성 기본
        "border-border bg-card text-muted-foreground",
        "hover:bg-primary/[0.06] hover:text-primary hover:-translate-x-1.5",
        // 활성(역상) — data-[state=active] 변형으로 기본값을 정확히 덮어쓴다 (light·dark).
        "data-[state=active]:border-primary data-[state=active]:z-10 data-[state=active]:translate-x-px",
        "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
        "dark:data-[state=active]:border-primary dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground",
        "data-[state=active]:shadow-[-4px_6px_18px_rgba(45,91,168,0.26)]",
      )}
    >
      <BookmarkTabInner icon={icon} label={label} count={count} />
    </TabsTrigger>
  );
}

function SubjectHeader({ subject }: { subject: LawSubjectMeta }) {
  return (
    <header className="space-y-4">
      <p className="text-primary font-mono text-[11px] font-bold tracking-[0.10em] uppercase">
        과목별 학습 · {subject.categoryLabel}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-foreground text-4xl font-extrabold tracking-tight">
            {subject.name}
          </h1>
          {subject.description ? (
            <p className="text-muted-foreground max-w-xl text-[15px] leading-relaxed">
              {subject.description}
            </p>
          ) : null}
        </div>
        <SortAxisToggle />
      </div>
    </header>
  );
}
