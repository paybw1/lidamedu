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
import type { SubjectProgress } from "~/features/study/queries.server";

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
  articles?: ArticleNode[];
  systematicNodes?: SystematicNode[];
  cases?: CaseListItem[];
  problems?: ProblemListItem[];
  caseQuery?: string;
  progress?: SubjectProgress | null;
  recentRevisionDate?: string | null;
  bookmarkLevels?: Record<string, number>;
  annotationCounts?: Record<string, ArticleAnnotationCounts>;
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
  articles,
  systematicNodes,
  cases,
  problems,
  caseQuery,
  progress,
  recentRevisionDate,
  bookmarkLevels,
  annotationCounts,
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
            articles={articles ?? []}
            systematicNodes={systematicNodes ?? []}
            progress={progress ?? null}
            bookmarkLevels={bookmarkLevels}
            annotationCounts={annotationCounts}
          />
        </TabsContent>
        <TabsContent value="cases">
          <CasesTab
            subject={subject}
            cases={cases ?? []}
            initialQuery={caseQuery ?? ""}
          />
        </TabsContent>
        <TabsContent value="problems">
          <ProblemsTab subject={subject} problems={problems ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SubjectHeader({
  subject,
  progressPct,
  recentRevisionDate,
}: {
  subject: LawSubjectMeta;
  progressPct?: number;
  recentRevisionDate?: string | null;
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
