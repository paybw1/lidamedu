import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { Link } from "react-router";

import {
  type ButtonVariant,
  LandingButton,
  PALETTE,
  Reveal,
} from "~/features/home/lib/landing";
import { SectionHeader } from "~/features/home/components/section-header";

interface Tier {
  label: string;
  price: string;
  priceUnit: string;
  includes: string[];
  cta: string;
  to: string;
  variant: ButtonVariant;
  recommended?: boolean;
}

const TIERS: Tier[] = [
  {
    label: "무료 · 평생",
    price: "₩0",
    priceUnit: "",
    includes: [
      "조문/판례/문제 열람",
      "메모·하이라이트·즐겨찾기",
      "기본 진도 추적",
      "학습 통계",
    ],
    cta: "무료로 시작",
    to: "/join",
    variant: "outline",
  },
  {
    label: "PRO · 자기주도 구독",
    price: "₩99,000",
    priceUnit: "/ 월",
    includes: [
      "무료 전체",
      "합격자 평균 비교",
      "자동 추천 액션",
      "12주 학습 곡선",
      "합격 후기 열람",
      "합격 진단 점수",
    ],
    cta: "14일 둘러보기",
    to: "/pricing",
    variant: "primary",
    recommended: true,
  },
  {
    label: "학원 종합반",
    price: "상담 후 결정",
    priceUnit: "",
    includes: [
      "자기주도 전체",
      "N주 커리큘럼",
      "자동 주간 과제",
      "강사 첨삭",
      "온라인 GS 채점",
      "반 진도 관리",
    ],
    cta: "학원 상담",
    to: "/contact",
    variant: "outline",
  },
];

export function PricingTeaserSection() {
  return (
    <section
      aria-labelledby="pricing-h2"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "72px 24px",
      }}
    >
      <SectionHeader
        eyebrow="PRICING"
        title="필요한 만큼만, 합리적으로"
        subtitle={
          "기본 학습은 평생 무료. 합격자 비교 컨설팅이 필요해진 시점에 자기주도 구독을 시작하세요."
        }
      />
      <div
        style={{
          display: "grid",
          gap: 14,
          marginTop: 32,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          alignItems: "stretch",
        }}
      >
        {TIERS.map((t, i) => (
          <Reveal
            key={t.label}
            delay={i * 90}
            as="article"
            style={{
              padding: 24,
              background: "#fff",
              borderRadius: 16,
              border: t.recommended
                ? `2px solid ${PALETTE.primary}`
                : `1px solid ${PALETTE.line}`,
              position: "relative",
              transform: t.recommended ? "scale(1.02)" : "scale(1)",
              boxShadow: t.recommended
                ? "0 16px 40px rgba(45, 91, 168, 0.18)"
                : "none",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {t.recommended ? (
              <div
                style={{
                  position: "absolute",
                  top: -12,
                  left: 24,
                  background: PALETTE.primary,
                  color: "#fff",
                  padding: "4px 12px",
                  borderRadius: 9999,
                  font: "700 11px/1 Pretendard, sans-serif",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                추천
              </div>
            ) : null}
            <div>
              <div
                style={{
                  font: "600 12px/1 Pretendard, sans-serif",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: PALETTE.primary,
                  marginBottom: 10,
                }}
              >
                {t.label}
              </div>
              <div
                style={{
                  font: "800 32px/1 Pretendard, sans-serif",
                  letterSpacing: "-0.025em",
                  fontVariantNumeric: "tabular-nums",
                  color: PALETTE.ink,
                }}
              >
                {t.price}
                {t.priceUnit ? (
                  <span
                    style={{
                      fontSize: 14,
                      color: PALETTE.inkSoft,
                      marginLeft: 4,
                      letterSpacing: 0,
                    }}
                  >
                    {t.priceUnit}
                  </span>
                ) : null}
              </div>
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                flex: 1,
              }}
            >
              {t.includes.map((inc) => (
                <li
                  key={inc}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    font: "400 14px/1.5 Pretendard, sans-serif",
                    color: PALETTE.ink,
                    letterSpacing: "-0.005em",
                  }}
                >
                  <span
                    style={{
                      color: PALETTE.primary,
                      flexShrink: 0,
                      display: "inline-flex",
                    }}
                  >
                    <CheckIcon size={14} strokeWidth={2.5} />
                  </span>
                  {inc}
                </li>
              ))}
            </ul>
            <LandingButton
              variant={t.variant}
              size="md"
              to={t.to}
              fullWidth
              iconRight={<ArrowRightIcon size={16} strokeWidth={1.8} />}
            >
              {t.cta}
            </LandingButton>
          </Reveal>
        ))}
      </div>
      <Reveal delay={400}>
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Link
            to="/pricing"
            style={{
              font: "500 13px/1 Pretendard, sans-serif",
              color: PALETTE.inkSoft,
              letterSpacing: "-0.01em",
              textDecoration: "none",
              borderBottom: `1px solid ${PALETTE.inkSoft}`,
              paddingBottom: 2,
            }}
          >
            요금제 비교 자세히 보기 →
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
