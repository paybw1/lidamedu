// feat-2-027 P4 — 학습 내용 글자 크기 3단계(작게/보통/크게) 공용 컨트롤.
// CSS 변수 --study-fs 배율을 documentElement 에 적용(전역) + localStorage 저장(영속).
// 정독 화면(문제·조문·판례·자연과학)의 본문이 text-[length:calc(...*var(--study-fs))] 로 따라간다.
// 한 곳에서 바꾸면 전 정독 화면 + 다음 세션까지 유지(가-가-가).
import { useEffect, useState } from "react";

import { cn } from "~/core/lib/utils";

const STUDY_FONT_STEPS = { sm: 0.9, md: 1, lg: 1.18 } as const;
type StudyFontStep = keyof typeof STUDY_FONT_STEPS;

export function StudyFontControl({ className }: { className?: string }) {
  const [step, setStep] = useState<StudyFontStep>("md");
  useEffect(() => {
    const saved = localStorage.getItem("studyFontStep");
    if (saved === "sm" || saved === "md" || saved === "lg") setStep(saved);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--study-fs",
      String(STUDY_FONT_STEPS[step]),
    );
  }, [step]);
  const choose = (s: StudyFontStep) => {
    setStep(s);
    try {
      localStorage.setItem("studyFontStep", s);
    } catch {
      /* localStorage 불가(프라이빗 모드 등) 시 무시 — 현재 세션엔 적용됨 */
    }
  };
  return (
    <div
      className={cn(
        "border-border inline-flex items-center gap-0.5 rounded-full border p-0.5",
        className,
      )}
      role="group"
      aria-label="학습 내용 글자 크기"
      title="학습 내용 글자 크기"
    >
      {(["sm", "md", "lg"] as StudyFontStep[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => choose(s)}
          aria-pressed={step === s}
          aria-label={s === "sm" ? "작게" : s === "md" ? "보통" : "크게"}
          className={cn(
            "rounded-full px-2 leading-none font-semibold transition-colors",
            s === "sm"
              ? "text-[11px]"
              : s === "md"
                ? "text-[13px]"
                : "text-[16px]",
            step === s
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          가
        </button>
      ))}
    </div>
  );
}
