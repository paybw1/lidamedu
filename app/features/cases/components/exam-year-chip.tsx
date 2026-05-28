// 판례 기출 칩.
// ExamProblemChip — 이 판례가 출제된 1차 객관식 기출문제 칩. 클릭 시 문제 뷰어로 이동 (feat-8-024).
// ExamYearChip — 2차 기출 연도 배지. feat-8-024 이후 비-링크 (판례→문제 매칭 화면 제거).
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { cn } from "~/core/lib/utils";
import type { ExamProblemRef } from "~/features/problems/labels";

export type ExamRound = "first" | "second";

export function ExamProblemChip({
  lawCode,
  problemId,
  year,
}: {
  lawCode: string;
  problemId: string;
  year: number | null;
}) {
  const label = year ? `1차 ${year}` : "1차";
  return (
    <Link
      to={`/subjects/${lawCode}/problems/${problemId}`}
      viewTransition
      title={`${label} 기출문제로 이동`}
    >
      <Badge
        variant="outline"
        className={cn(
          "cursor-pointer text-[10px] transition-colors",
          "border-sky-300 text-sky-700 hover:bg-sky-50",
          "dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/40",
        )}
      >
        {label}
      </Badge>
    </Link>
  );
}

// 1차 기출 칩을 연도 오름차순으로 통합 렌더 — problem link 있는 연도는
// 클릭 가능한 ExamProblemChip, link 없는 운영자 수동 연도는 ExamYearChip
// (round="first"). 같은 연도에 problem 이 여러 개 있어도 사건명 셀 폭을 위해
// 연도당 1개로 dedup(첫 problem 선택).
export function mergeFirstRoundChips(
  examProblems: ExamProblemRef[],
  extraYears: number[],
): ReactNode[] {
  const problemByYear = new Map<number, ExamProblemRef>();
  for (const p of examProblems) {
    if (p.year === null || p.year === undefined) continue;
    if (!problemByYear.has(p.year)) problemByYear.set(p.year, p);
  }
  const allYears = new Set<number>([...problemByYear.keys(), ...extraYears]);
  return [...allYears]
    .sort((a, b) => a - b)
    .map((y) => {
      const p = problemByYear.get(y);
      return p ? (
        <ExamProblemChip
          key={`1p-${y}`}
          lawCode={p.lawCode}
          problemId={p.problemId}
          year={p.year}
        />
      ) : (
        <ExamYearChip key={`1y-${y}`} round="first" year={y} />
      );
    });
}

export function ExamYearChip({
  round,
  year,
}: {
  round: ExamRound;
  year: number;
}) {
  const label = `${round === "first" ? "1차" : "2차"} ${year}`;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px]",
        round === "first"
          ? "border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-300"
          : "border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-300",
      )}
    >
      {label}
    </Badge>
  );
}
