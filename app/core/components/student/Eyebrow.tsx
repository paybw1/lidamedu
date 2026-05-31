// 섹션 라벨 — 작은 caps 모노 텍스트로 시각 위계 형성.
// Notion·Linear 식 "SECTION TITLE · 설명" 패턴.

import type { ReactNode } from "react";

import { cn } from "~/core/lib/utils";

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-ink-faint font-mono text-[11px] font-semibold tracking-[0.08em] uppercase",
        className,
      )}
    >
      {children}
    </div>
  );
}
