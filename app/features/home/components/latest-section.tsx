import type { MouseEventHandler } from "react";

import { ArrowRightIcon } from "lucide-react";
import { Link } from "react-router";

import { SectionHeader } from "~/features/home/components/section-header";
import type { LatestFeedItem } from "~/features/home/latest-feed.server";
import { PALETTE, Reveal } from "~/features/home/lib/landing";

const onEnter: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(-2px)";
  e.currentTarget.style.boxShadow = "var(--lp-shadow-hover)";
  const arrow = e.currentTarget.querySelector(".latest-arrow");
  const cat = e.currentTarget.querySelector(".latest-cat");
  if (arrow instanceof HTMLElement) arrow.style.transform = "translateX(3px)";
  if (cat instanceof HTMLElement) cat.style.color = PALETTE.link;
};
const onLeave: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "none";
  const arrow = e.currentTarget.querySelector(".latest-arrow");
  const cat = e.currentTarget.querySelector(".latest-cat");
  if (arrow instanceof HTMLElement) arrow.style.transform = "translateX(0)";
  if (cat instanceof HTMLElement) cat.style.color = PALETTE.inkSoft;
};

export function LatestSection({ items }: { items: LatestFeedItem[] }) {
  if (items.length === 0) return null;
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
          "법 개정 · 신규 판례 · 신규 문제 · 도서 추록까지 한 곳에 모입니다.\n즐겨찾기한 조문이 개정되면 알림으로 알려드려요."
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
        {items.map((it, i) => (
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
