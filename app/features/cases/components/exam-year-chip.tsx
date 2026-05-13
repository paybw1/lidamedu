// 판례에 연결된 1차/2차 기출년도 chip — 클릭 시 그 판례 ↔ 그 회차/연도의 매칭된 문제로 이동.
//
// caseId 있음 (=case 컨텍스트에서 노출): /subjects/:slug/cases/:caseId/exam/:round/:year
//   → 새 화면이 problem_case_links + 본문 자동 매칭으로 해당 문제 list/redirect 처리.
//     매칭 없으면 staff 가 수동 연결할 수 있는 UI 표시.
// caseId 없음 (=fallback): 기존 색인 화면으로.

import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { cn } from "~/core/lib/utils";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type ExamRound = "first" | "second";

export function ExamYearChip({
  subjectSlug,
  round,
  year,
  caseId,
}: {
  subjectSlug: LawSubjectSlug;
  round: ExamRound;
  year: number;
  caseId?: string;
}) {
  const label = `${round === "first" ? "1차" : "2차"} ${year}`;
  const colorClass =
    round === "first"
      ? "border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300"
      : "border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300";

  let to: string;
  if (caseId) {
    to = `/subjects/${subjectSlug}/cases/${caseId}/exam/${round}/${year}`;
  } else {
    const sp = new URLSearchParams();
    sp.set("tab", "problems");
    sp.set("p_origin", "past_exam");
    sp.set("p_round", round);
    sp.set("p_year", String(year));
    to = `/subjects/${subjectSlug}?${sp.toString()}`;
  }

  return (
    <Link
      to={to}
      viewTransition
      title={
        caseId
          ? `${label} 기출 문제로 이동 (이 판례와 매칭된 문제)`
          : `${label} 기출 문제로 이동`
      }
    >
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] cursor-pointer transition-colors",
          round === "first"
            ? "hover:bg-sky-50 dark:hover:bg-sky-950/40"
            : "hover:bg-rose-50 dark:hover:bg-rose-950/40",
          colorClass,
        )}
      >
        {label}
      </Badge>
    </Link>
  );
}
