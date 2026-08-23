import type {
  CaseFiltersApplied,
  CaseTreeCounts,
} from "../../lib/loader.server";
import type { LawSubjectMeta } from "../../lib/subjects";

import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  GavelIcon,
  GitBranchIcon,
  ListTreeIcon,
  SearchIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Form,
  Link,
  useLocation,
  useNavigate,
  useNavigation,
  useSearchParams,
} from "react-router";

import {
  LeftPanelResizer,
  useLeftPanelWidth,
} from "~/features/subjects/components/left-panel-collapse";
import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { SheetHeader, SheetTitle } from "~/core/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import {
  ExamProblemChip,
  merge2ndRoundChips,
  mergeFirstRoundChips,
} from "~/features/cases/components/exam-year-chip";
import { COURT_LABELS, type CaseListItem } from "~/features/cases/labels";
import type {
  ArticleNode,
  SystematicNode,
} from "~/features/laws/queries.server";
import { cn } from "~/core/lib/utils";

import { CaseTopicList, CaseTreeViewToggle, CasesTree } from "../cases-tree";
import { LevelChipFilter } from "../level-chip-filter";
import { MobileNavDrawer } from "../mobile-nav-drawer";
import { useSortAxis } from "../sort-axis";
import { subjectUsesCaseTopics } from "../../lib/subjects";
import {
  SubjectStudyStatus,
  type SubjectStudyStatusProps,
} from "../subject-study-status";

const COURT_OPTIONS = [
  { value: "all", label: "전체 법원" },
  { value: "supreme", label: "대법원" },
  { value: "patent_court", label: "특허법원" },
  { value: "high_court", label: "고등법원" },
  { value: "district_court", label: "지방법원" },
] as const;

// 값이 ""(전체) / "1"(도식만) 뿐인 2지 필터 — FilterGroup 은 문자열 value 를 그대로 URL 에
// 싣는다. ""는 파라미터가 빠지는 것과 같아 기본값으로 안전하다.
const DIAGRAM_OPTIONS = [
  { value: "", label: "도식 전체" },
  { value: "1", label: "도식 있음" },
] as const;

const EXAM_OPTIONS = [
  { value: "any", label: "전체" },
  { value: "exam_1st", label: "1차 기출" },
  { value: "exam_2nd", label: "2차 기출" },
  { value: "exam_both", label: "1·2차 모두" },
] as const;

const SORT_OPTIONS = [
  { value: "overall_asc", label: "전체 번호 ↑" },
  { value: "overall_desc", label: "전체 번호 ↓" },
  { value: "decided_desc", label: "선고일 ↓" },
  { value: "decided_asc", label: "선고일 ↑" },
  { value: "case_no", label: "사건번호" },
  { value: "source_asc", label: "원본 순서" },
] as const;

const DEFAULT_FILTERS: CaseFiltersApplied = {
  diagramOnly: false,
  q: "",
  court: "all",
  exam: "any",
  sort: "overall_asc",
  bookmarkMin: 0,
  importanceMin: 0,
};

