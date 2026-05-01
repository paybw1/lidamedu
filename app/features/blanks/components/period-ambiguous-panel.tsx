// 기간 빈칸 모드에서 자동 추출에 실패하거나 결과가 모호한 케이스 목록.
// 운영자가 검토하고 필요 시 수동으로 빈칸 자료를 만들거나 패턴을 보완하도록 한다.

import { AlertTriangleIcon } from "lucide-react";

import type { PeriodAmbiguousCase } from "~/features/blanks/lib/period-blanks";

export function PeriodAmbiguousPanel({
  cases,
}: {
  cases: PeriodAmbiguousCase[];
}) {
  if (cases.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-300/60 bg-amber-50/60 p-3 text-xs dark:border-amber-700/60 dark:bg-amber-950/30">
      <p className="mb-2 inline-flex items-center gap-1 font-semibold text-amber-900 dark:text-amber-200">
        <AlertTriangleIcon className="size-3.5" />
        기준점 자동 추출 모호 — 검토 필요 ({cases.length}건)
      </p>
      <ul className="space-y-2 text-amber-900/90 dark:text-amber-100/90">
        {cases.map((c, i) => (
          <li
            key={i}
            className="rounded bg-white/40 p-2 dark:bg-black/20"
          >
            <p className="font-medium">
              [{c.articleLabel}] 기간 "{c.durationText}"
            </p>
            <p className="text-amber-800 dark:text-amber-300">
              {c.reason}
            </p>
            <p className="mt-1 text-[11px]">
              <span className="text-muted-foreground">기준점 후보: </span>
              <span className="font-mono">
                {c.candidate.length > 80
                  ? "…" + c.candidate.slice(-80)
                  : c.candidate}
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              본문: {c.blockText}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
