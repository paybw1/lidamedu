import { ArrowRightIcon } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";

import { SectionHeader } from "~/features/home/components/section-header";
import {
  EASE_REVEAL,
  LandingButton,
  PALETTE,
  Reveal,
  useInView,
} from "~/features/home/lib/landing";

// 예시(미리보기) 진단 — 단원 × 지식종류 교차 정답률. 0 약함 / 1 보통 / 2 강함.
// 실제 라이브 기능: feat-2-022 OX 약점 진단 매트릭스 + feat-10-006 OX SRS.
const UNITS = ["신규성", "진보성", "명세서", "거절·무효"];
const KINDS = ["조문", "판례", "이론"];
const MATRIX: number[][] = [
  [2, 0, 2],
  [0, 0, 1],
  [2, 2, 0],
  [1, 2, 2],
];
const CELL_TONE = ["#E26A53", "#E0A43B", "#4E9E78"]; // 약함 / 보통 / 강함
const CELL_LABEL = ["약함", "보통", "강함"];

export function WeaknessEngineSection() {
  const [ref, inView] = useInView<HTMLElement>(0.2);
  // #2는 hero 바로 아래(above the fold) — inView가 로드 즉시 true가 되어 스태거가
  // 사용자가 인지하기 전에 끝난다. 스크롤 진입에만 의존하지 말고, 빈 상태를 한 박자
  // (짧은 지연) 보장한 뒤 채워서 로드 시에도 빈→채움 스태거가 재생되게 한다.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (filled || !inView) return;
    const t = window.setTimeout(() => setFilled(true), 200);
    return () => window.clearTimeout(t);
  }, [inView, filled]);
  return (
    <section
      ref={ref}
      aria-labelledby="weakness-h2"
      style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px" }}
    >
      <SectionHeader
        eyebrow="WEAKNESS ENGINE · 약점 진단"
        title="어디가 약한지 알아야, 거기를 채웁니다"
        subtitle="단원 × 지식종류로 약점을 짚고, 틀린 문제는 복습 큐가 잊을 때쯤 다시 꺼냅니다. 지금 바로 작동하는 분석 엔진."
      />

      <div
        className="weakness-grid"
        style={{
          display: "grid",
          gap: 20,
          gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)",
          alignItems: "stretch",
          marginTop: 12,
        }}
      >
        {/* 좌 — 약점 진단 매트릭스 */}
        <Reveal
          style={{
            padding: 22,
            background: "var(--card)",
            borderRadius: 16,
            border: `1px solid ${PALETTE.line}`,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <CardLabel>
            약점 진단 매트릭스 <Tag>예시</Tag>
          </CardLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "64px repeat(3, 1fr)",
              gap: 6,
              margin: "16px 0 14px",
            }}
          >
            <div />
            {KINDS.map((k) => (
              <div
                key={k}
                style={{
                  font: "600 11px/1 Pretendard, sans-serif",
                  letterSpacing: "0.04em",
                  color: PALETTE.inkSoft,
                  textAlign: "center",
                  paddingBottom: 2,
                }}
              >
                {k}
              </div>
            ))}
            {MATRIX.map((row, r) => (
              <Fragment key={UNITS[r]}>
                <div
                  style={{
                    font: "600 12px/1 Pretendard, sans-serif",
                    color: PALETTE.ink,
                    letterSpacing: "-0.01em",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: 4,
                  }}
                >
                  {UNITS[r]}
                </div>
                {row.map((v, c) => (
                  <div
                    key={`${r}-${c}`}
                    title={`${UNITS[r]} · ${KINDS[c]} — ${CELL_LABEL[v]}`}
                    style={{
                      height: 36,
                      borderRadius: 8,
                      background: filled ? CELL_TONE[v] : "var(--surface-3)",
                      transition: `background 400ms ${EASE_REVEAL} ${(r * 3 + c) * 50}ms`,
                    }}
                  />
                ))}
              </Fragment>
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {CELL_TONE.map((t, i) => (
              <span
                key={t}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  font: "500 12px/1 Pretendard, sans-serif",
                  color: PALETTE.inkSoft,
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    background: t,
                  }}
                />
                {CELL_LABEL[i]}
              </span>
            ))}
          </div>
          <CardFoot>
            단원 × 조문·판례·이론 교차 정답률 — 약한 칸이 한눈에.
          </CardFoot>
        </Reveal>

        {/* 우 — 자동 복습 큐(SRS) + 다음 한 주 보완 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Reveal
            delay={120}
            style={{
              padding: 20,
              background: PALETTE.gradientVisit,
              color: "#fff",
              borderRadius: 16,
              border: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <CardLabel dark>자동 복습 큐 · SRS</CardLabel>
            <div
              style={{
                font: "700 19px/1.35 Pretendard, sans-serif",
                letterSpacing: "-0.018em",
                marginTop: 2,
              }}
            >
              틀린 12문제가 복습 큐에
            </div>
            <div
              style={{
                font: "400 13px/1.6 Pretendard, sans-serif",
                color: "rgba(255,255,255,0.82)",
                letterSpacing: "-0.005em",
              }}
            >
              오늘 만기 8개 · ▸ 잊을 때쯤 자동 재출제
            </div>
          </Reveal>

          <Reveal
            delay={240}
            style={{
              padding: 20,
              background: "var(--card)",
              borderRadius: 16,
              border: `1px solid ${PALETTE.line}`,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <CardLabel>다음 한 주 보완</CardLabel>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "2px 0 0",
                display: "flex",
                flexDirection: "column",
                gap: 7,
              }}
            >
              {["진보성 · 판례 8문제", "명세서 · 이론 복습"].map((it) => (
                <li
                  key={it}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    font: "500 14px/1.5 Pretendard, sans-serif",
                    color: PALETTE.ink,
                    letterSpacing: "-0.01em",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: PALETTE.primary,
                      flexShrink: 0,
                    }}
                  />
                  {it}
                </li>
              ))}
            </ul>
            <CardFoot>약한 칸부터 자동 추천.</CardFoot>
          </Reveal>
        </div>
      </div>

      <Reveal delay={320} style={{ marginTop: 28, textAlign: "center" }}>
        <LandingButton
          size="lg"
          variant="primary"
          to="/join"
          iconRight={<ArrowRightIcon size={17} strokeWidth={1.8} />}
        >
          내 약점 진단 시작
        </LandingButton>
        <div
          style={{
            font: "400 12px/1.5 Pretendard, sans-serif",
            color: PALETTE.inkSoft,
            marginTop: 10,
          }}
        >
          가입 직후부터 풀이가 쌓이는 대로 본인 매트릭스가 채워집니다.
        </div>
      </Reveal>

      <style>{`
        @media (max-width: 880px) {
          .weakness-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function CardLabel({
  children,
  dark,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      style={{
        font: "600 11px/1 Pretendard, sans-serif",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: dark ? "rgba(255,255,255,0.72)" : PALETTE.primary,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        background: PALETTE.tint,
        color: PALETTE.primary,
        padding: "2px 7px",
        borderRadius: 6,
        font: "600 10px/1.4 Pretendard, sans-serif",
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </span>
  );
}

function CardFoot({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        font: "400 12px/1.6 Pretendard, sans-serif",
        color: PALETTE.inkSoft,
        letterSpacing: "-0.005em",
        marginTop: "auto",
        paddingTop: 12,
      }}
    >
      {children}
    </div>
  );
}
