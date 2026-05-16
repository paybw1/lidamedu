// 판례 기출 칩.
// ExamProblemChip — 이 판례가 출제된 1차 객관식 기출문제 칩. 클릭 시 문제 뷰어로 이동 (feat-8-024).
// ExamYearChip — 2차 기출 연도 배지. feat-8-024 이후 비-링크 (판례→문제 매칭 화면 제거).
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { cn } from "~/core/lib/utils";

export type ExamRound = "first" | "second";

export function ExamProblemChip({
  lawCode,
  problemId,
  year,
  problemNumber,
}: {
  lawCode: string;
  problemId: string;
  year: number | null;
  problemNumber: number | null;
}) {
  const label = `${year ? `${year} ` : ""}1차${
    problemNumber ? ` ${problemNumber}번` : ""
  }`;
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
