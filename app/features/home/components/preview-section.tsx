import type { CSSProperties, ReactNode } from "react";

import { ArrowRightIcon } from "lucide-react";

import {
  EASE_REVEAL,
  LandingButton,
  PALETTE,
  Reveal,
  useCountUp,
  useInView,
} from "~/features/home/lib/landing";

export function PreviewSection() {
  const [ref, inView] = useInView<HTMLElement>();
  const pct = useCountUp(72, 1200, inView);
  const hours = useCountUp(19.6, 1200, inView);
  const probs = useCountUp(1248, 1400, inView);
  const acc = useCountUp(74.2, 1300, inView);

  return (
    <section
      ref={ref}
      aria-labelledby="preview-h2"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "72px 24px",
      }}
    >
      <div
        className="preview-grid"
        style={{
          display: "grid",
          gap: 40,
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              font: "600 12px/1 Pretendard, sans-serif",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: PALETTE.primary,
              marginBottom: 16,
            }}
          >
            DASHBOARD
          </div>
          <h2
            style={{
              font: "800 clamp(24px, 3.4vw, 34px)/1.25 Pretendard, sans-serif",
              color: PALETTE.ink,
              letterSpacing: "-0.022em",
              margin: "0 0 16px",
              whiteSpace: "pre-line",
            }}
          >
            {"오늘 무엇을, 얼마나\n해야 하는지가 또렷해집니다."}
          </h2>
          <p
            style={{
              font: "400 16px/1.7 Pretendard, sans-serif",
              color: PALETTE.inkSoft,
              margin: "0 0 24px",
              letterSpacing: "-0.01em",
              maxWidth: 440,
            }}
          >
            D-day, 연속 학습일, 과목별 진도, 약점 지표가 한 화면에. 작은 성취가
            매일 쌓이는 감각.
          </p>
          <LandingButton
            variant="outline"
            to="/dashboard"
            iconRight={<ArrowRightIcon size={16} strokeWidth={1.8} />}
          >
            대시보드 둘러보기
          </LandingButton>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <Reveal delay={0} style={tile()}>
            <Lbl>진도</Lbl>
            <Num value={Math.round(pct).toString()} unit="%" />
            <Sub>특허법 · 38h 누적</Sub>
            <Bar value={pct} />
          </Reveal>
          <Reveal
            delay={120}
            style={{
              ...tile(),
              background: PALETTE.gradientVisit,
              color: "#fff",
              border: 0,
            }}
          >
            <Lbl dark>이번 주</Lbl>
            <Num value={hours.toFixed(1)} unit="h" dark />
            <Sub dark>목표 25h</Sub>
            <Bar value={(hours / 25) * 100} dark />
          </Reveal>
          <Reveal delay={240} style={tile()}>
            <Lbl>학습 히트맵</Lbl>
            <MiniHeatmap inView={inView} />
            <Sub>최근 4주 · 평균 1.8h/일</Sub>
          </Reveal>
          <Reveal delay={360} style={tile()}>
            <Lbl>문제</Lbl>
            <Num value={Math.round(probs).toLocaleString("ko-KR")} unit="" />
            <Sub>정답률 {acc.toFixed(1)}%</Sub>
            <Bar value={acc} />
          </Reveal>
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .preview-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function tile(): CSSProperties {
  return {
    padding: 16,
    borderRadius: 16,
    background: "var(--card)",
    border: `1px solid var(--border)`,
  };
}

function Lbl({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <div
      style={{
        font: "600 11px/1 Pretendard, sans-serif",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: dark ? "rgba(255,255,255,0.7)" : PALETTE.primary,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Num({
  value,
  unit,
  dark,
}: {
  value: string;
  unit: string;
  dark?: boolean;
}) {
  return (
    <div
      style={{
        font: "800 26px/1 Pretendard, sans-serif",
        letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums",
        color: dark ? "#fff" : PALETTE.ink,
      }}
    >
      {value}
      {unit ? (
        <span style={{ fontSize: 14, opacity: 0.7, marginLeft: 2 }}>
          {unit}
        </span>
      ) : null}
    </div>
  );
}

function Sub({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <div
      style={{
        font: "400 12px/1.5 Pretendard, sans-serif",
        color: dark ? "rgba(255,255,255,0.75)" : PALETTE.inkSoft,
        marginTop: 4,
        letterSpacing: "-0.005em",
      }}
    >
      {children}
    </div>
  );
}

function Bar({ value, dark }: { value: number; dark?: boolean }) {
  return (
    <div
      style={{
        height: 5,
        marginTop: 10,
        background: dark ? "rgba(255,255,255,0.2)" : "var(--surface-3)",
        borderRadius: 9999,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${value}%`,
          background: dark ? "#fff" : PALETTE.primary,
          borderRadius: 9999,
          transition: "width 800ms cubic-bezier(0.22,1,0.36,1)",
        }}
      />
    </div>
  );
}

function MiniHeatmap({ inView }: { inView: boolean }) {
  const tones = [
    "var(--surface-3)",
    "rgba(45, 91, 168, 0.15)",
    "rgba(45, 91, 168, 0.35)",
    "rgba(45, 91, 168, 0.6)",
    PALETTE.primary,
  ];
  const cells: number[] = [];
  for (let i = 0; i < 28; i++) {
    const v = ((i * 7) ^ (i >> 1)) & 7;
    cells.push(Math.min(v, 4));
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 3,
        margin: "8px 0",
      }}
    >
      {cells.map((v, i) => (
        <div
          key={i}
          style={{
            aspectRatio: "1",
            borderRadius: 3,
            background: inView ? tones[v] : tones[0],
            transition: `background 320ms ${EASE_REVEAL} ${i * 18}ms`,
          }}
        />
      ))}
    </div>
  );
}