export function CasesTab({
  subject,
  cases,
  casesTotal,
  diagramCaseIds,
  isStaff = false,
  caseFilters,
  initialQuery,
  articles,
  systematicNodes,
  caseTreeCounts,
  studyStatus,
}: {
  subject: LawSubjectMeta;
  cases: CaseListItem[];
  casesTotal: number;
  /** feat-2-035 — 도식 보유 판례 id(학생=승인분만). */
  diagramCaseIds?: string[];
  /** 도식 필터 칩은 staff 에게만 — 도식이 staff 전용이라 학생이 켜면 늘 0건이다. */
  isStaff?: boolean;
  caseFilters?: CaseFiltersApplied;
  initialQuery: string;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  caseTreeCounts: CaseTreeCounts;
  studyStatus: SubjectStudyStatusProps;
}) {
  const filters = caseFilters ?? { ...DEFAULT_FILTERS, q: initialQuery };
  const diagramSet = useMemo(
    () => new Set(diagramCaseIds ?? []),
    [diagramCaseIds],
  );
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const navigate = useNavigate();
  // 주제 노드(교재 배치, 라벨 "주제N 제목…") — 상표 등 주제 배치 과목에서만 존재.
  //   필터 드롭다운(전체 제목 표시) + 목록 "주제" 컬럼(주제N 축약)에 사용.
  const topicNodes = useMemo(
    () =>
      systematicNodes
        .filter((n) => /^주제\s*\d+/.test(n.displayLabel))
        .sort((a, b) => {
          const na = Number(/^주제\s*(\d+)/.exec(a.displayLabel)?.[1] ?? 0);
          const nb = Number(/^주제\s*(\d+)/.exec(b.displayLabel)?.[1] ?? 0);
          return na - nb || a.displayLabel.localeCompare(b.displayLabel);
        }),
    [systematicNodes],
  );
  // nodeId → "주제N" 축약 라벨 (목록 컬럼 표기)
  const topicShortByNodeId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of topicNodes) {
      const short = /^주제\s*\d+/.exec(n.displayLabel)?.[0]?.replace(/\s+/g, "");
      if (short) m.set(n.nodeId, short);
    }
    return m;
  }, [topicNodes]);
  const { axis, setAxis, forced } = useSortAxis();
  const axisLabel = axis === "systematic" ? "체계도" : "조문";
  const treeFilter = filters.tree ?? null;
  const systematicEmpty = systematicNodes.length === 0;
  // 좌패널 뷰 축: 체계도/조문(전역 axis 공유) + 주제(판례 탭 로컬). 주제 배치 과목만.
  const usesTopics = subjectUsesCaseTopics(subject.slug);
  const activeTopicNodeId =
    treeFilter?.kind === "node" && topicShortByNodeId.has(treeFilter.nodeId)
      ? treeFilter.nodeId
      : undefined;
  const { width: leftWidth, setWidth: setLeftWidth } = useLeftPanelWidth();
  const [topicMode, setTopicMode] = useState(
    usesTopics && Boolean(activeTopicNodeId),
  );
  const treeFilterLabel = useMemo(() => {
    if (!treeFilter) return null;
    if (treeFilter.kind === "article") {
      const a = articles.find((x) => x.articleId === treeFilter.articleId);
      return a ? a.displayLabel : "조문";
    }
    if (treeFilter.kind === "chapter") {
      const c = articles.find((x) => x.articleId === treeFilter.chapterId);
      return c ? c.displayLabel : "장/절";
    }
    const n = systematicNodes.find((x) => x.nodeId === treeFilter.nodeId);
    return n ? n.displayLabel : "체계도 항목";
  }, [treeFilter, articles, systematicNodes]);

  // 트리 단독(검색어 미적용) 카운트 — caseTreeCounts 의 article/chapter/node 키.
  // 검색어 동시 적용 시 banner 에서 "결과 N건 (트리 단독 M건)" 비교 표시.
  const treeFilterTotalLabel = useMemo(() => {
    if (!treeFilter) return "0건";
    const n =
      treeFilter.kind === "article"
        ? (caseTreeCounts.byArticleId[treeFilter.articleId] ?? 0)
        : treeFilter.kind === "chapter"
          ? (caseTreeCounts.byChapterId[treeFilter.chapterId] ?? 0)
          : (caseTreeCounts.byNodeId[treeFilter.nodeId] ?? 0);
    return `${n}건`;
  }, [treeFilter, caseTreeCounts]);

  // 트리 필터 해제 href — case_* 트리 키만 제거.
  const clearTreeHref = useMemo(() => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("case_article");
    sp.delete("case_chapter");
    sp.delete("case_node");
    return `?${sp.toString()}`;
  }, [searchParams]);
  // 검색어 해제 href — q 만 제거 (트리·정렬·법원·기출 필터는 유지).
  const clearQueryHref = useMemo(() => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("q");
    return `?${sp.toString()}`;
  }, [searchParams]);

  const [draft, setDraft] = useState(filters.q);
  useEffect(() => {
    setDraft(filters.q);
  }, [filters.q]);
  const isLoading = navigation.state !== "idle";

  const tabParam = searchParams.get("tab") ?? "";
  const importantCount = cases.filter((c) => (c.importance ?? 0) >= 3).length;
  const examCount = cases.filter(
    (c) => c.exam1stProblems.length + c.exam2ndYears.length > 0,
  ).length;

  // hidden inputs — 검색폼 submit 시 다른 필터 보존 (트리 필터 포함).
  const hidden: Array<{ name: string; value: string }> = [];
  if (tabParam) hidden.push({ name: "tab", value: tabParam });
  if (filters.court !== "all")
    hidden.push({ name: "case_court", value: filters.court });
  if (filters.exam !== "any")
    hidden.push({ name: "case_exam", value: filters.exam });
  if (filters.sort !== "decided_desc")
    hidden.push({ name: "case_sort", value: filters.sort });
  if (treeFilter?.kind === "article")
    hidden.push({ name: "case_article", value: treeFilter.articleId });
  else if (treeFilter?.kind === "chapter")
    hidden.push({ name: "case_chapter", value: treeFilter.chapterId });
  else if (treeFilter?.kind === "node")
    hidden.push({ name: "case_node", value: treeFilter.nodeId });
  if (filters.bookmarkMin > 0)
    hidden.push({
      name: "case_bookmarked",
      value: String(filters.bookmarkMin),
    });
  if (filters.importanceMin > 0)
    hidden.push({
      name: "case_importance",
      value: String(filters.importanceMin),
    });
  if (filters.diagramOnly) hidden.push({ name: "case_diagram", value: "1" });

  // FilterGroup 들의 hidden — 트리 필터·검색어 보존.
  const baseHidden: Array<{ name: string; value: string }> = [
    { name: "tab", value: tabParam },
    { name: "q", value: filters.q },
  ];
  if (treeFilter?.kind === "article")
    baseHidden.push({ name: "case_article", value: treeFilter.articleId });
  else if (treeFilter?.kind === "chapter")
    baseHidden.push({ name: "case_chapter", value: treeFilter.chapterId });
  else if (treeFilter?.kind === "node")
    baseHidden.push({ name: "case_node", value: treeFilter.nodeId });
  if (filters.bookmarkMin > 0)
    baseHidden.push({
      name: "case_bookmarked",
      value: String(filters.bookmarkMin),
    });
  if (filters.importanceMin > 0)
    baseHidden.push({
      name: "case_importance",
      value: String(filters.importanceMin),
    });
  if (filters.diagramOnly)
    baseHidden.push({ name: "case_diagram", value: "1" });

  // 트리 패널 — 데스크톱 사이드바 / 모바일 드로어에서 동일 마크업 재사용.
  // 좌패널 뷰 토글 — 체계도/조문(전역 axis) + 주제(로컬). 공유 컴포넌트(case-viewer 와 통일).
  const viewToggle = (
    <CaseTreeViewToggle
      axis={axis}
      onAxis={setAxis}
      topicMode={topicMode}
      onTopicMode={setTopicMode}
      usesTopics={usesTopics}
      systematicEmpty={systematicEmpty}
      forcedAxis={forced}
    />
  );

  const treePanel = (
    <div className="border-border bg-muted/30 overflow-hidden rounded-xl border lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
      <div className="border-border bg-card sticky top-0 z-10 flex items-center justify-end rounded-t-xl border-b px-4 py-3">
        {viewToggle}
      </div>
      <div className="p-2">
        {topicMode ? (
          <CaseTopicList
            topicNodes={topicNodes}
            byNodeId={caseTreeCounts.byNodeId}
            activeNodeId={activeTopicNodeId}
          />
        ) : (
          <CasesTree
            axis={axis}
            articles={articles}
            systematicNodes={systematicNodes}
            caseTreeCounts={caseTreeCounts}
            active={treeFilter}
          />
        )}
      </div>
    </div>
  );

  return (
    <div
      className="grid gap-6 lg:grid-cols-[var(--left-w,260px)_minmax(0,1fr)]"
      style={{ ["--left-w" as string]: `${leftWidth}px` }}
    >
      {/* Left: tree panel — 데스크톱만 sticky 사이드바. 모바일은 아래 드로어로. 경계 드래그로 폭 조절. */}
      <aside className="relative hidden lg:sticky lg:top-20 lg:block">
        <LeftPanelResizer width={leftWidth} onWidth={setLeftWidth} />
        {treePanel}
      </aside>

      {/* Right: study status + KPIs + filter + table */}
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

        {/* 트리 필터가 걸리면(판례 트리에서 노드 선택) 학습 현황·KPI 를 숨기고
            결과 목록에 집중한다. */}
        {!treeFilter && !filters.bookmarkMin && !filters.importanceMin ? (
          <>
            <SubjectStudyStatus {...studyStatus} kind="case" />

            {/* KPI cards — 3 columns */}
            <div className="grid gap-3 sm:grid-cols-3">
              <CasesKpiCard
                label="전체 판례"
                value={casesTotal.toLocaleString("ko-KR")}
                sub="모든 필터 무시"
              />
              <CasesKpiCard
                label="중요 판례"
                value={importantCount.toLocaleString("ko-KR")}
                sub="★3 이상"
              />
              <CasesKpiCard
                label="기출 보유"
                value={examCount.toLocaleString("ko-KR")}
                sub="1·2차 기출 보유"
              />
            </div>
          </>
        ) : null}

        {/* Tree filter active banner — 검색어 동시 적용 시 결과 카운트가 트리 카운트와
            달라지는 혼란을 해소하기 위해 q 와 결과 건수를 함께 노출 + 검색어 단독 해제. */}
        {treeFilter ? (
          <div className="border-border bg-primary/[0.04] flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-xs">
            <GavelIcon className="text-link size-3.5" />
            <span className="text-muted-foreground">트리 필터:</span>
            <Badge variant="secondary" className="max-w-[260px] truncate">
              {treeFilterLabel}
            </Badge>
            {filters.q ? (
              <>
                <span className="text-muted-foreground">+ 검색어:</span>
                <Badge
                  variant="secondary"
                  className="max-w-[200px] truncate font-mono"
                >
                  {filters.q}
                </Badge>
                <Button asChild variant="ghost" size="sm" className="h-6 px-2">
                  <Link to={clearQueryHref} preventScrollReset>
                    <XIcon className="size-3" /> 검색어 해제
                  </Link>
                </Button>
              </>
            ) : null}
            <span className="text-muted-foreground ml-1">
              → 결과 <strong className="text-foreground">{cases.length}</strong>건
              {filters.q ? (
                <span className="text-muted-foreground/70">
                  {" "}
                  (트리 단독 {treeFilterTotalLabel})
                </span>
              ) : null}
            </span>
            <Button asChild variant="ghost" size="sm" className="h-6 px-2">
              <Link to={clearTreeHref} preventScrollReset>
                <XIcon className="size-3" /> 전체 보기
              </Link>
            </Button>
          </div>
        ) : null}

        {/* Filter row */}
        <div className="border-border bg-muted/30 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5">
          {/* Search input */}
          <Form method="get" className="relative flex-none">
            {hidden.map((h) => (
              <input key={h.name} type="hidden" name={h.name} value={h.value} />
            ))}
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              type="search"
              name="q"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="사건번호·사건명·본문 검색"
              className="h-8 w-52 rounded-lg pl-8 text-xs"
              disabled={isLoading}
            />
            {draft ? (
              <button
                type="button"
                onClick={() => setDraft("")}
                aria-label="검색어 지우기"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </Form>

          {/* 주제 필터 — 주제 배치 과목(상표 등)에서만. 선택=기존 트리 필터(case_node) 재사용. */}
          {topicNodes.length > 0 ? (
            <div className="relative inline-flex items-center">
              <select
                value={
                  treeFilter?.kind === "node" &&
                  topicShortByNodeId.has(treeFilter.nodeId)
                    ? treeFilter.nodeId
                    : "all"
                }
                onChange={(e) => {
                  const sp = new URLSearchParams(searchParams);
                  sp.delete("case_article");
                  sp.delete("case_chapter");
                  if (e.target.value === "all") sp.delete("case_node");
                  else sp.set("case_node", e.target.value);
                  navigate(`?${sp.toString()}`, { preventScrollReset: true });
                }}
                disabled={isLoading}
                className="border-border bg-background text-foreground h-8 max-w-[280px] appearance-none truncate rounded-full border py-0 pr-7 pl-3 text-xs font-medium focus:outline-none"
                aria-label="주제"
              >
                <option value="all">전체 주제</option>
                {topicNodes.map((n) => (
                  <option key={n.nodeId} value={n.nodeId}>
                    {n.displayLabel}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2" />
            </div>
          ) : null}

          {/* Filter chips */}
          <FilterGroup
            label="법원"
            name="case_court"
            value={filters.court}
            options={COURT_OPTIONS}
            hidden={[
              ...baseHidden,
              { name: "case_exam", value: filters.exam },
              { name: "case_sort", value: filters.sort },
            ]}
          />
          <FilterGroup
            label="기출"
            name="case_exam"
            value={filters.exam}
            options={EXAM_OPTIONS}
            hidden={[
              ...baseHidden,
              { name: "case_court", value: filters.court },
              { name: "case_sort", value: filters.sort },
            ]}
          />
          <FilterGroup
            label="정렬"
            name="case_sort"
            value={filters.sort}
            options={SORT_OPTIONS}
            hidden={[
              ...baseHidden,
              { name: "case_court", value: filters.court },
              { name: "case_exam", value: filters.exam },
            ]}
          />
          <LevelChipFilter
            kind="importance"
            paramName="case_importance"
            value={filters.importanceMin}
          />
          <LevelChipFilter
            kind="bookmark"
            paramName="case_bookmarked"
            value={filters.bookmarkMin}
          />
          {isStaff ? (
            <FilterGroup
              label="도식"
              name="case_diagram"
              value={filters.diagramOnly ? "1" : ""}
              options={DIAGRAM_OPTIONS}
              hidden={[
                ...baseHidden.filter((h) => h.name !== "case_diagram"),
                { name: "case_court", value: filters.court },
                { name: "case_exam", value: filters.exam },
                { name: "case_sort", value: filters.sort },
              ]}
            />
          ) : null}
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {filters.q ? `"${filters.q}" · ` : ""}총{" "}
            {casesTotal.toLocaleString("ko-KR")}건
          </span>
        </div>

        {/* Table card */}
        <div className="border-border overflow-hidden rounded-xl border shadow-sm">
          {cases.length === 0 ? (
            <div className="bg-muted/20 border-b-0 p-12 text-center">
              <GavelIcon className="text-muted-foreground/40 mx-auto size-8" />
              <p className="text-muted-foreground mt-3 text-sm">
                {casesTotal === 0
                  ? `${subject.name} 판례가 아직 등록되지 않았습니다.`
                  : filters.bookmarkMin > 0
                    ? "해당 별점 이상 즐겨찾기한 판례가 없습니다. 판례를 열어 하트(❤)를 매겨보세요."
                    : "필터에 해당하는 판례가 없습니다."}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                정렬 기준: {axisLabel}
              </p>
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <SortableCaseHead
                    label="★"
                    column="importance"
                    sort={filters.sort}
                    searchParams={searchParams}
                    className="w-10"
                    align="center"
                  />
                  <SortableCaseHead
                    label="전체"
                    column="overall"
                    sort={filters.sort}
                    searchParams={searchParams}
                    className="w-12"
                  />
                  {topicNodes.length > 0 ? (
                    <SortableCaseHead
                      label="주제"
                      column="topic"
                      sort={filters.sort}
                      searchParams={searchParams}
                      className="hidden w-16 md:table-cell"
                    />
                  ) : null}
                  <SortableCaseHead
                    label="법원"
                    column="court"
                    sort={filters.sort}
                    searchParams={searchParams}
                    className="hidden w-24 md:table-cell"
                  />
                  <SortableCaseHead
                    label="선고일"
                    column="decided"
                    sort={filters.sort}
                    searchParams={searchParams}
                    className="hidden w-28 md:table-cell"
                  />
                  <SortableCaseHead
                    label="사건번호"
                    column="caseNo"
                    sort={filters.sort}
                    searchParams={searchParams}
                    className="w-24 md:w-32"
                  />
                  <SortableCaseHead
                    label="전합"
                    column="enbanc"
                    sort={filters.sort}
                    searchParams={searchParams}
                    className="hidden w-14 md:table-cell"
                    align="center"
                  />
                  <SortableCaseHead
                    label="사건유형"
                    column="type"
                    sort={filters.sort}
                    searchParams={searchParams}
                    className="hidden w-28 md:table-cell"
                  />
                  <TableHead className="text-muted-foreground/70 font-mono text-[11px] font-bold tracking-[0.04em] uppercase">
                    사건명 / 기출
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <CaseRow
                    key={c.caseId}
                    subject={subject}
                    item={c}
                    topicColumn={topicNodes.length > 0}
                    topicShort={
                      c.primaryNodeId
                        ? (topicShortByNodeId.get(c.primaryNodeId) ?? null)
                        : null
                    }
                    hasDiagram={diagramSet.has(c.caseId)}
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

function CasesKpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p className="text-foreground mt-1.5 text-[26px] leading-none font-extrabold tracking-tight tabular-nums">
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

function FilterGroup<T extends string>({
  label,
  name,
  value,
  options,
  hidden,
}: {
  label: string;
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  hidden: Array<{ name: string; value: string }>;
}) {
  const selected = options.find((o) => o.value === value);
  const displayLabel = selected ? selected.label : label;
  return (
    <Form method="get" className="inline-flex">
      {hidden.map((h) => (
        <input key={h.name} type="hidden" name={h.name} value={h.value} />
      ))}
      <div className="relative inline-flex items-center">
        <select
          name={name}
          value={value}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="border-border bg-background text-foreground h-8 appearance-none rounded-full border py-0 pr-7 pl-3 text-xs font-medium focus:outline-none"
          aria-label={label}
        >
          {/* 컬럼 헤더 클릭 정렬 값(드롭다운 목록 밖) — 현재 값을 유지·표시하는 자리표시 옵션 */}
          {!options.some((o) => o.value === value) ? (
            <option value={value} hidden>
              컬럼 정렬
            </option>
          ) : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2" />
      </div>
    </Form>
  );
}

// 정렬 가능한 컬럼 헤더 — 문제 탭 SortableHead 와 동일 UX.
// 3단 순환: 비활성 → 기본방향 → 반대방향 → 해제(case_sort 제거 = 기본 정렬 복귀).
// 서버 정렬(listCasesBySubject / loader overall 재정렬)이라 GET 링크. 다른 필터·트리·검색 보존.
const CASE_HEAD_SORTS = {
  importance: { asc: "importance_asc", desc: "importance_desc", def: "desc" },
  overall: { asc: "overall_asc", desc: "overall_desc", def: "asc" },
  topic: { asc: "topic_asc", desc: "topic_desc", def: "asc" },
  court: { asc: "court_asc", desc: "court_desc", def: "asc" },
  decided: { asc: "decided_asc", desc: "decided_desc", def: "desc" },
  caseNo: { asc: "case_no", desc: "case_no_desc", def: "asc" },
  type: { asc: "type_asc", desc: "type_desc", def: "asc" },
  enbanc: { asc: "enbanc_asc", desc: "enbanc_desc", def: "desc" },
} as const;

function SortableCaseHead({
  label,
  column,
  sort,
  searchParams,
  className,
  align = "left",
}: {
  label: string;
  column: keyof typeof CASE_HEAD_SORTS;
  sort: CaseFiltersApplied["sort"];
  searchParams: URLSearchParams;
  className?: string;
  align?: "left" | "center";
}) {
  const conf = CASE_HEAD_SORTS[column];
  const dir: "asc" | "desc" | null =
    sort === conf.asc ? "asc" : sort === conf.desc ? "desc" : null;
  const active = dir !== null;
  const opp = conf.def === "asc" ? "desc" : "asc";
  const willClear = active && dir === opp;
  const sp = new URLSearchParams(searchParams);
  if (willClear) {
    sp.delete("case_sort");
  } else {
    sp.set("case_sort", active ? conf[opp] : conf[conf.def]);
  }
  return (
    <TableHead
      className={`text-muted-foreground/70 font-mono text-[11px] font-bold tracking-[0.04em] uppercase ${className ?? ""}`}
    >
      <Link
        to={`?${sp.toString()}`}
        preventScrollReset
        title={
          willClear
            ? "정렬 해제 (기본 순서)"
            : active
              ? "정렬 방향 전환"
              : "이 기준으로 정렬"
        }
        className={`hover:text-foreground inline-flex items-center gap-1 transition-colors ${
          align === "center" ? "w-full justify-center" : ""
        } ${active ? "text-foreground" : ""}`}
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

function CaseRow({
  subject,
  item,
  topicColumn = false,
  topicShort = null,
  hasDiagram = false,
}: {
  subject: LawSubjectMeta;
  item: CaseListItem;
  /** feat-2-035 — 도식 보유 여부. 학생에게는 승인분만 true(RLS). */
  hasDiagram?: boolean;
  /** 주제 배치 과목(상표 등) — 주제 컬럼 렌더 여부(과목 단위로 통일). */
  topicColumn?: boolean;
  /** 이 판례의 주제 축약 라벨("주제N"). 클릭 시 해당 주제 필터. */
  topicShort?: string | null;
}) {
  // 사건 본문 link 에 `back=` query 로 현재 목록 URL search 를 넘긴다.
  // case-viewer 의 "판례 목록으로" 가 이 값으로 원래 page·필터 페이지로 복귀.
  const location = useLocation();
  const detailHref = `/subjects/${subject.slug}/cases/${item.caseId}${
    location.search ? `?back=${encodeURIComponent(location.search)}` : ""
  }`;
  // 사건명 컬럼은 항상 case_title 만 표시 — 요지 [1] 제목/legacy summary_title 폴백을
  // 폐지(2017허4501 처럼 case_title 과 summary_title 이 서로 다른 긴 문장이라 둘 다
  // 노출되며 "사건명이 2개로 보임"). 사건명이 없는 case 라도 같은 행의 사건번호 셀이
  // 본문 진입 Link 라 사용성 손실 없음.
  // 기출 chip — 1차는 출제 문제(클릭 시 문제 뷰어로 이동), 2차는 연도 배지.
  // exam1stProblems 는 쿼리에서 연도·문항번호 오름차순 정렬됨.
  const sorted2nd = [...item.exam2ndYears].sort((a, b) => a - b);

  return (
    <TableRow className="hover:bg-muted/40 cursor-pointer">
      <TableCell className="text-center">
        {/* 중요도는 별 "개수"로 구분한다(원장 지시 2026-08-20) — 색 농도만으로는
            1·2·3 이 구분되지 않았다. 미부여(null)는 별 없음.
            기출 여부는 옆 칸의 연도 칩이 이미 보여 준다. */}
        {(item.importance ?? 0) > 0 ? (
          <span
            className="inline-flex items-center justify-center gap-px"
            aria-label={`중요도 ${item.importance}`}
            title={`중요도 ${item.importance}`}
          >
            {Array.from({ length: item.importance ?? 0 }, (_, i) => (
              <StarIcon
                key={i}
                className="size-3 fill-amber-400 text-amber-500"
              />
            ))}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-link text-xs font-semibold tabular-nums">
        {item.overallNo ?? "—"}
      </TableCell>
      {topicColumn ? (
        <TableCell className="hidden md:table-cell">
          {topicShort && item.primaryNodeId ? (
            <Link
              to={(() => {
                const sp = new URLSearchParams(location.search);
                sp.delete("case_article");
                sp.delete("case_chapter");
                sp.set("case_node", item.primaryNodeId);
                return `?${sp.toString()}`;
              })()}
              preventScrollReset
              title="이 주제로 필터"
              className="bg-primary/10 text-link hover:bg-primary/20 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
            >
              {topicShort}
            </Link>
          ) : null}
        </TableCell>
      ) : null}
      <TableCell className="hidden md:table-cell">
        <span className="text-link text-xs font-semibold">
          {COURT_LABELS[item.court]}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground hidden text-center text-xs tabular-nums md:table-cell">
        {item.decidedAt}
      </TableCell>
      <TableCell className="font-mono text-xs font-semibold">
        {/* 사건명이 비어 있는 case(예: 2018도14446) 도 본문 진입할 수 있도록 사건번호도
            Link 로 노출. 사건명 link 와 같은 detailHref 사용. */}
        <Link
          to={detailHref}
          viewTransition
          prefetch="intent"
          className="text-foreground hover:text-link"
        >
          {item.caseNumber}
        </Link>
        {/* feat-2-035 — 2차 답안 순서 도식 보유 표시. 클릭은 판례 본문에서(Sheet). */}
        {hasDiagram ? (
          <span
            title="2차 답안 순서 도식 있음 — 판례를 열면 볼 수 있습니다"
            className="border-primary/40 text-link ml-1 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 align-middle text-[10px] font-semibold"
          >
            <GitBranchIcon className="size-2.5" />
            도식
          </span>
        ) : null}
        {/* 모바일에서는 선고일 컬럼이 숨겨지므로 사건번호 아래에 날짜를 함께 노출. */}
        <span className="text-muted-foreground mt-0.5 block text-[10px] font-normal tabular-nums md:hidden">
          {item.decidedAt}
        </span>
      </TableCell>
      <TableCell className="hidden text-center md:table-cell">
        {item.isEnBanc ? (
          <span className="bg-primary/10 text-link inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold">
            전합
          </span>
        ) : null}
      </TableCell>
      <TableCell className="hidden align-top whitespace-normal md:table-cell">
        {item.caseType ? (
          <span className="border-border bg-muted/50 text-muted-foreground inline-block max-w-full rounded-full border px-2 py-0.5 text-[11px] font-medium break-words">
            {item.caseType}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-normal">
        {item.nickname ? (
          // 별칭이 문장형으로 길 수 있어 truncate 대신 줄바꿈 허용 — 잘림 없이 전체 표시.
          <span className="mb-0.5 inline-block max-w-full rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold break-words whitespace-normal text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {item.nickname}
          </span>
        ) : null}
        <Link
          to={detailHref}
          viewTransition
          prefetch="intent"
          className="hover:text-link block text-sm font-medium break-words"
        >
          {item.caseTitle}
        </Link>
        {item.exam1stProblems.length +
          item.exam1stExtraYears.length +
          sorted2nd.length >
        0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {mergeFirstRoundChips(
              item.exam1stProblems,
              item.exam1stExtraYears,
            )}
            {merge2ndRoundChips(
              sorted2nd,
              item.exam2ndProblems ?? [],
              item.exam2ndMainYears ?? [],
            )}
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
