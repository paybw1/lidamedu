import type {
  ProblemFiltersApplied,
  ProblemNodeFilter,
} from "../../lib/loader.server";
import type { LawSubjectMeta } from "../../lib/subjects";

import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckSquareIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  FilterXIcon,
  ListChecksIcon,
  ListTreeIcon,
  NotebookPenIcon,
  PencilIcon,
  PlayIcon,
  SlidersHorizontalIcon,
  StarIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { Form, Link, useFetcher, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { SheetHeader, SheetTitle } from "~/core/components/ui/sheet";
import {
  SortAxisProvider,
  SortAxisToggle,
} from "~/features/subjects/components/sort-axis";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import { cn } from "~/core/lib/utils";
import type { SystematicNode } from "~/features/laws/queries.server";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  PROBLEM_SORT_DEFAULT_DIR,
  type ProblemFormat,
  type ProblemListItem,
  type ProblemOrigin,
  type ProblemPolarity,
  type ProblemScope,
  type ProblemSortDir,
  type ProblemSortKey,
  SCOPE_LABEL,
  SUBJECTIVE_KIND_LABEL,
} from "~/features/problems/labels";
import type { SystematicNodeProblemStat } from "~/features/problems/queries.server";
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_TONE,
  type DifficultyBucket,
  type ProblemAggregateStats,
} from "~/features/study/lib/difficulty";
import type { UserProblemStats } from "~/features/study/queries.server";

import { LevelChipFilter } from "../level-chip-filter";
import { MobileNavDrawer } from "../mobile-nav-drawer";
import { ProblemSystematicTree } from "../problem-systematic-tree";
import {
  SubjectStudyStatus,
  type SubjectStudyStatusProps,
} from "../subject-study-status";
import { stripSystematicNumber } from "../systematic-node-label";

// 학습과목 문제탭: "기출"은 기출 + 기출변형을 한 묶음으로(필터·칩 모두). 출처 옵션에서 변형 제외.
const ORIGIN_OPTS: ProblemOrigin[] = ["past_exam", "mock", "expected"];

// 출처 표시 — 기출변형도 "기출"로 묶어 노출(필터와 일관). 전역 ORIGIN_LABEL 은 불변(admin·essay 유지).
function mergedOriginLabel(origin: ProblemOrigin): string {
  return origin === "past_exam_variant"
    ? ORIGIN_LABEL.past_exam
    : ORIGIN_LABEL[origin];
}
const FORMAT_OPTS: ProblemFormat[] = ["mc_short", "mc_box", "mc_case"];
const POLARITY_OPTS: ProblemPolarity[] = ["positive", "negative"];
const SCOPE_OPTS: ProblemScope[] = ["unit", "comprehensive"];
const DIFFICULTY_OPTS: Array<{
  value: DifficultyBucket | "no_data";
  label: string;
}> = [
  { value: "very_easy", label: "매우 쉬움" },
  { value: "easy", label: "쉬움" },
  { value: "medium", label: "보통" },
  { value: "hard", label: "어려움" },
  { value: "very_hard", label: "매우 어려움" },
  { value: "no_data", label: "데이터 부족" },
];

