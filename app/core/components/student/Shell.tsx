// 학생 화면 공용 컨테이너 — 폭/패딩/모바일·데스크톱 일관성 단일 소유.
// 화면마다 다른 max-w 클래스 사용 금지 — 본 컴포넌트만 사용.

import type { ReactNode } from "react";

import { cn } from "~/core/lib/utils";

type ShellWidth = "default" | "wide" | "narrow";

const WIDTH_CLS: Record<ShellWidth, string> = {
  /** 학생 화면 표준 — 1024px. 대시보드·오늘·통계·목표. */
  default: "max-w-screen-lg",
  /** 색인·표 등 더 넓게. */
  wide: "max-w-screen-xl",
  /** 단일 흐름(읽기/긴 폼). */
  narrow: "max-w-screen-md",
};

export function StudentShell({
  width = "default",
  className,
  children,
}: {
  width?: ShellWidth;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10",
        WIDTH_CLS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * 섹션 분리 — Eyebrow 아래에 children. SectionBand 의 학생 화면 버전.
 * 섹션 간 일관 간격(mt-8) 자동.
 */
export function StudentSection({
  eyebrow,
  description,
  action,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-8 first:mt-0", className)}>
      {eyebrow || description || action ? (
        <header className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {eyebrow}
            {description ? (
              <p className="text-ink-soft mt-0.5 text-sm">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
