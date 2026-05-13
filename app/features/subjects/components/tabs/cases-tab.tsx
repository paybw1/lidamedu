import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GavelIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import { COURT_LABELS, type CaseListItem } from "~/features/cases/labels";
import { ExamYearChip } from "~/features/cases/components/exam-year-chip";
import type {
  ArticleNode,
  SystematicNode,
} from "~/features/laws/queries.server";

import type {
  CaseFiltersApplied,
  CaseTreeCounts,
} from "../../lib/loader.server";
import { SortAxisToggle, useSortAxis } from "../sort-axis";
import { CasesTree } from "../cases-tree";
import type { LawSubjectMeta } from "../../lib/subjects";

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

const DEFAULT_FILTERS: CaseFiltersApplied = {
  q: "",
  court: "all",
  exam: "any",
  sort: "decided_desc",
  page: 1,
  pageSize: 50,
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
  // 트리 필터 해제 href — case_* / case_page 만 제거.
  const clearTreeHref = useMemo(() => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("case_article");
    sp.delete("case_chapter");
    sp.delete("case_node");
    sp.delete("case_page");
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
    (c) => c.exam1stYears.length + c.exam2ndYears.length > 0,
  ).length;

  const totalPages = Math.max(1, Math.ceil(casesTotal / filters.pageSize));

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
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <Card className="py-4">
          <CardHeader className="px-4 pb-3">
            <div className="flex items-center justify-end gap-2">
              <SortAxisToggle
                size="sm"
                disabledAxes={systematicEmpty ? ["systematic"] : undefined}
              />
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <CasesTree
              axis={axis}
              articles={articles}
              systematicNodes={systematicNodes}
              caseTreeCounts={caseTreeCounts}
              active={treeFilter}
            />
          </CardContent>
        </Card>
      </aside>

      <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="전체 판례" value={String(casesTotal)} hint="모든 필터 무시" />
        <KpiCard
          label="중요 판례"
          value={String(importantCount)}
          hint="현재 페이지 ★3 이상"
        />
        <KpiCard
          label="기출 보유"
          value={String(examCount)}
          hint="현재 페이지 1·2차 기출 표시"
        />
      </div>

      {treeFilter ? (
        <div className="bg-accent/40 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs">
          <GavelIcon className="text-primary size-3.5" />
          <span className="text-muted-foreground">트리 필터:</span>
          <Badge variant="secondary" className="max-w-[260px] truncate">
            {treeFilterLabel}
          </Badge>
          <Button asChild variant="ghost" size="sm" className="h-6 px-2">
            <Link to={clearTreeHref} preventScrollReset>
              <XIcon className="size-3" /> 전체 보기
            </Link>
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader className="space-y-3">
          <Form method="get" className="flex items-center gap-2">
            {hidden.map((h) => (
              <input key={h.name} type="hidden" name={h.name} value={h.value} />
            ))}
            <div className="relative flex-1">
              <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                type="search"
                name="q"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="사건번호·사건명·사건유형·요지·이유 검색"
                className="pl-9"
                disabled={isLoading}
              />
              {draft ? (
                <button
                  type="button"
                  onClick={() => setDraft("")}
                  aria-label="검색어 지우기"
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                >
                  <XIcon className="size-4" />
                </button>
              ) : null}
            </div>
            <Button type="submit" size="sm" disabled={isLoading}>
              검색
            </Button>
          </Form>
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontalIcon className="text-muted-foreground size-4" />
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
              {filters.q ? `"${filters.q}" · ` : ""}
              {casesTotal}건 · 페이지 {filters.page}/{totalPages}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <div className="bg-muted/40 rounded-md border border-dashed p-8 text-center">
              <GavelIcon className="text-muted-foreground mx-auto size-8" />
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
                <TableRow>
                  <TableHead className="w-12 text-center">★</TableHead>
                  <TableHead className="w-24">법원</TableHead>
                  <TableHead className="w-28">선고일</TableHead>
                  <TableHead className="w-32">사건번호</TableHead>
                  <TableHead className="w-32">사건유형</TableHead>
                  <TableHead>사건명 / 기출</TableHead>
                  <TableHead className="w-14 text-center">전합</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <CaseRow key={c.caseId} subject={subject} item={c} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {totalPages > 1 ? (
          <CardContent className="border-t pt-3">
            <Pagination filters={filters} totalPages={totalPages} tab={tabParam} />
          </CardContent>
        ) : null}
      </Card>
      </section>
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
  return (
    <Form method="get" className="inline-flex items-center gap-1">
      {hidden.map((h) => (
        <input key={h.name} type="hidden" name={h.name} value={h.value} />
      ))}
      <span className="text-muted-foreground text-xs">{label}</span>
      <select
        name={name}
        value={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="border-input bg-background h-7 rounded-md border px-2 text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Form>
  );
}

function Pagination({
  filters,
  totalPages,
  tab,
}: {
  filters: CaseFiltersApplied;
  totalPages: number;
  tab: string;
}) {
  const make = (page: number) => {
    const sp = new URLSearchParams();
    if (tab) sp.set("tab", tab);
    if (filters.q) sp.set("q", filters.q);
    if (filters.court !== "all") sp.set("case_court", filters.court);
    if (filters.exam !== "any") sp.set("case_exam", filters.exam);
    if (filters.sort !== "decided_desc") sp.set("case_sort", filters.sort);
    if (filters.tree?.kind === "article")
      sp.set("case_article", filters.tree.articleId);
    else if (filters.tree?.kind === "chapter")
      sp.set("case_chapter", filters.tree.chapterId);
    else if (filters.tree?.kind === "node")
      sp.set("case_node", filters.tree.nodeId);
    if (page !== 1) sp.set("case_page", String(page));
    return `?${sp.toString()}`;
  };
  const prev = filters.page > 1 ? filters.page - 1 : null;
  const next = filters.page < totalPages ? filters.page + 1 : null;
  return (
    <div className="flex items-center justify-center gap-2 text-xs">
      <Button
        asChild={prev != null}
        variant="outline"
        size="sm"
        disabled={prev == null}
        className="h-7"
      >
        {prev != null ? (
          <Link to={make(prev)} preventScrollReset>
            <ChevronLeftIcon className="size-3" /> 이전
          </Link>
        ) : (
          <span>
            <ChevronLeftIcon className="size-3" /> 이전
          </span>
        )}
      </Button>
      <span className="text-muted-foreground tabular-nums">
        {filters.page} / {totalPages}
      </span>
      <Button
        asChild={next != null}
        variant="outline"
        size="sm"
        disabled={next == null}
        className="h-7"
      >
        {next != null ? (
          <Link to={make(next)} preventScrollReset>
            다음 <ChevronRightIcon className="size-3" />
          </Link>
        ) : (
          <span>
            다음 <ChevronRightIcon className="size-3" />
          </span>
        )}
      </Button>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}

function CaseRow({
  subject,
  item,
}: {
  subject: LawSubjectMeta;
  item: CaseListItem;
}) {
  // 사건명 컬럼 표시 우선순위: 요지 [1] 제목 → legacy summary_title → case_title (사건유형).
  const detailLabel =
    item.summaryFirstTitle ?? item.summaryTitle ?? item.caseTitle;
  // subLabel 은 case_title 보조 노출. detailLabel 과 같거나(=요지가 없어 fallback 된 경우)
  // 옆 caseType 컬럼과 같으면(=운영자가 같은 텍스트 입력한 흔한 경우) 중복이라 hide.
  const caseTitleTrim = item.caseTitle.trim();
  const detailTrim = detailLabel.trim();
  const caseTypeTrim = (item.caseType ?? "").trim();
  const subLabel =
    (item.summaryFirstTitle || item.summaryTitle) &&
    caseTitleTrim !== "" &&
    caseTitleTrim !== detailTrim &&
    caseTitleTrim !== caseTypeTrim
      ? item.caseTitle
      : null;
  // 기출 chip — 1차/2차 구분. 각 그룹 안에서 연도 오름차순.
  const sorted1st = [...item.exam1stYears].sort((a, b) => a - b);
  const sorted2nd = [...item.exam2ndYears].sort((a, b) => a - b);
  return (
    <TableRow>
      <TableCell className="text-center">
        {item.importance >= 3 ? (
          <StarIcon className="mx-auto size-4 text-amber-500" />
        ) : null}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {COURT_LABELS[item.court]}
      </TableCell>
      <TableCell className="text-xs tabular-nums">{item.decidedAt}</TableCell>
      <TableCell className="font-mono text-xs">{item.caseNumber}</TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {item.caseType ?? ""}
      </TableCell>
      <TableCell>
        <Link
          to={`/subjects/${subject.slug}/cases/${item.caseId}`}
          viewTransition
          className="hover:text-primary block truncate text-sm font-medium"
        >
          {detailLabel}
        </Link>
        {subLabel ? (
          <p className="text-muted-foreground truncate text-xs">{subLabel}</p>
        ) : null}
        {sorted1st.length + sorted2nd.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {sorted1st.map((y) => (
              <ExamYearChip
                key={`1-${y}`}
                subjectSlug={subject.slug}
                round="first"
                year={y}
                caseId={item.caseId}
              />
            ))}
            {sorted2nd.map((y) => (
              <ExamYearChip
                key={`2-${y}`}
                subjectSlug={subject.slug}
                round="second"
                year={y}
                caseId={item.caseId}
              />
            ))}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-center text-xs">
        {item.isEnBanc ? "○" : ""}
      </TableCell>
    </TableRow>
  );
}
