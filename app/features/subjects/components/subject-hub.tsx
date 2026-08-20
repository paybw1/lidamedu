import type {
  CaseFiltersApplied,
  CaseTreeCounts,
  ProblemFiltersApplied,
  ProblemNodeFilter,
} from "../lib/loader.server";
import type { SubjectStudyStatusProps } from "./subject-study-status";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { AreaEyebrow } from "~/core/components/student";
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
  ProblemPlacement,
  SubjectiveNodeLeaf,
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
  subjectHasSystematicAxis,
  subjectTabSchema,
} from "../lib/subjects";
import { SortAxisProvider } from "./sort-axis";
import { BookmarkTabInner, bookmarkAxesFor } from "./subject-bookmark-rail";
import { ArticlesTab } from "./tabs/articles-tab";
import { CasesTab } from "./tabs/cases-tab";
import { ProblemsTab } from "./tabs/problems-tab";
import { SubjectiveTab } from "./tabs/subjective-tab";

interface SubjectHubProps {
  subject: LawSubjectMeta;
  lawId?: string;
  articles?: ArticleNode[];
  systematicNodes?: SystematicNode[];
  progressByArticle?: import("./node-progress-gauge").NodeProgressByArticle;
  cases?: CaseListItem[];
  casesTotal?: number;
  /** feat-2-035 — 도식 보유 판례 id(학생=승인분만). */
  diagramCaseIds?: string[];
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
  // 주관식 탭 게이트 — 고도화 전까지 staff 전용(학생은 레일에서 비활성).
  isStaff?: boolean;
  // 주관식 문항별 3단계 훈련 진행·AI 채점 여부 — 주관식 탭 학습 현황용.
  subjectiveAttemptStatus?: Record<
    string,
    { stagesDone: number; aiGraded: boolean }
  >;
  // 주관식 탭 체계도 — 노드별 카운트 / ?node= 필터 / 문항별 배치(카드 배지) / 기출 leaf.
  subjectiveNodeStats?: Record<string, SystematicNodeProblemStat>;
  subjectiveNodeLeaves?: Record<string, SubjectiveNodeLeaf[]>;
  subjectiveNodeFilter?: ProblemNodeFilter | null;
  subjectivePlacements?: Record<string, ProblemPlacement[]>;
}

