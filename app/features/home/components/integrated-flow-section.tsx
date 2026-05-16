import { Fragment, type MouseEventHandler, useEffect, useRef, useState } from "react";

import { EASE_REVEAL, PALETTE, Reveal, useInView } from "~/features/home/lib/landing";
import { SectionHeader } from "~/features/home/components/section-header";

const CARDS = [
  {
    kind: "조문",
    ttl: "특허법 제29조 제1항",
    body: "산업상 이용할 수 있는 발명으로서 다음 각 호의 …",
    meta: ["관련 판례 12", "문제 47", "메모 3"],
  },
  {
    kind: "판례",
    ttl: "대법원 2019다204869",
    body: "신규성 판단 기준 — 동일성·진보성의 경계.",
    meta: ["조문 3", "유사 문제 8"],
  },
  {
    kind: "문제",
    ttl: "객관식 #2024-1차-12",
    body: "다음 중 신규성이 인정되지 않는 경우는?",
    meta: ["primary 조문", "판례 2"],
  },
];

const onEnter: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(-2px)";
  e.currentTarget.style.boxShadow = "0 10px 28px rgba(0,0,0,0.10)";
};
const onLeave: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "none";
};

export function IntegratedFlowSection() {
  const [ref, inView] = useInView<HTMLElement>(0.25);
  return (
    <section
      ref={ref}
      aria-labelledby="integrated-h2"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "72px 24px",
      }}
    >
      <SectionHeader
        eyebrow="INTEGRATED FLOW"
        title="한 번 들어간 학습은 끊기지 않습니다"
        subtitle={
          "조문에서 판례로, 판례에서 문제로 — 우측 패널이 늘 다음 자료를 들고 있습니다."
        }
      />

      <div
        className="flow-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 32px 1fr 32px 1fr",
          gap: 10,
          alignItems: "stretch",
          marginTop: 32,
        }}
      >
        {CARDS.map((c, i) => (
          <Fragment key={c.kind}>
            <Reveal
              delay={i * 150}
              as="article"
              onMouseEnter={onEnter}
              onMouseLeave={onLeave}
              style={{
                padding: 18,
                background: "#fff",
                borderRadius: 8,
                border: `1px solid rgba(0,0,0,0.08)`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                transition:
                  "transform 200ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              <span
                style={{
                  font: "600 11px/1 Pretendard, sans-serif",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: PALETTE.primary,
                }}
              >
                {c.kind}
              </span>
              <span
                style={{
                  font: "700 17px/1.4 Pretendard, sans-serif",
                  color: PALETTE.ink,
                  letterSpacing: "-0.018em",
                }}
              >
                {c.ttl}
              </span>
              <span
                style={{
                  font: "400 13px/1.6 Pretendard, sans-serif",
                  color: PALETTE.inkSoft,
                  letterSpacing: "-0.005em",
                }}
              >
                {c.body}
              </span>
              <span
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginTop: "auto",
                  paddingTop: 8,
                }}
              >
                {c.meta.map((m) => (
                  <span
                    key={m}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      background: PALETTE.tint,
                      color: PALETTE.primary,
                      padding: "4px 10px",
                      borderRadius: 9999,
                      font: "500 11px/1 Pretendard, sans-serif",
                    }}
                  >
                    {m}
                  </span>
                ))}
              </span>
            </Reveal>
            {i < CARDS.length - 1 ? (
              <ConnectorArrow active={inView} delay={i * 150 + 250} />
            ) : null}
          </Fragment>
        ))}
      </div>

      <Reveal delay={600}>
        <p
          style={{
            font: "400 14px/1.6 Pretendard, sans-serif",
            color: PALETTE.inkSoft,
            textAlign: "center",
            marginTop: 24,
            letterSpacing: "-0.01em",
          }}
        >
          polymorphic 메모 · 즐겨찾기 · 하이라이트 — 어느 화면에서든 본인의 노트가
          따라옵니다.
        </p>
      </Reveal>

      <style>{`
        @media (max-width: 880px) {
          .flow-grid {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
          }
          .flow-grid .integrated-connector { transform: rotate(90deg); margin: 4px auto; }
        }
      `}</style>
    </section>
  );
}

function ConnectorArrow({ active, delay }: { active: boolean; delay: number }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLen, setPathLen] = useState(0);
  useEffect(() => {
    if (pathRef.current) setPathLen(pathRef.current.getTotalLength());
  }, []);
  return (
    <div
      className="integrated-connector"
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
        <path
          ref={pathRef}
          d="M2 10 H 30 M 24 4 L 30 10 L 24 16"
          stroke={PALETTE.primary}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: active ? "3 4" : `${pathLen} ${pathLen}`,
            strokeDashoffset: active ? 0 : pathLen,
            transition: `stroke-dashoffset 600ms ${EASE_REVEAL} ${delay}ms`,
          }}
        />
      </svg>
    </div>
  );
}
