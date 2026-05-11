// 판례에 연결된 1차/2차 기출년도 chip — 클릭 시 해당 연도 기출 문제 색인으로 라우팅.
// 1차: /subjects/:slug?tab=problems&p_origin=past_exam&p_round=first&p_year=YYYY
// 2차는 데이터 미입력 — 클릭 비활성, 안내 툴팁만.

import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { cn } from "~/core/lib/utils";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type ExamRound = "first" | "second";

export function ExamYearChip({
  subjectSlug,
  round,
  year,
}: {
  subjectSlug: LawSubjectSlug;
  round: ExamRound;
  year: number;
}) {
  const label = `${round === "first" ? "1차" : "2차"} ${year}`;
  const colorClass =
    round === "first"
      ? "border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300"
      : "border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300";

  if (round === "second") {
    // 2차 문제 데이터 미입력. 시각적으로 disabled.
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] opacity-70 cursor-not-allowed",
          colorClass,
        )}
        title="2차 시험 기출 — 문제 데이터 준비 중"
      >
        {label}
      </Badge>
    );
  }

  const sp = new URLSearchParams();
  sp.set("tab", "problems");
  sp.set("p_origin", "past_exam");
  sp.set("p_round", round);
  sp.set("p_year", String(year));
  const to = `/subjects/${subjectSlug}?${sp.toString()}`;

  return (
    <Link
      to={to}
      viewTransition
      title={`${label} 기출 문제로 이동`}
    >
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer transition-colors",
          colorClass,
        )}
      >
        {label}
      </Badge>
    </Link>
  );
}
