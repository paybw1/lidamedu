import type { MouseEventHandler } from "react";

import { ArrowRightIcon } from "lucide-react";
import { Link } from "react-router";

import { SectionHeader } from "~/features/home/components/section-header";
import { PALETTE, Reveal } from "~/features/home/lib/landing";

const ITEMS = [
  {
    cat: "법 개정",
    dot: "#5C7F6A",
    body: "특허법 제29조 — 2026.01.15. 시행",
    to: "/latest/laws",
  },
  {
    cat: "최근 판례",
    dot: "#7B6BA0",
    body: "대법원 2025다123456 — 균등론 적용 범위",
    to: "/latest/cases",
  },
  {
    cat: "1차 기출문제",
    dot: "#A77B3F",
    body: "2026년 모의고사 — 상표법 240제 추가",
    to: "/latest/mcq?kind=past_exam",
  },
  {
    cat: "2차 기출문제",
    dot: "#C97D5B",
    body: "2026 GS 2회 — 디자인보호법 사례형",
    to: "/latest/essay",
  },
  {
    cat: "논문",
    dot: "#2D5BA8",
    body: "직접침해와 간접침해의 경계 — 김OO 교수",
    to: "/latest/papers",
  },
  {
    cat: "추록·정오표",
    dot: "#8B5A2B",
    body: "변리사법 강의 4판 — 정오표 v1.2",
    to: "/latest/book-updates",
  },
];

const onEnter: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(-2px)";
  e.currentTarget.style.boxShadow = "var(--lp-shadow-hover)";
  const arrow = e.currentTarget.querySelector(".latest-arrow");
  const cat = e.currentTarget.querySelector(".latest-cat");
  if (arrow instanceof HTMLElement) arrow.style.transform = "translateX(3px)";
  if (cat instanceof HTMLElement) cat.style.color = PALETTE.primary;
};
const onLeave: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "none";
  const arrow = e.currentTarget.querySelector(".latest-arrow");
  const cat = e.currentTarget.querySelector(".latest-cat");
  if (arrow instanceof HTMLElement) arrow.style.transform = "translateX(0)";
  if (cat instanceof HTMLElement) cat.style.color = PALETTE.inkSoft;
};

export function LatestSection() {
  return (
    <section
      aria-labelledby="latest-h2"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "72px 24px",
      }}
    >
      <SectionHeader
        eyebrow="LATEST"
        title="매일 무엇이 새로 올라왔는지, 한 화면에"
        subtitle={
          "법 개정 · 신규 판례 · 신규 문제 · 논문 · 도서 추록까지.\n즐겨찾기한 조문이 개정되면 알림으로 알려드려요."
        }
      />
      <div
        style={{
          display: "grid",
          gap: 12,
          marginTop: 32,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        {ITEMS.map((it, i) => (
          <Reveal
            key={it.cat}
            delay={i * 70}
            style={{
              padding: 0,
              background: "transparent",
            }}
          >
            <Link
              to={it.to}
              onMouseEnter={onEnter}
              onMouseLeave={onLeave}
              style={{
                padding: 18,
                background: "var(--card)",
                borderRadius: 16,
                border: `1px solid var(--border)`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                textDecoration: "none",
                color: "inherit",
                transition:
                  "transform 200ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms cubic-bezier(0.22,1,0.36,1), border-color 200ms ease",
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: it.dot,
                    }}
                  />
                  <span
                    className="latest-cat"
                    style={{
                      font: "600 12px/1 Pretendard, sans-serif",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: PALETTE.inkSoft,
                      transition: "color 200ms ease",
                    }}
                  >
                    {it.cat}
                  </span>
                </div>
                <span
                  className="latest-arrow"
                  style={{
                    color: PALETTE.inkSoft,
                    transition: "transform 200ms ease",
                    display: "inline-flex",
                  }}
                >
                  <ArrowRightIcon size={16} strokeWidth={1.8} />
                </span>
              </div>
              <div
                style={{
                  font: "500 15px/1.5 Pretendard, sans-serif",
                  color: PALETTE.ink,
                  letterSpacing: "-0.012em",
                }}
              >
                {it.body}
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
