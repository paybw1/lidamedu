// 학생 화면 표면(카드) 프리미티브 — Notion·Linear 톤.
// 그림자 최소, 얇은 단색 경계, 평면적. shadcn `Card` 보다 더 절제된 변형.
// 4·8 spacing 그리드만 허용.

import type { ReactNode, HTMLAttributes } from "react";

import { cn } from "~/core/lib/utils";

type Tone = "default" | "subtle" | "outlined" | "dashed";

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  /** 내부 padding 단계. 0 = 직접 control. */
  pad?: 0 | 3 | 4 | 6 | 8;
  children: ReactNode;
}

const TONE_CLS: Record<Tone, string> = {
  default: "bg-card border border-border",
  subtle: "bg-surface-2 border border-border/60",
  outlined: "bg-transparent border border-line-strong",
  dashed: "bg-card border border-dashed border-border",
};

const PAD_CLS: Record<NonNullable<SurfaceProps["pad"]>, string> = {
  0: "",
  3: "p-3",
  4: "p-4",
  6: "p-6",
  8: "p-8",
};

export function Surface({
  tone = "default",
  pad = 6,
  className,
  children,
  ...rest
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-xl text-card-foreground transition-colors",
        TONE_CLS[tone],
        PAD_CLS[pad],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
