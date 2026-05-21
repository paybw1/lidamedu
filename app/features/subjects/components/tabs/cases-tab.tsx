import type {
  CaseFiltersApplied,
  CaseTreeCounts,
} from "../../lib/loader.server";
import type { LawSubjectMeta } from "../../lib/subjects";

import {
  ChevronDownIcon,
  GavelIcon,
  SearchIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Form,
  Link,
  useLocation,
  useNavigation,
  useSearchParams,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
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
  ExamYearChip,
} from "~/features/cases/components/exam-year-chip";
import { COURT_LABELS, type CaseListItem } from "~/features/cases/labels";
import type {
  ArticleNode,
  SystematicNode,
} from "~/features/laws/queries.server";

import { CasesTree } from "../cases-tree";
import { SortAxisToggle, useSortAxis } from "../sort-axis";

const COURT_OPTIONS = [
  { value: "all", label: "전체 법원" },
  { value: "supreme", label: "대법원" },
  { value: "patent_court", label: "특허법원" },
  { value: "high_court", label: "고등법원" },
  { value: "district_court", label: "지방법원" },
] as const;

const EXAM_OPTIONS = [
  { value: "any", label: "전체" },
  { value: "exam_1st", label: "1차 기출" },
  { value: "exam_2nd", label: "2차 기출" },
  { value: "exam_both", label: "1·2차 모두" },
] as const;

const SORT_OPTIONS = [
  { value: "decided_desc", label: "선고일 ↓" },
  { value: "decided_asc", label: "선고일 ↑" },
  { value: "case_no", label: "사건번호" },
] as const;

