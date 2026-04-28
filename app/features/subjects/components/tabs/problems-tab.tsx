import { CircleCheckIcon, ListChecksIcon, PencilIcon } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
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
  type ProblemListItem,
} from "~/features/problems/labels";

import { EXAM_LABEL, type LawSubjectMeta } from "../../lib/subjects";

export function ProblemsTab({
  subject,
  problems,
}: {
  subject: LawSubjectMeta;
  problems: ProblemListItem[];
}) {
  const firstRound = problems.filter((p) => p.examRound === "first");
  const secondRound = problems.filter((p) => p.examRound === "second");

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
          value="0"
          hint="feat-4-A-307 (Runner 미구현)"
        />
        <KpiCard
          label="정답률"
          value="—"
          hint="feat-4-A-312 (Runner 미구현)"
        />
      </div>

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
                {subject.name} 1차 객관식 문제가 아직 등록되지 않았습니다.
              </p>
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
                  <TableHead>본문</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {firstRound.map((p) => (
                  <ProblemRow key={p.problemId} subject={subject} item={p} />
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
}: {
  subject: LawSubjectMeta;
  item: ProblemListItem;
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
        <Link
          to={`/subjects/${subject.slug}/problems/${item.problemId}`}
          viewTransition
          className="hover:text-primary block truncate text-sm"
        >
          {item.bodyMd.length > 80
            ? `${item.bodyMd.slice(0, 80)}…`
            : item.bodyMd}
        </Link>
      </TableCell>
    </TableRow>
  );
}
