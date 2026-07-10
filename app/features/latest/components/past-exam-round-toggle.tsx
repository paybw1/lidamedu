// 기출문제 1차/2차 구분 토글 — 학습정보 '기출문제' 통합 진입점.
// 1차(객관식 팩) = /latest/mcq?kind=past_exam · 2차(주관식) = /latest/essay.
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";

const TABS = [
  { round: "first" as const, label: "1차 기출문제", to: "/latest/mcq?kind=past_exam" },
  { round: "second" as const, label: "2차 기출문제", to: "/latest/essay" },
];

export function PastExamRoundToggle({ active }: { active: "first" | "second" }) {
  return (
    <div
      role="tablist"
      aria-label="기출문제 구분"
      className="border-border bg-muted/50 mb-4 inline-flex items-center gap-1 rounded-full border p-1"
    >
      {TABS.map((t) => {
        const isActive = t.round === active;
        return (
          <Link
            key={t.round}
            to={t.to}
            role="tab"
            aria-selected={isActive}
            viewTransition
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-semibold no-underline transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