// case_title vs summary_title 가 동일 내용인지 — 공백·일반 구두점 차이를 흡수해 비교.
// 둘 중 하나가 다른 것을 포함하면 (prefix/suffix 차이) 같은 내용으로 본다.
function sameLabelContent(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.replace(/[\s:.,;'"()[\]{}·…\-—–]/g, "").toLowerCase();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

const DEFAULT_FILTERS: CaseFiltersApplied = {
  q: "",
  court: "all",
  exam: "any",
  sort: "decided_desc",
};

export function CasesTab({
  subject,
  cases,
  casesTotal,
  caseFilters,
  initialQuery,
  articles,
  systematicNodes,
  caseTreeCounts,
}: {
  subject: LawSubjectMeta;
  cases: CaseListItem[];
  casesTotal: number;
  caseFilters?: CaseFiltersApplied;
  initialQuery: string;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  caseTreeCounts: CaseTreeCounts;
}) {
  const filters = caseFilters ?? { ...DEFAULT_FILTERS, q: initialQuery };
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const { axis } = useSortAxis();
  const axisLabel = axis === "systematic" ? "테크 트리" : "조문";
  const treeFilter = filters.tree ?? null;
  const systematicEmpty = systematicNodes.length === 0;
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
  const importantCount = cases.filter((c) => c.importance >= 3).length;
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

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Left: tree panel — sticky 사이드바 + 트리 내부 스크롤 (긴 판례 표와 무관하게 항상 접근) */}
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
        <div className="border-border bg-muted/30 overflow-hidden rounded-xl border">
          <div className="border-border flex items-center justify-end border-b px-4 py-3">
            <SortAxisToggle
              size="sm"
              disabledAxes={systematicEmpty ? ["systematic"] : undefined}
            />
          </div>
          <div className="p-2">
            <CasesTree
              axis={axis}
              articles={articles}
              systematicNodes={systematicNodes}
              caseTreeCounts={caseTreeCounts}
              active={treeFilter}
            />
          </div>
        </div>
      </aside>

      {/* Right: KPIs + filter + table */}
      <section className="space-y-4">
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

        {/* Tree filter active banner — 검색어 동시 적용 시 결과 카운트가 트리 카운트와
            달라지는 혼란을 해소하기 위해 q 와 결과 건수를 함께 노출 + 검색어 단독 해제. */}
        {treeFilter ? (
          <div className="border-border bg-primary/[0.04] flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-xs">
            <GavelIcon className="text-primary size-3.5" />
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
                  : "필터에 해당하는 판례가 없습니다."}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                정렬 기준: {axisLabel}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-muted-foreground/70 w-10 text-center font-mono text-[11px] font-bold tracking-[0.04em] uppercase">
                    ★
                  </TableHead>
                  <TableHead className="text-muted-foreground/70 w-24 font-mono text-[11px] font-bold tracking-[0.04em] uppercase">
                    법원
                  </TableHead>
                  <TableHead className="text-muted-foreground/70 w-28 font-mono text-[11px] font-bold tracking-[0.04em] uppercase">
                    선고일
                  </TableHead>
                  <TableHead className="text-muted-foreground/70 w-32 font-mono text-[11px] font-bold tracking-[0.04em] uppercase">
                    사건번호
                  </TableHead>
                  <TableHead className="text-muted-foreground/70 w-28 font-mono text-[11px] font-bold tracking-[0.04em] uppercase">
                    사건유형
                  </TableHead>
                  <TableHead className="text-muted-foreground/70 font-mono text-[11px] font-bold tracking-[0.04em] uppercase">
                    사건명 / 기출
                  </TableHead>
                  <TableHead className="text-muted-foreground/70 w-14 text-center font-mono text-[11px] font-bold tracking-[0.04em] uppercase">
                    전합
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <CaseRow key={c.caseId} subject={subject} item={c} />
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

function CaseRow({
  subject,
  item,
}: {
  subject: LawSubjectMeta;
  item: CaseListItem;
}) {
  // 사건 본문 link 에 `back=` query 로 현재 목록 URL search 를 넘긴다.
  // case-viewer 의 "판례 목록으로" 가 이 값으로 원래 page·필터 페이지로 복귀.
  const location = useLocation();
  const detailHref = `/subjects/${subject.slug}/cases/${item.caseId}${
    location.search ? `?back=${encodeURIComponent(location.search)}` : ""
  }`;
  // 사건명 컬럼 표시 우선순위: 요지 [1] 제목 → legacy summary_title → case_title (사건유형).
  const detailLabel =
    item.summaryFirstTitle ?? item.summaryTitle ?? item.caseTitle;
  const caseTitleTrim = item.caseTitle.trim();
  const detailTrim = detailLabel.trim();
  const caseTypeTrim = (item.caseType ?? "").trim();
  // case_title 과 summary_*_title 이 사실상 같은 내용인데 미세한 구두점/공백 차이
  // ("(실시제품 마법천자문)" vs "(실시제품: 마법천자문)", 끝 ":" 유무 등) 로 정확
  // 일치 비교가 어긋나 sub-label 에 caseTitle 이 또 표시되던 문제.
  // 공백·일반 구두점 제거 후 normalize 비교 + substring 포함 관계도 같은 내용으로 본다.
  const subLabel =
    (item.summaryFirstTitle || item.summaryTitle) &&
    caseTitleTrim !== "" &&
    !sameLabelContent(caseTitleTrim, detailTrim) &&
    caseTitleTrim !== caseTypeTrim
      ? item.caseTitle
      : null;
  // 기출 chip — 1차는 출제 문제(클릭 시 문제 뷰어로 이동), 2차는 연도 배지.
  // exam1stProblems 는 쿼리에서 연도·문항번호 오름차순 정렬됨.
  const sorted2nd = [...item.exam2ndYears].sort((a, b) => a - b);

  return (
    <TableRow className="hover:bg-muted/40 cursor-pointer">
      <TableCell className="text-center">
        {item.importance >= 3 ? (
          <StarIcon className="mx-auto size-3.5 text-amber-500" />
        ) : null}
      </TableCell>
      <TableCell>
        <span className="text-primary text-xs font-semibold">
          {COURT_LABELS[item.court]}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground text-center text-xs tabular-nums">
        {item.decidedAt}
      </TableCell>
      <TableCell className="text-foreground font-mono text-xs font-semibold">
        {item.caseNumber}
      </TableCell>
      <TableCell>
        {item.caseType ? (
          <span className="border-border bg-muted/50 text-muted-foreground inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium">
            {item.caseType}
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        {item.nickname ? (
          <span className="mb-0.5 inline-flex max-w-full items-center truncate rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {item.nickname}
          </span>
        ) : null}
        <Link
          to={detailHref}
          viewTransition
          className="hover:text-primary block truncate text-sm font-medium"
        >
          {detailLabel}
        </Link>
        {subLabel ? (
          <p className="text-muted-foreground truncate text-xs">{subLabel}</p>
        ) : null}
        {item.exam1stProblems.length + sorted2nd.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {Array.from(
              new Map(
                item.exam1stProblems.map((p) => [p.year, p]),
              ).values(),
            )
              .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
              .map((p) => (
                <ExamProblemChip
                  key={p.problemId}
                  lawCode={p.lawCode}
                  problemId={p.problemId}
                  year={p.year}
                />
              ))}
            {sorted2nd.map((y) => (
              <ExamYearChip key={`2-${y}`} round="second" year={y} />
            ))}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-center">
        {item.isEnBanc ? (
          <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold">
            전합
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
