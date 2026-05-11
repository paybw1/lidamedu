import {
  ArrowRightIcon,
  CheckSquareIcon,
  CircleCheckIcon,
  FilterXIcon,
  FolderTreeIcon,
  ListChecksIcon,
  NotebookPenIcon,
  PencilIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { Form, Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  type ProblemFormat,
  type ProblemListItem,
  type ProblemOrigin,
  type ProblemPolarity,
  type ProblemScope,
} from "~/features/problems/labels";
import type { ProblemFiltersApplied } from "../../lib/loader.server";
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_TONE,
  type DifficultyBucket,
  type ProblemAggregateStats,
} from "~/features/study/lib/difficulty";
import type { UserProblemStats } from "~/features/study/queries.server";
import { cn } from "~/core/lib/utils";

import { EXAM_LABEL, type LawSubjectMeta } from "../../lib/subjects";

const ORIGIN_OPTS: ProblemOrigin[] = [
  "past_exam",
  "past_exam_variant",
  "mock",
  "expected",
];
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
const SORT_OPTS = [
  { value: "number", label: "기본 (문항순)" },
  { value: "hardest", label: "어려움 순" },
  { value: "easiest", label: "쉬움 순" },
  { value: "newest", label: "최신순" },
] as const;

export function ProblemsTab({
  subject,
  problems,
  availableYears,
  appliedFilters,
  stats,
  aggStats,
}: {
  subject: LawSubjectMeta;
  problems: ProblemListItem[];
  availableYears: number[];
  appliedFilters: ProblemFiltersApplied;
  stats: UserProblemStats | null;
  aggStats: Record<string, ProblemAggregateStats>;
}) {
  const firstRound = problems.filter((p) => p.examRound === "first");
  const secondRound = problems.filter((p) => p.examRound === "second");
  const filterActive =
    appliedFilters.origin != null ||
    appliedFilters.year != null ||
    appliedFilters.format != null ||
    appliedFilters.polarity != null ||
    appliedFilters.scope != null ||
    appliedFilters.difficulty != null ||
    (appliedFilters.sort != null && appliedFilters.sort !== "number") ||
    (appliedFilters.search != null && appliedFilters.search.length > 0);

  const attemptedCount = stats?.attemptedCount ?? 0;
  const correctCount = stats?.correctCount ?? 0;
  const wrongCount = stats?.wrongCount ?? 0;
  const accuracyPct =
    attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="출제 문항"
          value={String(problems.length)}
          hint="현재 등록된 전체"
        />
        <KpiCard
          label="내 풀이"
          value={String(attemptedCount)}
          hint={`전체 시도 ${stats?.totalAttempts ?? 0}회`}
        />
        <KpiCard
          label="정답률"
          value={accuracyPct === null ? "—" : `${accuracyPct}%`}
          hint={
            attemptedCount > 0
              ? `정답 ${correctCount} · 오답 ${wrongCount}`
              : "한 문제도 풀지 않았습니다"
          }
        />
      </div>

      {wrongCount > 0 ? (
        <Card className="border-amber-300/60 bg-amber-50/50 dark:border-amber-700/40 dark:bg-amber-950/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <NotebookPenIcon className="size-5 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <p className="text-sm font-semibold">오답노트</p>
                <p className="text-muted-foreground text-xs">
                  마지막 시도가 오답인 문제 {wrongCount}건이 있습니다.
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link
                to={`/study/wrong-note?subject=${subject.slug}`}
                viewTransition
              >
                다시 풀기 <ArrowRightIcon className="size-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {firstRound.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="border-primary/40 bg-primary/[0.03]">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <FolderTreeIcon className="text-primary size-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">체계별 풀이</p>
                  <p className="text-muted-foreground text-xs">
                    체계도 영역 → 순서대로 풀이 + 진도 기록
                  </p>
                </div>
              </div>
              <Button asChild size="sm" className="h-8">
                <Link
                  to={`/subjects/${subject.slug}/problems/system`}
                  viewTransition
                >
                  시작 <ArrowRightIcon className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-primary/40 bg-primary/[0.03]">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontalIcon className="text-primary size-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">맞춤 퀴즈</p>
                  <p className="text-muted-foreground text-xs">
                    유형/연도/극성으로 N문제 묶음 · 시험 모드 가능
                  </p>
                </div>
              </div>
              <Button asChild size="sm" className="h-8" variant="outline">
                <Link
                  to={`/subjects/${subject.slug}/quiz/setup`}
                  viewTransition
                >
                  설정 <ArrowRightIcon className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-primary/40 bg-primary/[0.03]">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckSquareIcon className="text-primary size-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">정오문제 무작위</p>
                  <p className="text-muted-foreground text-xs">
                    객관식 OX 가능 지문 통합 · 무작위 순
                  </p>
                </div>
              </div>
              <Button asChild size="sm" className="h-8" variant="outline">
                <Link to={`/subjects/${subject.slug}/ox`} viewTransition>
                  시작 <ArrowRightIcon className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="problems" />
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground tracking-wide">본문 검색</span>
          <input
            type="text"
            name="p_search"
            defaultValue={appliedFilters.search ?? ""}
            placeholder="키워드"
            maxLength={100}
            data-testid="problem-search"
            className="border-input bg-background h-8 w-40 rounded-md border px-2 text-xs"
          />
        </label>
        <FilterSelect
          label="출처"
          name="p_origin"
          value={appliedFilters.origin ?? ""}
          options={ORIGIN_OPTS.map((o) => ({ value: o, label: ORIGIN_LABEL[o] }))}
        />
        <FilterSelect
          label="연도"
          name="p_year"
          value={appliedFilters.year != null ? String(appliedFilters.year) : ""}
          options={availableYears.map((y) => ({
            value: String(y),
            label: `${y}년`,
          }))}
        />
        <FilterSelect
          label="시험"
          name="p_round"
          value={appliedFilters.examRound ?? ""}
          options={[
            { value: "first", label: "1차" },
            { value: "second", label: "2차" },
          ]}
        />
        <FilterSelect
          label="유형"
          name="p_format"
          value={appliedFilters.format ?? ""}
          options={FORMAT_OPTS.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))}
        />
        <FilterSelect
          label="극성"
          name="p_polarity"
          value={appliedFilters.polarity ?? ""}
          options={POLARITY_OPTS.map((p) => ({
            value: p,
            label: POLARITY_LABEL[p],
          }))}
        />
        <FilterSelect
          label="범위"
          name="p_scope"
          value={appliedFilters.scope ?? ""}
          options={SCOPE_OPTS.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))}
        />
        <FilterSelect
          label="난이도"
          name="p_difficulty"
          value={appliedFilters.difficulty ?? ""}
          options={DIFFICULTY_OPTS.map((d) => ({
            value: d.value,
            label: d.label,
          }))}
        />
        <FilterSelect
          label="정렬"
          name="p_sort"
          value={appliedFilters.sort ?? ""}
          options={SORT_OPTS.filter((s) => s.value !== "number").map((s) => ({
            value: s.value,
            label: s.label,
          }))}
        />
        <Button type="submit" size="sm" className="h-8">
          적용
        </Button>
        {filterActive ? (
          <Button asChild type="button" size="sm" variant="ghost" className="h-8">
            <Link to={`/subjects/${subject.slug}?tab=problems`}>
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        ) : null}
      </Form>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CircleCheckIcon className="text-primary size-5" />
              <h3 className="text-base font-semibold">
                1차 객관식 ({EXAM_LABEL[subject.exam]})
              </h3>
            </div>
            <Badge variant="outline">{firstRound.length}건</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {firstRound.length === 0 ? (
            <div className="bg-muted/40 rounded-md border border-dashed p-8 text-center">
              <ListChecksIcon className="text-muted-foreground mx-auto size-8" />
              <p className="text-muted-foreground mt-3 text-sm">
                {filterActive
                  ? "필터 조건에 해당하는 문제가 없습니다."
                  : `${subject.name} 1차 객관식 문제가 아직 등록되지 않았습니다.`}
              </p>
              {filterActive ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="mt-3 h-8"
                >
                  <Link to={`/subjects/${subject.slug}?tab=problems`}>
                    <FilterXIcon className="size-3.5" /> 필터 초기화
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">No.</TableHead>
                  <TableHead className="w-20">출처</TableHead>
                  <TableHead className="w-20">유형</TableHead>
                  <TableHead className="w-20">극성</TableHead>
                  <TableHead className="w-24">연도/회차</TableHead>
                  <TableHead className="w-28">난이도</TableHead>
                  <TableHead>본문</TableHead>
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
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {subject.exam !== "first" ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PencilIcon className="text-primary size-5" />
                <h3 className="text-base font-semibold">2차 주관식</h3>
              </div>
              <Badge variant="outline">{secondRound.length}건</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/40 rounded-md border border-dashed p-8 text-center">
              <p className="text-muted-foreground text-sm">
                2차 주관식은 추후 도입 (feat-4-A-320~339).
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function FilterSelect({
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
    <label className="flex flex-col gap-0.5 text-xs">
      <span className="text-muted-foreground tracking-wide">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="border-input bg-background h-8 rounded-md border px-2 text-xs"
      >
        <option value="">전체</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
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

function ProblemRow({
  subject,
  item,
  agg,
  searchQuery,
}: {
  subject: LawSubjectMeta;
  item: ProblemListItem;
  agg: ProblemAggregateStats | undefined;
  searchQuery: string | null;
}) {
  const yearLabel =
    item.year && item.examRoundNo
      ? `${item.year}년 ${item.examRoundNo}회`
      : item.year
        ? String(item.year)
        : "—";

  return (
    <TableRow className="cursor-pointer">
      <TableCell className="text-xs tabular-nums">
        {item.problemNumber ?? "—"}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="text-xs">
          {ORIGIN_LABEL[item.origin]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {FORMAT_LABEL[item.format]}
        </Badge>
      </TableCell>
      <TableCell className="text-xs">
        {item.polarity ? POLARITY_LABEL[item.polarity] : "—"}
      </TableCell>
      <TableCell className="text-xs tabular-nums">{yearLabel}</TableCell>
      <TableCell>
        <DifficultyCell agg={agg} />
      </TableCell>
      <TableCell>
        <Link
          to={`/subjects/${subject.slug}/problems/${item.problemId}`}
          viewTransition
          className="hover:text-primary block truncate text-sm"
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
    // 매치 없음 (필터를 통과했지만 표시 텍스트엔 없을 수도) — 기본 truncate.
    return body.length > 80 ? `${body.slice(0, 80)}…` : body;
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(body.length, idx + q.length + 40);
  const before = (start > 0 ? "…" : "") + body.slice(start, idx);
  const match = body.slice(idx, idx + q.length);
  const after = body.slice(idx + q.length, end) + (end < body.length ? "…" : "");
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
