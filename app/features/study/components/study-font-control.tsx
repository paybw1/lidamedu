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

// feat-2-027 P4 — 본문 명암(대비) 3단계(진하게/보통/연하게). 사용자가 직접 조절.
// documentElement 의 data-reading 속성을 설정 → app.css 가 모드별(라이트/다크)로 --foreground 를
// 오버라이드(고대비 눈부심 vs 저대비 가독성을 본인 눈·기기에 맞춤). localStorage 영속.
const CONTRAST_STEPS = ["high", "normal", "soft"] as const;
type ContrastStep = (typeof CONTRAST_STEPS)[number];

export function ReadingContrastControl() {
  const [step, setStep] = useState<ContrastStep>("normal");
  useEffect(() => {
    const saved = localStorage.getItem("readingContrast");
    if (saved === "high" || saved === "normal" || saved === "soft") {
      setStep(saved);
    }
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    if (step === "normal") delete el.dataset.reading;
    else el.dataset.reading = step;
  }, [step]);
  const choose = (s: ContrastStep) => {
    setStep(s);
    try {
      localStorage.setItem("readingContrast", s);
    } catch {
      /* localStorage 불가 시 무시 — 현재 세션엔 적용됨 */
    }
  };
  return (
    <div
      className="border-border inline-flex items-center gap-0.5 rounded-full border p-0.5"
      role="group"
      aria-label="본문 명암"
      title="본문 명암 (진하게 / 보통 / 연하게)"
    >
      {CONTRAST_STEPS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => choose(s)}
          aria-pressed={step === s}
          aria-label={
            s === "high" ? "진하게" : s === "normal" ? "보통" : "연하게"
          }
          className={cn(
            "flex size-6 items-center justify-center rounded-full transition-colors",
            step === s ? "bg-muted ring-primary ring-1" : "hover:bg-muted",
          )}
        >
          <span
            className={cn(
              "bg-foreground block size-2.5 rounded-full",
              s === "high"
                ? "opacity-100"
                : s === "normal"
                  ? "opacity-60"
                  : "opacity-30",
            )}
          />
        </button>
      ))}
    </div>
  );
}

// 정독 화면 읽기 설정 묶음 — 글자 크기(가-가-가) + 본문 명암. 툴바에 한 번에 배치.
export function ReadingControls({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <StudyFontControl />
      <ReadingContrastControl />
    </div>
  );
}
