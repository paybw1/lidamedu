// feat-2-035 — 원심(하급심) 판결문 열람 배지 + 시트. **운영자 전용**.
//
// 도식의 사실관계가 어디서 왔는지 원문으로 확인하는 용도. 학생에게는 보이지 않는다 —
// 저작물 전문이고 학습 콘텐츠가 아니라서, RLS(case_lower_courts staff 전용)가
// 데이터 단계에서 막고 화면은 데이터가 없으면 배지를 그리지 않는다.

import { GavelIcon, ScrollTextIcon } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/core/components/ui/sheet";

export interface LowerCourtView {
  sourceRef: string | null;
  lowerCourt: string | null;
  lowerCaseNumber: string | null;
  charCount: number;
  bodyText: string;
}

export function LowerCourtSheet({ lower }: { lower: LowerCourtView }) {
  const label =
    lower.sourceRef ??
    [lower.lowerCourt, lower.lowerCaseNumber].filter(Boolean).join(" ") ??
    "원심 판결문";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          title="원심 판결문 원문 보기 (운영자 전용)"
          className="border-border text-muted-foreground hover:bg-muted inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors"
        >
          <GavelIcon className="size-3.5" />
          원심 판결문
          <span className="text-muted-foreground/70">운영자</span>
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-[720px]"
      >
        <SheetHeader className="border-border bg-background sticky top-0 z-10 border-b px-4 py-3">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <ScrollTextIcon className="text-link size-4" />
            원심 판결문
            <span className="text-muted-foreground font-mono text-xs font-normal">
              {label}
            </span>
          </SheetTitle>
          <p className="text-muted-foreground text-[11px]">
            도식의 사실관계 근거 · {lower.charCount.toLocaleString("ko-KR")}자 ·
            운영자에게만 보입니다
          </p>
        </SheetHeader>
        {/* 판결문 전문은 마크다운이 아니라 평문이다 — 줄바꿈만 살려 그대로 보여준다. */}
        <pre className="text-foreground px-4 py-4 text-[13px] leading-[1.8] whitespace-pre-wrap">
          {lower.bodyText}
        </pre>
      </SheetContent>
    </Sheet>
  );
}
