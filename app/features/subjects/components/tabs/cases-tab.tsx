import { GavelIcon, SearchIcon, SlidersHorizontalIcon, StarIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
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

import { useSortAxis } from "../sort-axis";
import type { LawSubjectMeta } from "../../lib/subjects";

type CaseFilter = "all" | "important" | "en_banc" | "supreme";

const FILTERS: { value: CaseFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "important", label: "중요" },
  { value: "en_banc", label: "전원합의체" },
  { value: "supreme", label: "대법원" },
];

function applyFilter(items: CaseListItem[], filter: CaseFilter): CaseListItem[] {
  switch (filter) {
    case "important":
      return items.filter((c) => c.importance >= 3);
    case "en_banc":
      return items.filter((c) => c.isEnBanc);
    case "supreme":
      return items.filter((c) => c.court === "supreme");
    default:
      return items;
  }
}

export function CasesTab({
  subject,
  cases,
  initialQuery,
}: {
  subject: LawSubjectMeta;
  cases: CaseListItem[];
  initialQuery: string;
}) {
  const { axis } = useSortAxis();
  const axisLabel = axis === "systematic" ? "체계도" : "조문 순서";
  const [filter, setFilter] = useState<CaseFilter>("all");
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const [draft, setDraft] = useState(initialQuery);
  const isSearching =
    navigation.state !== "idle" &&
    navigation.location?.search.includes("q=");

  const filtered = useMemo(() => applyFilter(cases, filter), [cases, filter]);

  const totalCount = cases.length;
  const importantCount = cases.filter((c) => c.importance >= 3).length;
  const tabParam = searchParams.get("tab") ?? "";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="전체 판례" value={String(totalCount)} hint="feat-4-A-202" />
        <KpiCard label="내가 본 판례" value="0" hint="feat-4-A-202 (열람 추적 미구현)" />
        <KpiCard label="중요 판례" value={String(importantCount)} hint="중요도 ★3" />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <Form method="get" className="flex items-center gap-2">
            {tabParam ? (
              <input type="hidden" name="tab" value={tabParam} />
            ) : null}
            <div className="relative flex-1">
              <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                type="search"
                name="q"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="사건번호·사건명·요지·이유 검색"
                className="pl-9"
                disabled={isSearching}
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
          </Form>
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontalIcon className="text-muted-foreground size-4" />
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
              >
                <Badge
                  variant={filter === f.value ? "default" : "outline"}
                  className="cursor-pointer"
                >
                  {f.label}
                </Badge>
              </button>
            ))}
            {initialQuery ? (
              <span className="text-muted-foreground ml-auto text-xs">
                "{initialQuery}" 검색 결과 {totalCount}건
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="bg-muted/40 rounded-md border border-dashed p-8 text-center">
              <GavelIcon className="text-muted-foreground mx-auto size-8" />
              <p className="text-muted-foreground mt-3 text-sm">
                {totalCount === 0
                  ? `${subject.name} 판례가 아직 등록되지 않았습니다.`
                  : "필터에 해당하는 판례가 없습니다."}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                정렬 기준: {axisLabel} (현재는 선고일 정렬)
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">중요</TableHead>
                  <TableHead className="w-24">법원</TableHead>
                  <TableHead className="w-28">선고일</TableHead>
                  <TableHead className="w-32">사건번호</TableHead>
                  <TableHead>사건명</TableHead>
                  <TableHead className="w-20 text-center">전합</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <CaseRow key={c.caseId} subject={subject} item={c} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
  return (
    <TableRow className="cursor-pointer">
      <TableCell>
        {item.importance >= 3 ? (
          <StarIcon className="size-4 text-amber-500" />
        ) : null}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {COURT_LABELS[item.court]}
      </TableCell>
      <TableCell className="text-xs tabular-nums">{item.decidedAt}</TableCell>
      <TableCell className="font-mono text-xs">{item.caseNumber}</TableCell>
      <TableCell>
        <Link
          to={`/subjects/${subject.slug}/cases/${item.caseId}`}
          viewTransition
          className="hover:text-primary block truncate text-sm font-medium"
        >
          {item.summaryTitle ?? item.caseTitle}
        </Link>
        {item.summaryTitle ? (
          <p className="text-muted-foreground truncate text-xs">
            {item.caseTitle}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-center text-xs">
        {item.isEnBanc ? "○" : ""}
      </TableCell>
    </TableRow>
  );
}
