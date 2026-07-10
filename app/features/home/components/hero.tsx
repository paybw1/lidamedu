import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  EASE_REVEAL,
  FONT,
  LandingButton,
  PALETTE,
  Reveal,
  useCountUp,
  useInView,
} from "~/features/home/lib/landing";

export interface HeroPreview {
  name: string;
  dDay: number | null;
  examRound: "first" | "second";
  stats: { studyHours: number; problems: number; accuracy: number } | null;
  weak: string | null;
  todos: { done: boolean; text: string }[] | null;
}

export function Hero({ preview }: { preview?: HeroPreview | null }) {
  const h1 = "변리사 시험,\n이곳에서 합격까지\n함께해요";
  const words = h1.split(/(\s+|\n)/).filter(Boolean);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <section
      aria-labelledby="hero-h1"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "84px 24px 64px",
        position: "relative",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 72% -10%, var(--lp-wash), transparent 60%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        className="hero-grid"
        style={{
          display: "grid",
          gap: 48,
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
          alignItems: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            id="hero-h1"
            style={{
              font: `700 clamp(34px, 5vw, 56px)/1.15 ${FONT.display}`,
              color: PALETTE.ink,
              letterSpacing: "-0.01em",
              margin: "0 0 20px",
              whiteSpace: "pre-line",
            }}
          >
            {reduce
              ? h1
              : words.map((w, i) => {
                  if (w === "\n") return <br key={i} />;
                  return (
                    <span
                      key={i}
                      style={{
                        display: "inline-block",
                        whiteSpace: "pre",
                        opacity: mounted ? 1 : 0,
                        transform: mounted
                          ? "translateY(0)"
                          : "translateY(12px)",
                        transition: `opacity 600ms ${EASE_REVEAL} ${i * 80}ms, transform 600ms ${EASE_REVEAL} ${i * 80}ms`,
                      }}
                    >
                      {w}
                    </span>
                  );
                })}
          </h1>
          <Reveal delay={250}>
            <p
              style={{
                font: "400 17px/1.7 Pretendard, sans-serif",
                color: PALETTE.inkSoft,
                letterSpacing: "-0.01em",
                margin: "0 0 28px",
                maxWidth: 480,
                whiteSpace: "pre-line",
              }}
            >
              {`조문 · 판례 · 문제를 한곳에서 잇는 통합 학습 플랫폼입니다.\n매일의 진도를 따뜻하게 받쳐주는, 카공 같은 책상이 되어 드릴게요.`}
            </p>
          </Reveal>
          <Reveal delay={400}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {/* 가입(무료로 시작하기)은 바로 아래 무료 체험 콜아웃이 담당 —
                  중복을 피해 Hero 상단은 로그인만. */}
              <LandingButton
                size="lg"
                variant="primary"
                to="/login"
                iconRight={<ArrowRightIcon size={17} strokeWidth={1.8} />}
              >
                로그인
              </LandingButton>
            </div>
          </Reveal>
          <Reveal delay={550}>
            <div
              style={{
                display: "flex",
                gap: 24,
                flexWrap: "wrap",
                marginTop: 28,
                paddingTop: 24,
                borderTop: `1px solid ${PALETTE.line}`,
                font: "400 13px/1.5 Pretendard, sans-serif",
                color: PALETTE.inkSoft,
                letterSpacing: "-0.01em",
              }}
            >
              <span>🔥 평균 23일 연속 학습</span>
              <span>🌿 조문·판례·문제 통합</span>
            </div>
          </Reveal>
        </div>

        <Reveal delay={300} className="hero-preview">
          <HeroPreviewCard preview={preview} />
        </Reveal>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .hero-preview { order: -1; }
        }
      `}</style>
    </section>
  );
}

function HeroPreviewCard({ preview }: { preview?: HeroPreview | null }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  // 로그인 시 실데이터(이름·D-day·차수), 비로그인이면 목업으로 폴백.
  const dDayTarget = preview?.dDay ?? 87;
  const dDay = useCountUp(dDayTarget, 1400, inView);
  const greetName = preview?.name ?? "지원";
  const roundLabel = `변리사 ${preview?.examRound === "second" ? "2차" : "1차"} 시험`;
  // 로그인·활동 사용자는 실데이터, 그 외(비로그인·신규)는 예시 목업.
  const stats = preview?.stats
    ? [
        {
          lbl: "학습",
          num: preview.stats.studyHours.toLocaleString("ko-KR"),
          unit: "h",
        },
        {
          lbl: "문제",
          num: preview.stats.problems.toLocaleString("ko-KR"),
          unit: "",
        },
        { lbl: "정답률", num: String(preview.stats.accuracy), unit: "%" },
      ]
    : [
        { lbl: "학습", num: "186", unit: "h" },
        { lbl: "문제", num: "2,431", unit: "" },
        { lbl: "정답률", num: "74", unit: "%" },
      ];
  const todos =
    preview?.todos && preview.todos.length > 0
      ? preview.todos.slice(0, 3)
      : [
          { done: true, text: "특허법 제29조 — 신규성 본문 학습" },
          { done: true, text: "대법원 2019다204869 판례 정리" },
          { done: false, text: "객관식 12문제 · 진보성 단원" },
        ];
  const weakText = preview?.weak ?? "진보성 · 판례";
  return (
    <div
      ref={ref}
      style={{
        background: "var(--card)",
        borderRadius: 16,
        border: `1px solid var(--border)`,
        boxShadow: "var(--lp-shadow-lg)",
        padding: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: PALETTE.link,
          color: "#fff",
          padding: "4px 10px",
          borderRadius: 9999,
          font: "600 10px/1 Pretendard, sans-serif",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        대시보드 미리보기
      </div>

      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            font: "600 11px/1 Pretendard, sans-serif",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: PALETTE.inkSoft,
            marginBottom: 6,
          }}
        >
          {roundLabel}
        </div>
        <div
          style={{
            font: "800 56px/1 Pretendard, sans-serif",
            letterSpacing: "-0.03em",
            fontVariantNumeric: "tabular-nums",
            color: PALETTE.link,
          }}
        >
          D-{Math.round(dDay)}
        </div>
        <div
          style={{
            font: "400 13px/1.5 Pretendard, sans-serif",
            color: PALETTE.inkSoft,
            marginTop: 4,
            letterSpacing: "-0.01em",
          }}
        >
          어서오세요, {greetName}님 ☕
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {stats.map((s) => (
          <div
            key={s.lbl}
            style={{
              padding: "10px 12px",
              background: PALETTE.base,
              borderRadius: 12,
              border: `1px solid var(--border)`,
            }}
          >
            <div
              style={{
                font: "500 11px/1 Pretendard, sans-serif",
                color: PALETTE.inkSoft,
                marginBottom: 4,
              }}
            >
              {s.lbl}
            </div>
            <div
              style={{
                font: "700 20px/1 Pretendard, sans-serif",
                fontVariantNumeric: "tabular-nums",
                color: PALETTE.ink,
                letterSpacing: "-0.02em",
              }}
            >
              {s.num}
              <span
                style={{
                  fontSize: 13,
                  color: PALETTE.inkSoft,
                  marginLeft: 2,
                }}
              >
                {s.unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          font: "600 12px/1 Pretendard, sans-serif",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: PALETTE.inkSoft,
          marginBottom: 10,
        }}
      >
        오늘의 학습 계획
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {todos.map((it, i) => (
          <li
            key={it.text}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 10,
              background: it.done ? PALETTE.tint : "transparent",
              font: "400 13px/1.4 Pretendard, sans-serif",
              color: it.done ? PALETTE.ink : PALETTE.inkSoft,
              letterSpacing: "-0.01em",
              textDecoration: it.done ? "line-through" : "none",
              opacity: 0,
              transform: "translateX(8px)",
              animation: inView
                ? `landing-slide-in 400ms ${EASE_REVEAL} ${600 + i * 80}ms forwards`
                : "none",
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: it.done ? PALETTE.primary : "transparent",
                border: it.done ? 0 : `1.5px solid rgba(0,0,0,0.2)`,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {it.done ? (
                <CheckIcon size={11} strokeWidth={3} color="#fff" />
              ) : null}
            </span>
            {it.text}
          </li>
        ))}
      </ul>
      <div
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: `1px solid var(--border)`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          font: "500 12px/1.4 Pretendard, sans-serif",
          color: PALETTE.inkSoft,
          letterSpacing: "-0.01em",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--lp-weak)",
            flexShrink: 0,
          }}
        />
        이번 주 약점{" "}
        <strong style={{ color: PALETTE.ink, fontWeight: 700 }}>
          {weakText}
        </strong>
      </div>
      <style>{`@keyframes landing-slide-in { to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  );
}
