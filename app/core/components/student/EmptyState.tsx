// 빈 상태 — "데이터 없음" 이 아니라 "다음 행동" 제시.
// 신규 학생 진입 시 가장 많이 보게 되므로 공들여.

import type { ReactNode } from "react";

import { cn } from "~/core/lib/utils";

import { Surface } from "./Surface";

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Button 또는 Link 묶음. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Surface tone="dashed" pad={8} className={cn("text-center", className)}>
      {icon ? (
        <div className="text-ink-faint mx-auto mb-3 inline-flex">{icon}</div>
      ) : null}
      <h3 className="text-foreground text-base font-semibold tracking-tight">
        {title}
      </h3>
      {description ? (
        <p className="text-ink-soft mx-auto mt-2 max-w-prose text-sm leading-relaxed">
          {description}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>
      ) : null}
    </Surface>
  );
}
