import {
  BookmarkIcon,
  GavelIcon,
  ListChecksIcon,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

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

  const articleCount = (articles ?? []).filter((a) => a.level === "article").length;
  const caseCount = (cases ?? []).length;
  const problemCount = (problems ?? []).length;
  const problemAttempts = problemStats?.totalAttempts ?? 0;
  const problemAccuracyPct =
    problemStats && problemStats.attemptedCount > 0
      ? Math.round(
          (problemStats.correctCount / problemStats.attemptedCount) * 100,
        )
      : null;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <SubjectHeader
        subject={subject}
        progressPct={progress?.pctViewed}
        recentRevisionDate={recentRevisionDate}
        articleCount={articleCount}
        caseCount={caseCount}
        problemCount={problemCount}
        problemAttempts={problemAttempts}
        problemAccuracyPct={problemAccuracyPct}
      />

      {/* Underline-style tabs matching the kit's Tabs primitive */}
      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="mt-6 gap-0"
      >
        {/* Tab list: underline variant — transparent bg, bottom-border active indicator */}
        <TabsList className="h-11 w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
          <HubTabTrigger
            value="articles"
            icon={<BookmarkIcon className="size-3.5" />}
            label="조문"
            count={articleCount}
            active={activeTab === "articles"}
          />
          <HubTabTrigger
            value="cases"
            icon={<GavelIcon className="size-3.5" />}
            label="판례"
            count={caseCount}
            active={activeTab === "cases"}
          />
          <HubTabTrigger
            value="problems"
            icon={<ListChecksIcon className="size-3.5" />}
            label="문제"
            count={problemCount}
            active={activeTab === "problems"}
          />
        </TabsList>

        <TabsContent value="articles" className="mt-6">
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
          />
        </TabsContent>
        <TabsContent value="cases" className="mt-6">
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
        <TabsContent value="problems" className="mt-6">
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

/** Underline-style tab trigger with count badge. */
function HubTabTrigger({
  value,
  icon,
  label,
  count,
  active,
}: {
  value: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <TabsTrigger
      value={value}
      className={[
        // reset shadcn pill look
        "relative h-11 shrink-0 gap-1.5 rounded-none border-0 bg-transparent px-4 py-0 text-sm font-medium shadow-none",
        "focus-visible:ring-0 focus-visible:outline-none",
        // bottom-border active indicator
        "after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-t-full",
        active
          ? "text-primary after:bg-primary"
          : "text-muted-foreground after:bg-transparent hover:text-foreground",
      ].join(" ")}
    >
      {icon}
      {label}
      {/* Count badge */}
      <span
        className={[
          "inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-px font-mono text-[10px] font-bold leading-none tabular-nums",
          active
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        ].join(" ")}
      >
        {count.toLocaleString("ko-KR")}
      </span>
    </TabsTrigger>
  );
}

function SubjectHeader({
  subject,
  progressPct,
  recentRevisionDate,
  articleCount,
  caseCount,
  problemCount,
  problemAttempts,
  problemAccuracyPct,
}: {
  subject: LawSubjectMeta;
  progressPct?: number;
  recentRevisionDate?: string | null;
  articleCount: number;
  caseCount: number;
  problemCount: number;
  problemAttempts: number;
  problemAccuracyPct: number | null;
}) {
  return (
    <header className="space-y-5">
      {/* Eyebrow */}
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.10em] text-primary">
        과목별 학습 · {subject.categoryLabel}
      </p>

      {/* Title row + action buttons */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-1.5">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
            {subject.name}
          </h1>
          {subject.description ? (
            <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              {subject.description}
            </p>
          ) : null}
        </div>
        <SortAxisToggle />
      </div>

      {/* KPI strip card */}
      <div
        className="grid gap-3 rounded-xl border border-border bg-muted/50 p-5"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}
        data-testid="subject-kpi"
      >
        <KpiItem
          label="조문"
          value={articleCount.toLocaleString("ko-KR")}
        />
        <KpiItem
          label="판례"
          value={caseCount.toLocaleString("ko-KR")}
        />
        <KpiItem
          label="문제"
          value={problemCount.toLocaleString("ko-KR")}
          sub={problemAttempts > 0 ? `내 풀이 ${problemAttempts.toLocaleString("ko-KR")}` : undefined}
        />
        <KpiItem
          label="정답률"
          value={problemAccuracyPct !== null ? `${problemAccuracyPct}%` : "—"}
          sub="최근 풀이 기준"
        />
        <KpiProgressItem pct={progressPct} />
      </div>
    </header>
  );
}

function KpiItem({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-[22px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function KpiProgressItem({ pct }: { pct?: number }) {
  const clamped =
    pct !== undefined ? Math.max(0, Math.min(100, pct)) : undefined;
  return (
    <div className="min-w-0">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        진도
      </p>
      <p className="mt-1.5 text-[22px] font-extrabold leading-none tracking-tight tabular-nums text-primary">
        {clamped !== undefined ? `${clamped}%` : "—"}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: clamped !== undefined ? `${clamped}%` : "0%" }}
        />
      </div>
    </div>
  );
}
