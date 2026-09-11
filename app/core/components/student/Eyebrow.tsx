// 섹션 라벨 — 작은 caps 고딕 텍스트로 시각 위계 형성(2026-09-11: font-mono 제거 — 한글이 Windows 에서 굴림체로 떨어짐).
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
        "text-ink-faint text-xs font-semibold tracking-[0.08em] uppercase",
        className,
      )}
    >
      {children}
    </div>
  );
}
