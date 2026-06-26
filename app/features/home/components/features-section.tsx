import type { MouseEventHandler } from "react";

import { SectionHeader } from "~/features/home/components/section-header";
import { PALETTE, Reveal } from "~/features/home/lib/landing";

const CARDS = [
  {
    n: "01",
    t: "메뉴 진입 트리",
    d: "과목 → 조문 · 판례 · 문제로 자연스럽게 깊이 들어갑니다. 클릭 한 번으로 원하는 학습 단위에 도달합니다.",
  },
  {
    n: "02",
    t: "조문 ↔ 판례 ↔ 문제",
    d: "어떤 화면에서 진입하든 관련 자료가 곁에 있습니다. 끊김 없이 이어져 흐름을 잃지 않습니다.",
  },
  {
    n: "03",
    t: "최신 정보 자동 추적",
    d: "법 개정, 신규 판례, 신규 문제, 논문이 한 곳에 자동 집계됩니다. 매일 무엇이 새로 올라왔는지 한눈에 보입니다.",
  },
  {
    n: "04",
    t: "과목 특성별 학습 구조",
    d: "법률 과목은 조문·판례·문제 3탭, 자연과학은 문제 중심으로 구성됩니다. 같은 시간을 들여도 결이 맞게 학습합니다.",
  },
];

const onEnter: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(-3px)";
  e.currentTarget.style.boxShadow = "var(--lp-shadow-hover)";
};
const onLeave: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "none";
};

export function FeaturesSection() {
  return (
    <section
      aria-labelledby="features-h2"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "72px 24px",
      }}
    >
      <SectionHeader
        eyebrow="WHY LIDAM"
        title="혼자 공부할 때 가장 필요한 것"
        subtitle="흐름을 잃지 않고, 매일 한 걸음씩 나아가요."
      />
      <div
        style={{
          display: "grid",
          gap: 14,
          marginTop: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {CARDS.map((c, i) => (
          <Reveal
            key={c.n}
            delay={i * 70}
            as="article"
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            style={{
              padding: 20,
              background: "var(--card)",
              borderRadius: 8,
              border: `1px solid var(--border)`,
              transition:
                "transform 200ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms cubic-bezier(0.22,1,0.36,1)",
              cursor: "default",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 10,
                background: PALETTE.tint,
                color: PALETTE.link,
                font: "700 13px/1 Pretendard, sans-serif",
                letterSpacing: "0.04em",
                marginBottom: 16,
              }}
            >
              {c.n}
            </div>
            <div
              style={{
                font: "700 17px/1.4 Pretendard, sans-serif",
                color: PALETTE.ink,
                letterSpacing: "-0.018em",
                marginBottom: 8,
              }}
            >
              {c.t}
            </div>
            <div
              style={{
                font: "400 14px/1.65 Pretendard, sans-serif",
                color: PALETTE.inkSoft,
                letterSpacing: "-0.01em",
              }}
            >
              {c.d}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