export function ProblemsTab({
  subject,
  problems,
  availableYears,
  appliedFilters,
  stats,
  aggStats,
  systematicNodes,
  nodeStats,
  nodeFilter,
  studyStatus,
}: {
  subject: LawSubjectMeta;
  problems: ProblemListItem[];
  availableYears: number[];
  appliedFilters: ProblemFiltersApplied;
  stats: UserProblemStats | null;
  aggStats: Record<string, ProblemAggregateStats>;
  systematicNodes: SystematicNode[];
  nodeStats: Record<string, SystematicNodeProblemStat>;
  nodeFilter: ProblemNodeFilter | null;
  studyStatus: SubjectStudyStatusProps;
}) {
  // 주관식(2차)은 별도 레일 탭(SubjectiveTab) — 이 탭은 객관식(1차)만 다룬다.
  const firstRound = problems.filter((p) => p.examRound === "first");
  const filterActive =
    appliedFilters.origin != null ||
    appliedFilters.year != null ||
    appliedFilters.format != null ||
    appliedFilters.polarity != null ||
    appliedFilters.scope != null ||
    appliedFilters.difficulty != null ||
    appliedFilters.sort != null ||
    (appliedFilters.search != null && appliedFilters.search.length > 0) ||
    (appliedFilters.bookmarkMin ?? 0) > 0 ||
    (appliedFilters.importanceMin ?? 0) > 0 ||
    nodeFilter != null;

  const [searchParams] = useSearchParams();

  // 정오문제 불가 런처 — fetcher 로 제출(성공=세션 redirect 자동 추종, 실패=인라인 메시지).
  const ineligibleFetcher = useFetcher<{ error?: string }>();
  const ineligibleBusy = ineligibleFetcher.state !== "idle";
  // 범위 선택지 — 체계도 1·2단계 노드만(caseOnly 제외). path 는 "." 구분 materialized path.
  const scopeNodes = systematicNodes.filter(
    (n) => !n.caseOnly && n.path.split(".").length <= 2,
  );

  // 체계도 필터만 해제 — 나머지 검색/필터는 보존.
  const clearNodeHref = (() => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("node");
    sp.set("tab", "problems");
    return `?${sp.toString()}`;
  })();
  // 문제 클릭 시 현재 색인 컨텍스트(필터·정렬·단원)를 실어 보낸다 → 뷰어가 이 목록
  //   순서대로 prev/next(list 모드, 같은 차수 섹션 내). tab 제외, list=1 표식 추가.
  const problemLinkQuery = (() => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("tab");
    sp.set("list", "1");
    const s = sp.toString();
    return s ? `?${s}` : "";
  })();
  // 정렬만 해제 — 필터·단원은 유지하고 p_sort/p_dir 만 제거(원래 순서로 복귀).
  const clearSortHref = (() => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("p_sort");
    sp.delete("p_dir");
    sp.set("tab", "problems");
    return `?${sp.toString()}`;
  })();

  const attemptedCount = stats?.attemptedCount ?? 0;
  const correctCount = stats?.correctCount ?? 0;
  const wrongCount = stats?.wrongCount ?? 0;
  const accuracyPct =
    attemptedCount > 0
      ? Math.round((correctCount / attemptedCount) * 100)
      : null;

  // 체계도 트리 — 데스크톱 사이드바 / 모바일 드로어 공용 마크업.
  // 헤더는 체계도/조문 토글(문제는 체계도 고정 → 조문 비활성, 조문 뷰어와 동일 UX).
  const treePanel = (
    <SortAxisProvider forced="systematic">
      <div className="border-border bg-muted/30 overflow-hidden rounded-xl border lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
        <div className="border-border bg-card sticky top-0 z-10 flex items-center justify-end rounded-t-xl border-b px-3 py-2">
          <SortAxisToggle size="sm" disabledAxes={["statutory"]} />
        </div>
        <div className="p-2">
          <ProblemSystematicTree
            nodes={systematicNodes}
            nodeStats={nodeStats}
            activeNodeId={nodeFilter?.nodeId}
          />
        </div>
      </div>
    </SortAxisProvider>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Left: tree panel — 데스크톱만 sticky 사이드바. 모바일은 드로어. */}
      <aside className="hidden lg:sticky lg:top-20 lg:block">
        {treePanel}
      </aside>
      <section className="space-y-4">
        {/* 모바일 트리 드로어 — 목록이 위로 오고, 트리는 버튼으로 연다 */}
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

        {/* 체계도 노드 필터가 걸리면(문제 트리에서 노드 선택) 학습 현황·KPI 를
            숨기고 결과 목록에 집중한다. */}
        {!nodeFilter &&
        !appliedFilters.bookmarkMin &&
        !appliedFilters.importanceMin ? (
          <>
            <SubjectStudyStatus {...studyStatus} kind="problem" />

            {/* KPI cards — 3 columns */}
            <div className="grid gap-3 sm:grid-cols-3">
              <ProblemsKpiCard
                label="출제 문항"
                value={problems.length.toLocaleString("ko-KR")}
                sub="현재 등록된 전체"
              />
              <ProblemsKpiCard
                label="내 풀이"
                value={attemptedCount.toLocaleString("ko-KR")}
                sub={`전체 시도 ${(stats?.totalAttempts ?? 0).toLocaleString("ko-KR")}회`}
              />
              <ProblemsKpiCard
                label="정답률"
                value={accuracyPct === null ? "—" : `${accuracyPct}%`}
                sub={
                  attemptedCount > 0
                    ? `정답 ${correctCount} · 오답 ${wrongCount}`
                    : "한 문제도 풀지 않았습니다"
                }
                accent={accuracyPct !== null}
              />
            </div>
          </>
        ) : null}

        {/* 체계도 노드 필터 배너 */}
        {nodeFilter ? (
          <div className="border-border bg-primary/[0.04] flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-xs">
            <ListChecksIcon className="text-link size-3.5 shrink-0" />
            <span className="text-muted-foreground">체계도 필터</span>
            <Badge variant="secondary" className="max-w-[260px] truncate">
              {stripSystematicNumber(nodeFilter.label)}
            </Badge>
            {nodeFilter.firstProblemId ? (
              <Button asChild size="sm" className="h-7 rounded-full px-3">
                <Link
                  to={`/subjects/${subject.slug}/problems/${nodeFilter.firstProblemId}?node=${nodeFilter.nodeId}`}
                  viewTransition
                >
                  <PlayIcon className="size-3" /> 이 체계 풀기
                </Link>
              </Button>
            ) : null}
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2"
            >
              <Link to={clearNodeHref} preventScrollReset>
                <XIcon className="size-3" /> 전체 보기
              </Link>
            </Button>
          </div>
        ) : null}

        {/* Wrong-note amber banner */}
        {wrongCount > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-500/[0.10] px-4 py-3.5 dark:bg-amber-500/[0.08]">
            <TriangleAlertIcon className="size-[18px] shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="text-foreground text-sm font-bold">
                오답 {wrongCount}개 · 우선 복습 추천
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                마지막 시도가 오답인 문제가 있습니다. 오답노트에서 재풀이를
                권장합니다.
              </p>
            </div>
            <Button asChild size="sm" className="h-8 shrink-0 rounded-full">
              <Link
                to={`/study/wrong-note?subject=${subject.slug}`}
                viewTransition
              >
                오답노트 <ArrowRightIcon className="size-3.5" />
              </Link>
            </Button>
          </div>
        ) : null}

        {/* Learning mode cards + 정오문제 불가 런처 */}
        {firstRound.length > 0 ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <ModeCard
                icon={<SlidersHorizontalIcon className="size-[18px]" />}
                title="맞춤 퀴즈"
                desc="유형/연도/극성으로 N문제 묶음 · 시험 모드 가능"
                href={`/subjects/${subject.slug}/quiz/setup`}
                cta="설정"
                ctaVariant="outline"
              />
              <ModeCard
                icon={<CheckSquareIcon className="size-[18px]" />}
                title="정오문제"
                desc="정오문제 지문 무작위 빠른 풀이"
                href={`/subjects/${subject.slug}/ox`}
                cta="시작"
                ctaVariant="outline"
              />
            </div>
            {/* 정오문제로 만들 수 없어 OX 드릴에서 빠지는 문제(불가 체크)를 일반 객관식으로.
                체계도 1·2단계 노드로 범위를 좁힐 수 있다(미선택 시 과목 전체). */}
            <ineligibleFetcher.Form
              method="post"
              action="/api/study/session-from-ox-ineligible"
              className="border-border bg-muted/30 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
            >
              <input type="hidden" name="subject" value={subject.slug} />
              <span className="bg-muted text-ink-soft inline-flex size-9 shrink-0 items-center justify-center rounded-lg">
                <CheckSquareIcon className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-foreground block text-sm font-bold">
                  정오문제 불가 문제 풀기
                </span>
                <span className="text-muted-foreground block text-xs leading-relaxed">
                  순서나열·개수형 등 정오문제로 만들 수 없어 OX 드릴에서 빠지는 문제를
                  일반 객관식으로 모아 풀이
                </span>
              </span>
              {/* 범위 — 체계도 1·2단계 노드(미선택 시 과목 전체) */}
              <label className="flex flex-col gap-0.5">
                <span className="text-muted-foreground font-mono text-[10px] font-bold tracking-wide uppercase">
                  범위
                </span>
                <div className="relative">
                  <select
                    name="nodeId"
                    defaultValue=""
                    aria-label="정오문제 불가 풀이 범위(체계도)"
                    className="border-border bg-background text-foreground h-8 max-w-[220px] appearance-none rounded-full border py-0 pr-7 pl-3 text-xs font-medium focus:outline-none"
                  >
                    <option value="">전체 범위</option>
                    {scopeNodes.map((n) => {
                      const isSub = n.path.split(".").length === 2;
                      const label = stripSystematicNumber(n.displayLabel);
                      return (
                        <option key={n.nodeId} value={n.nodeId}>
                          {isSub ? `└ ${label}` : label}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2" />
                </div>
              </label>
              <Button
                type="submit"
                size="sm"
                disabled={ineligibleBusy}
                className="h-9 shrink-0 gap-1 rounded-full"
              >
                <PlayIcon className="size-3.5" />
                {ineligibleBusy ? "준비 중…" : "시작"}
              </Button>
            </ineligibleFetcher.Form>
            {ineligibleFetcher.data?.error ? (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {ineligibleFetcher.data.error}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Filter row */}
        <div className="border-border bg-muted/30 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5">
          <Form method="get" className="contents">
            <input type="hidden" name="tab" value="problems" />
            {nodeFilter ? (
              <input type="hidden" name="node" value={nodeFilter.nodeId} />
            ) : null}
            {appliedFilters.bookmarkMin ? (
              <input
                type="hidden"
                name="p_bookmarked"
                value={String(appliedFilters.bookmarkMin)}
              />
            ) : null}
            {appliedFilters.importanceMin ? (
              <input
                type="hidden"
                name="p_importance"
                value={String(appliedFilters.importanceMin)}
              />
            ) : null}
            {/* 정렬은 컬럼 헤더 클릭으로 설정 — 필터 적용(폼 제출) 시 잃지 않도록 보존. */}
            {appliedFilters.sort ? (
              <input type="hidden" name="p_sort" value={appliedFilters.sort} />
            ) : null}
            {appliedFilters.sortDir ? (
              <input type="hidden" name="p_dir" value={appliedFilters.sortDir} />
            ) : null}
            {/* Search chip-style input */}
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground font-mono text-[10px] font-bold tracking-wide uppercase">
                본문 검색
              </span>
              <input
                type="text"
                name="p_search"
                defaultValue={appliedFilters.search ?? ""}
                placeholder="키워드"
                maxLength={100}
                data-testid="problem-search"
                className="border-border bg-background focus:ring-primary h-8 w-36 rounded-lg border px-2.5 text-xs focus:ring-1 focus:outline-none"
              />
            </div>
            <FilterSelectChip
              label="출처"
              name="p_origin"
              value={
                appliedFilters.origin === "past_exam_variant"
                  ? "past_exam"
                  : (appliedFilters.origin ?? "")
              }
              options={ORIGIN_OPTS.map((o) => ({
                value: o,
                label: ORIGIN_LABEL[o],
              }))}
            />
            <FilterSelectChip
              label="연도"
              name="p_year"
              value={
                appliedFilters.year != null ? String(appliedFilters.year) : ""
              }
              options={availableYears.map((y) => ({
                value: String(y),
                label: `${y}년`,
              }))}
            />
            <FilterSelectChip
              label="단원/종합"
              name="p_scope"
              value={appliedFilters.scope ?? ""}
              options={SCOPE_OPTS.map((s) => ({
                value: s,
                label: SCOPE_LABEL[s],
              }))}
            />
            <FilterSelectChip
              label="유형"
              name="p_format"
              value={appliedFilters.format ?? ""}
              options={FORMAT_OPTS.map((f) => ({
                value: f,
                label: FORMAT_LABEL[f],
              }))}
            />
            <FilterSelectChip
              label="극성"
              name="p_polarity"
              value={appliedFilters.polarity ?? ""}
              options={POLARITY_OPTS.map((p) => ({
                value: p,
                label: POLARITY_LABEL[p],
              }))}
            />
            <FilterSelectChip
              label="난이도"
              name="p_difficulty"
              value={appliedFilters.difficulty ?? ""}
              options={DIFFICULTY_OPTS.map((d) => ({
                value: d.value,
                label: d.label,
              }))}
            />
            <Button type="submit" size="sm" className="h-8 rounded-full">
              적용
            </Button>
          </Form>
          <LevelChipFilter
            kind="importance"
            paramName="p_importance"
            value={appliedFilters.importanceMin ?? 0}
          />
          <LevelChipFilter
            kind="bookmark"
            paramName="p_bookmarked"
            value={appliedFilters.bookmarkMin ?? 0}
          />
          {appliedFilters.sort ? (
            <Button
              asChild
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 rounded-full"
            >
              <Link to={clearSortHref} preventScrollReset>
                <ArrowUpDownIcon className="size-3.5" /> 정렬 해제
              </Link>
            </Button>
          ) : null}
          {filterActive ? (
            <Button
              asChild
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 rounded-full"
            >
              <Link to={`/subjects/${subject.slug}?tab=problems`}>
                <FilterXIcon className="size-3.5" /> 초기화
              </Link>
            </Button>
          ) : null}
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            총 {problems.length.toLocaleString("ko-KR")}건
          </span>
        </div>

        {/* 객관식 table */}
        <div className="border-border overflow-hidden rounded-xl border shadow-sm">
          {/* Section header */}
          <div className="border-border bg-muted/30 flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <CircleCheckIcon className="text-link size-4" />
              <h3 className="text-sm font-semibold">객관식</h3>
            </div>
            <span className="border-border bg-background text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tabular-nums">
              {firstRound.length}건
            </span>
          </div>
          {firstRound.length === 0 ? (
            <div className="p-12 text-center">
              <ListChecksIcon className="text-muted-foreground/40 mx-auto size-8" />
              <p className="text-muted-foreground mt-3 text-sm">
                {filterActive
                  ? "필터 조건에 해당하는 문제가 없습니다."
                  : `${subject.name} 객관식 문제가 아직 등록되지 않았습니다.`}
              </p>
              {filterActive ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="mt-3 h-8 rounded-full"
                >
                  <Link to={`/subjects/${subject.slug}?tab=problems`}>
                    <FilterXIcon className="size-3.5" /> 필터 초기화
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <SortableHead
                    label="★"
                    sortKey="importance"
                    applied={appliedFilters}
                    searchParams={searchParams}
                    align="center"
                    className="w-10 text-center md:w-12"
                  />
                  <SortableHead
                    label="전체"
                    sortKey="overall"
                    applied={appliedFilters}
                    searchParams={searchParams}
                    className="w-12 md:w-16"
                  />
                  <SortableHead
                    label="No."
                    sortKey="number"
                    applied={appliedFilters}
                    searchParams={searchParams}
                    className="w-12 md:w-16"
                  />
                  <SortableHead
                    label="출처"
                    sortKey="origin"
                    applied={appliedFilters}
                    searchParams={searchParams}
                    className="hidden w-20 md:table-cell"
                  />
                  <SortableHead
                    label="유형"
                    sortKey="format"
                    applied={appliedFilters}
                    searchParams={searchParams}
                    className="hidden w-20 md:table-cell"
                  />
                  <SortableHead
                    label="극성"
                    sortKey="polarity"
                    applied={appliedFilters}
                    searchParams={searchParams}
                    className="hidden w-20 md:table-cell"
                  />
                  <SortableHead
                    label="단원/종합"
                    sortKey="scope"
                    applied={appliedFilters}
                    searchParams={searchParams}
                    className="hidden w-20 md:table-cell"
                  />
                  <SortableHead
                    label="연도/회차"
                    sortKey="year"
                    applied={appliedFilters}
                    searchParams={searchParams}
                    className="hidden w-24 md:table-cell"
                  />
                  <SortableHead
                    label="난이도"
                    sortKey="accuracy"
                    applied={appliedFilters}
                    searchParams={searchParams}
                    className="hidden w-28 md:table-cell"
                  />
                  <TableHead className="text-muted-foreground/70 font-mono text-[11px] font-bold tracking-[0.04em] uppercase">
                    본문
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {firstRound.map((p) => (
                  <ProblemRow
                    key={p.problemId}
                    subject={subject}
                    item={p}
                    agg={aggStats[p.problemId]}
                    searchQuery={appliedFilters.search ?? null}
                    linkQuery={problemLinkQuery}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

      </section>
    </div>
  );
}

function ProblemsKpiCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-[26px] leading-none font-extrabold tracking-tight tabular-nums",
          accent ? "text-link" : "text-foreground",
        )}
      >
        {value}
      </p>
      {sub ? (
        <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function ModeCard({
  icon,
  title,
  desc,
  href,
  cta,
  ctaVariant,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
  cta: string;
  ctaVariant: "default" | "outline";
}) {
  return (
    <div className="border-border bg-card flex items-start gap-3 rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md">
      <span className="bg-primary/10 text-link inline-flex size-9 shrink-0 items-center justify-center rounded-[10px]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm leading-snug font-bold">
          {title}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
          {desc}
        </p>
      </div>
      <Button
        asChild
        size="sm"
        variant={ctaVariant}
        className="h-7 shrink-0 rounded-full text-xs"
      >
        <Link to={href} viewTransition>
          {cta} <ArrowRightIcon className="size-3" />
        </Link>
      </Button>
    </div>
  );
}

function FilterSelectChip({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground font-mono text-[10px] font-bold tracking-wide uppercase">
        {label}
      </span>
      <div className="relative">
        <select
          name={name}
          defaultValue={value}
          className="border-border bg-background text-foreground h-8 appearance-none rounded-full border py-0 pr-7 pl-3 text-xs font-medium focus:outline-none"
        >
          <option value="">전체</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2" />
      </div>
    </div>
  );
}

// 정렬 가능한 컬럼 헤더 — 클릭 시 그 색인 기준으로 정렬(asc/desc 토글). 서버 정렬
//   (loader applyProblemListView)이라 GET 링크. 다른 필터·단원은 그대로 보존.
function SortableHead({
  label,
  sortKey,
  applied,
  searchParams,
  className,
  align = "left",
}: {
  label: string;
  sortKey: ProblemSortKey;
  applied: ProblemFiltersApplied;
  searchParams: URLSearchParams;
  className?: string;
  align?: "left" | "center";
}) {
  const active = applied.sort === sortKey;
  const dir: ProblemSortDir | null = active
    ? (applied.sortDir ?? PROBLEM_SORT_DEFAULT_DIR[sortKey])
    : null;
  const def = PROBLEM_SORT_DEFAULT_DIR[sortKey];
  const opp: ProblemSortDir = def === "asc" ? "desc" : "asc";
  const willClear = active && dir === opp;
  const sp = new URLSearchParams(searchParams);
  sp.set("tab", "problems");
  // 3단 순환: 비활성 → 기본방향 → 반대방향 → 해제(원래 순서로 복귀).
  if (willClear) {
    sp.delete("p_sort");
    sp.delete("p_dir");
  } else {
    sp.set("p_sort", sortKey);
    sp.set("p_dir", active ? opp : def);
  }
  return (
    <TableHead
      className={cn(
        "text-muted-foreground/70 font-mono text-[11px] font-bold tracking-[0.04em] uppercase",
        className,
      )}
    >
      <Link
        to={`?${sp.toString()}`}
        preventScrollReset
        title={
          willClear
            ? "정렬 해제 (원래 순서)"
            : active
              ? "정렬 방향 전환"
              : "이 기준으로 정렬"
        }
        className={cn(
          "hover:text-foreground inline-flex items-center gap-1 transition-colors",
          align === "center" && "justify-center",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUpIcon className="size-3" />
          ) : (
            <ArrowDownIcon className="size-3" />
          )
        ) : (
          <ArrowUpDownIcon className="size-3 opacity-30" />
        )}
      </Link>
    </TableHead>
  );
}

function ProblemRow({
  subject,
  item,
  agg,
  searchQuery,
  linkQuery,
}: {
  subject: LawSubjectMeta;
  item: ProblemListItem;
  agg: ProblemAggregateStats | undefined;
  searchQuery: string | null;
  // 현재 색인 컨텍스트(?list=1&...) — 뷰어 prev/next 가 이 목록을 따르게.
  linkQuery: string;
}) {
  const yearLabel =
    item.year && item.examRoundNo
      ? `${item.year}년 ${item.examRoundNo}회`
      : item.year
        ? String(item.year)
        : "—";

  return (
    <TableRow className="hover:bg-muted/40 cursor-pointer">
      <TableCell className="text-center">
        {item.importance >= 1 ? (
          <span
            className="inline-flex items-center justify-center gap-0.5 text-amber-500"
            title={`중요도 ${item.importance}`}
          >
            <StarIcon className="size-3 fill-current" />
            <span className="text-[11px] font-semibold tabular-nums">
              {item.importance}
            </span>
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-link text-xs font-semibold tabular-nums">
        {item.overallNo ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs tabular-nums">
        {item.problemNumber ?? "—"}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {/* origin chip */}
        <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium">
          {mergedOriginLabel(item.origin)}
        </span>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {/* format chip */}
        <span className="border-border text-foreground inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium">
          {FORMAT_LABEL[item.format]}
        </span>
      </TableCell>
      <TableCell className="hidden text-xs md:table-cell">
        {item.polarity ? POLARITY_LABEL[item.polarity] : "—"}
      </TableCell>
      <TableCell className="hidden text-xs md:table-cell">
        {item.scope ? SCOPE_LABEL[item.scope] : "—"}
      </TableCell>
      <TableCell className="hidden text-xs tabular-nums md:table-cell">
        {yearLabel}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <DifficultyCell agg={agg} />
      </TableCell>
      <TableCell className="whitespace-normal">
        <Link
          to={`/subjects/${subject.slug}/problems/${item.problemId}${linkQuery}`}
          viewTransition
          prefetch="intent"
          className="hover:text-link block text-sm break-words"
        >
          {renderBodySnippet(item.bodyMd, searchQuery)}
        </Link>
      </TableCell>
    </TableRow>
  );
}

// 검색 쿼리가 있으면 매칭 위치 ±40자 컨텍스트 + <mark> 강조. 없으면 첫 80자 truncate.
function renderBodySnippet(
  body: string,
  query: string | null,
): React.ReactNode {
  if (!query || query.trim().length === 0) {
    return body.length > 80 ? `${body.slice(0, 80)}…` : body;
  }
  const q = query.trim();
  const idx = body.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) {
    return body.length > 80 ? `${body.slice(0, 80)}…` : body;
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(body.length, idx + q.length + 40);
  const before = (start > 0 ? "…" : "") + body.slice(start, idx);
  const match = body.slice(idx, idx + q.length);
  const after =
    body.slice(idx + q.length, end) + (end < body.length ? "…" : "");
  return (
    <>
      {before}
      <mark className="rounded bg-amber-200 px-0.5 dark:bg-amber-700/40">
        {match}
      </mark>
      {after}
    </>
  );
}

function DifficultyCell({ agg }: { agg: ProblemAggregateStats | undefined }) {
  if (!agg || agg.attempts === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  if (!agg.bucket || agg.accuracyPct === null) {
    return (
      <span className="text-muted-foreground text-xs tabular-nums">
        시도 {agg.attempts}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        DIFFICULTY_TONE[agg.bucket],
      )}
      title={`전체 정답률 ${agg.accuracyPct}% · 시도 ${agg.attempts}회`}
    >
      {DIFFICULTY_LABEL[agg.bucket]}
      <span className="text-muted-foreground/80 tabular-nums">
        {agg.accuracyPct}%
      </span>
    </span>
  );
}
