// 판례 식별 메타 한 줄 — CaseBody 헤더가 없는 화면(빈칸 풀기/편집 등) 상단에
// 원문 뷰와 동일한 정보(닉네임·법원·사건번호·유형·전합·중요도·선고일)를 노출.
// ★사건명(case_title)은 표시하지 않음 — import 데이터가 요지 제목과 중복이라 CaseBody
// 헤더와 동일하게 제외 (사용자 결정 2026-07-17).
import { StarIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import { cn } from "~/core/lib/utils";

import { COURT_LABELS, type CaseCourt } from "../labels";

export function CaseMetaLine({
  kase,
}: {
  kase: {
    court: CaseCourt;
    caseNumber: string;
    nickname: string | null;
    caseType: string | null;
    isEnBanc: boolean;
    importance: number | null;
    decidedAt: string;
  };
}) {
  return (
    <div className="border-border bg-card rounded-xl border px-4 py-3 shadow-sm">
      {kase.nickname ? (
        <p className="mb-1 text-[13px] font-bold tracking-tight text-amber-700 dark:text-amber-400">
          {kase.nickname}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold tracking-tight text-violet-600 dark:text-violet-400">
          {COURT_LABELS[kase.court]}
        </span>
        <span className="text-foreground font-mono text-[14px] font-bold tracking-tight tabular-nums">
          {kase.caseNumber}
        </span>
        {kase.caseType ? (
          <Badge
            variant="secondary"
            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          >
            {kase.caseType}
          </Badge>
        ) : null}
        {kase.isEnBanc ? (
          <Badge
            variant="default"
            className="bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-[11px] font-bold"
          >
            전합
          </Badge>
        ) : null}
        {(kase.importance ?? 0) > 0 ? (
          <span
            className="inline-flex items-center gap-0.5"
            aria-label={`중요도 ${kase.importance}성`}
          >
            {[0, 1, 2].map((i) => (
              <StarIcon
                key={i}
                className={cn(
                  "size-3",
                  i < (kase.importance ?? 0)
                    ? "fill-amber-400 text-amber-400"
                    : "fill-none text-amber-300",
                )}
              />
            ))}
          </span>
        ) : null}
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          선고일 {kase.decidedAt}
        </span>
      </div>
    </div>
  );
}
