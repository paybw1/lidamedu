import {
  BookmarkIcon,
  CalendarRangeIcon,
  GavelIcon,
  ListChecksIcon,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/core/components/ui/tabs";

import type {
  ArticleNode,
  SystematicNode,
} from "~/features/laws/queries.server";
import type { ArticleAnnotationCounts } from "~/features/annotations/queries.server";
import type { CaseListItem } from "~/features/cases/queries.server";
import type { ProblemListItem } from "~/features/problems/queries.server";
import type {
  CaseFiltersApplied,
  CaseTreeCounts,
  ProblemFiltersApplied,
} from "../lib/loader.server";
import type { ProblemAggregateStats } from "~/features/study/lib/difficulty";
import type {
  RecommendedArticleItem,
  SubjectProgress,
  UserProblemStats,
} from "~/features/study/queries.server";

import {
  DEFAULT_SUBJECT_TAB,
  EXAM_LABEL,
  type LawSubjectMeta,
  type SubjectTab,
  subjectTabSchema,
} from "../lib/subjects";
import { SortAxisProvider, SortAxisToggle } from "./sort-axis";
import { ArticlesTab } from "./tabs/articles-tab";
import { CasesTab } from "./tabs/cases-tab";
import { ProblemsTab } from "./tabs/problems-tab";

interface SubjectHubProps {
  subject: LawSubjectMeta;
  lawId?: string;
  articles?: ArticleNode[];
  systematicNodes?: SystematicNode[];
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

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <SubjectHeader
        subject={subject}
        progressPct={progress?.pctViewed}
        recentRevisionDate={recentRevisionDate}
        articleCount={
          (articles ?? []).filter((a) => a.level === "article").length
        }
        caseCount={(cases ?? []).length}
        problemCount={(problems ?? []).length}
      />

      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="mt-6 gap-4"
      >
        <TabsList className="h-10">
          <TabsTrigger value="articles" className="px-4">
            <BookmarkIcon /> 조문
          </TabsTrigger>
          <TabsTrigger value="cases" className="px-4">
            <GavelIcon /> 판례
          </TabsTrigger>
          <TabsTrigger value="problems" className="px-4">
            <ListChecksIcon /> 문제
          </TabsTrigger>
        </TabsList>

        <TabsContent value="articles">
          <ArticlesTab
            subject={subject}
            lawId={lawId}
            articles={articles ?? []}
            systematicNodes={systematicNodes ?? []}
            progress={progress ?? null}
            bookmarkLevels={bookmarkLevels}
            annotationCounts={annotationCounts}
            recommendedArticles={recommendedArticles ?? []}
          />
        </TabsContent>
        <TabsContent value="cases">
          <CasesTab
            subject={subject}
            cases={cases ?? []}
            casesTotal={casesTotal ?? (cases?.length ?? 0)}
            caseFilters={caseFilters}
            initialQuery={caseQuery ?? ""}
            articles={articles ?? []}
            systematicNodes={systematicNodes ?? []}
            caseTreeCounts={
              caseTreeCounts ?? { byArticleId: {}, byChapterId: {}, byNodeId: {} }
            }
          />
        </TabsContent>
        <TabsContent value="problems">
          <ProblemsTab
            subject={subject}
            problems={problems ?? []}
            availableYears={problemYears ?? []}
            appliedFilters={problemFilters ?? {}}
            stats={problemStats ?? null}
            aggStats={problemAggStats ?? {}}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SubjectHeader({
  subject,
  progressPct,
  recentRevisionDate,
  articleCount,
  caseCount,
  problemCount,
}: {
  subject: LawSubjectMeta;
  progressPct?: number;
  recentRevisionDate?: string | null;
  articleCount: number;
  caseCount: number;
  problemCount: number;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          과목별 학습 · {subject.categoryLabel}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{subject.name}</h1>
          <Badge variant="secondary">{EXAM_LABEL[subject.exam]}</Badge>
          {recentRevisionDate ? (
            <Badge variant="default" className="gap-1">
              <CalendarRangeIcon />
              개정 {recentRevisionDate}
            </Badge>
          ) : null}
        </div>
        {subject.description ? (
          <p className="text-muted-foreground text-sm">{subject.description}</p>
        ) : null}
        <div
          className="flex flex-wrap items-center gap-1.5 text-xs"
          data-testid="subject-kpi"
        >
          <Badge variant="outline" className="gap-1 tabular-nums">
            <BookmarkIcon className="size-3" /> 조문 {articleCount.toLocaleString("ko-KR")}
          </Badge>
          <Badge variant="outline" className="gap-1 tabular-nums">
            <GavelIcon className="size-3" /> 판례 {caseCount.toLocaleString("ko-KR")}
          </Badge>
          <Badge variant="outline" className="gap-1 tabular-nums">
            <ListChecksIcon className="size-3" /> 문제 {problemCount.toLocaleString("ko-KR")}
          </Badge>
        </div>
        <ProgressLine pct={progressPct} />
      </div>
      <SortAxisToggle />
    </header>
  );
}

function ProgressLine({ pct }: { pct?: number }) {
  if (pct === undefined) {
    return (
      <p className="text-muted-foreground text-xs">
        학습 진도는 추후 연결됩니다.
      </p>
    );
  }
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1.5 w-40 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs tabular-nums">
        {clamped}% 학습
      </span>
    </div>
  );
}
