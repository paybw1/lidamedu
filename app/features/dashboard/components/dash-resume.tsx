// 대시보드 "이어서 학습" 카드 — 마지막 학습 지점(조문/판례/문제)을 한 클릭 재개.
// 재방문 마찰을 줄인다. 데이터 없으면(신규) 렌더 안 함.

import { ArrowRightIcon, HistoryIcon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import type { ResumePoint } from "~/features/study/queries.server";

export function ResumeCard({ point }: { point: ResumePoint | null }) {
  if (!point) return null;
  return (
    <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="bg-muted text-muted-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-lg">
          <HistoryIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-semibold">
            이어서 학습 · {point.when}
          </p>
          <p className="text-foreground truncate text-sm font-medium">
            {point.subjectName} {point.type} · {point.label}
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5">
        <Link to={point.path} viewTransition>
          이어서 보기 <ArrowRightIcon className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}
