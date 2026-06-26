import { Fragment } from "react";

import { SectionHeader } from "~/features/home/components/section-header";
import {
  EASE_REVEAL,
  PALETTE,
  Reveal,
  useInView,
} from "~/features/home/lib/landing";

const STEPS = [
  {
    n: "STEP 1",
    t: "학습 목표 설정",
    d: "시험 일자와 목표 점수를 기준으로, 매일의 권장 진도가 자동 계산됩니다.",
  },
  {
    n: "STEP 2",
    t: "조문 → 판례 → 문제",
    d: "한 흐름으로 깊이 들어가며, 메모와 하이라이트로 자기만의 노트를 쌓아갑니다.",
  },
  {
    n: "STEP 3",
    t: "약점·진도 한 눈에",
    d: "히트맵, 정답률, 연속 학습일이 대시보드에 모입니다. 다음에 무엇을 풀지도 추천해 드립니다.",
  },
];

export function FlowSection() {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <section
      ref={ref}
      aria-labelledby="how-h2"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "72px 24px",
      }}
    >
      <SectionHeader
        eyebrow="HOW IT WORKS"
        title="시작은 단순하게"
        subtitle="가입하고 목표를 정하면, 나머지는 매일의 습관이 됩니다."
      />
      <div
        className="how-grid"
        style={{
          display: "grid",
          gap: 14,
          marginTop: 32,
          gridTemplateColumns: "repeat(3, 1fr)",
          position: "relative",
        }}
      >
        {STEPS.map((s, i) => (
          <Fragment key={s.n}>
            <Reveal
              delay={i * 100}
              as="article"
              style={{
                padding: 24,
                background: "var(--card)",
                borderRadius: 8,
                border: `1px solid var(--border)`,
                position: "relative",
                zIndex: 2,
              }}
            >
              <div
                style={{
                  font: "700 11px/1 Pretendard, sans-serif",
                  letterSpacing: "0.12em",
                  color: PALETTE.link,
                  marginBottom: 14,
                }}
              >
                {s.n}
              </div>
              <div
                style={{
                  font: "700 19px/1.35 Pretendard, sans-serif",
                  color: PALETTE.ink,
                  letterSpacing: "-0.02em",
                  marginBottom: 8,
                }}
              >
                {s.t}
              </div>
              <div
                style={{
                  font: "400 14px/1.65 Pretendard, sans-serif",
                  color: PALETTE.inkSoft,
                  letterSpacing: "-0.01em",
                }}
              >
                {s.d}
              </div>
            </Reveal>
            {i < STEPS.length - 1 ? (
              <div
                aria-hidden="true"
                className="how-connector"
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${(i + 1) * 33.33}%`,
                  width: 30,
                  height: 1,
                  zIndex: 1,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div
                  style={{
                    height: 1,
                    background: PALETTE.inkSoft,
                    opacity: 0.3,
                    width: inView ? "100%" : 0,
                    transition: `width 500ms ${EASE_REVEAL} ${i * 100 + 300}ms`,
                  }}
                />
              </div>
            ) : null}
          </Fragment>
        ))}
      </div>
      <style>{`
        @media (max-width: 960px) {
          .how-grid { grid-template-columns: 1fr !important; }
          .how-connector { display: none !important; }
        }
      `}</style>
    </section>
  );
}