export function SubjectHub(props: SubjectHubProps) {
  // 민법은 체계도=조문 목차라 조문 축으로 고정(체계도 토글 자동 비활성).
  const forcedAxis = subjectHasSystematicAxis(props.subject.slug)
    ? undefined
    : ("statutory" as const);
  return (
    <SortAxisProvider forced={forcedAxis}>
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
  diagramCaseIds,
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
  isStaff = false,
  subjectiveAttemptStatus,
  subjectiveNodeStats,
  subjectiveNodeLeaves,
  subjectiveNodeFilter,
  subjectivePlacements,
}: SubjectHubProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // 과목별 축 — 시험 차수 따라 3개(민법=객관식만·민소=주관식만) 또는 4개(특·상·디).
  const railAxes = bookmarkAxesFor(subject.slug);
  // 주관식 탭은 고도화 전까지 staff 전용(학생은 비활성·진입 차단).
  const subjectiveEnabled =
    railAxes.some((a) => a.value === "subjective") && isStaff;
  const activeTab = useMemo<SubjectTab>(() => {
    const raw = searchParams.get("tab");
    const parsed = subjectTabSchema.safeParse(raw);
    if (!parsed.success) return DEFAULT_SUBJECT_TAB;
    if (parsed.data === "subjective" && !subjectiveEnabled)
      return DEFAULT_SUBJECT_TAB;
    // 과목에 없는 축(민소의 객관식 등)은 기본 탭으로 폴백.
    if (!railAxes.some((a) => a.value === parsed.data))
      return DEFAULT_SUBJECT_TAB;
    return parsed.data;
  }, [searchParams, subjectiveEnabled, railAxes]);

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
        {/* 책갈피 레일 — pt 로 패널 둥근 모서리를 비켜 직선 변에 부착.
            sticky 금지: 스크롤을 따라오면 패널과 분리돼 보인다(패널 상단 고정).
            모바일은 숨김 — 상단 바 둘째 줄의 축 칩으로 조문·판례를 전환한다. */}
        <TabsList className="hidden h-auto w-[52px] shrink-0 flex-col items-stretch gap-1.5 rounded-none border-0 bg-transparent p-0 pt-5 lg:flex">
          {railAxes.map((axis) => (
            <BookmarkTab
              key={axis.value}
              value={axis.value}
              label={axis.label}
              count={axisCounts?.[axis.value]}
              // 주관식은 고도화 전까지 staff 전용 — 학생에겐 비활성(회색·클릭 불가).
              disabled={axis.value === "subjective" && !subjectiveEnabled}
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
              diagramCaseIds={diagramCaseIds}
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
          {subjectiveEnabled ? (
            <TabsContent value="subjective" className="mt-0">
              <SubjectiveTab
                subject={subject}
                problems={(problems ?? []).filter(
                  (p) => p.examRound === "second",
                )}
                appliedFilters={problemFilters ?? {}}
                attemptStatus={subjectiveAttemptStatus ?? {}}
                systematicNodes={systematicNodes ?? []}
                nodeStats={subjectiveNodeStats ?? {}}
                nodeLeaves={subjectiveNodeLeaves ?? {}}
                nodeFilter={subjectiveNodeFilter ?? null}
                placements={subjectivePlacements ?? {}}
                isStaff={isStaff}
              />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
    </div>
  );
}

/**
 * 세로 책갈피 탭 (정보형) — 세로 라벨 + 구분선 + 콘텐츠 수. 아이콘 없이
 * 전 과목 동일한 고정 크기(88×52). 활성 시 네이비로 채워지며(역상) 1px
 * 우측 이동해 좌측 트리 패널 변에 맞물린다.
 *
 * 주의: `TabsTrigger` 기본 클래스에 `flex-1`(세로 레일에서 높이를 먹어버림)과
 * `data-[state=active]:bg-background`(우선순위로 일반 클래스를 이김)가 있다.
 * 그래서 반드시 `flex-none` + `data-[state=active]:` 변형으로 덮어써야
 * 크기·역상이 실제로 적용된다.
 */
function BookmarkTab({
  value,
  label,
  count,
  disabled = false,
}: {
  value: SubjectTab;
  label: string;
  count?: number;
  disabled?: boolean;
}) {
  return (
    <TabsTrigger
      value={value}
      disabled={disabled}
      title={disabled ? "준비 중" : undefined}
      className={cn(
        // 비활성(주관식 학생) — 회색·클릭 불가. 잠금 흐림 대신 완전 비활성 패턴.
        disabled && "cursor-not-allowed opacity-40 hover:translate-x-0",
        // flex-none — 기본 flex-1 을 눌러 h-[88px] 가 실제로 적용되게 한다.
        "relative flex h-[88px] w-[52px] flex-none flex-col items-center justify-center gap-1 p-0",
        "rounded-l-xl rounded-r-none border border-r-0 transition-all",
        // 비활성 기본
        "border-border bg-card text-muted-foreground",
        "hover:bg-primary/[0.06] hover:text-link hover:-translate-x-1.5",
        // 활성(역상) — data-[state=active] 변형으로 기본값을 정확히 덮어쓴다 (light·dark).
        "data-[state=active]:border-primary data-[state=active]:z-10 data-[state=active]:translate-x-px",
        "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
        "dark:data-[state=active]:border-primary dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground",
        "data-[state=active]:shadow-[-4px_6px_18px_rgba(45,91,168,0.26)]",
      )}
    >
      <BookmarkTabInner label={label} count={count} />
    </TabsTrigger>
  );
}

function SubjectHeader({ subject }: { subject: LawSubjectMeta }) {
  return (
    <header className="space-y-4">
      <AreaEyebrow area="subjects" />
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
        {/* 체계도/조문 토글은 각 탭의 트리 패널 헤더에 있으므로 헤더 중복 제거 */}
      </div>
    </header>
  );
}
