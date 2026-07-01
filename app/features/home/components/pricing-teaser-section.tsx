import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { Link } from "react-router";

import { SectionHeader } from "~/features/home/components/section-header";
import {
  type ButtonVariant,
  LandingButton,
  PALETTE,
  Reveal,
} from "~/features/home/lib/landing";

interface Tier {
  label: string;
  price: string;
  priceUnit: string;
  includes: string[];
  cta: string;
  to: string;
  variant: ButtonVariant;
  recommended?: boolean;
  note?: string;
}

// feat-8-027/8-028 — 등급·과목별 상품 구조에 맞춘 티저.
// 무료회원 = 커뮤니티·학습정보 / 자기학습 = 과목별 결제(학습과목·학습보조·학습관리) / 종합반 = 전체.
const TIERS: Tier[] = [
  {
    label: "무료회원 · 평생",
    price: "₩0",
    priceUnit: "",
    includes: [
      "질의응답",
      "자유게시판",
      "스터디모집",
      "기출문제",
      "최근 판례·법 개정",
    ],
    note: "가입 후 15일간 특허법 학습과목 무료 체험",
    cta: "무료로 시작",
    to: "/join",
    variant: "outline",
  },
  {
    label: "자기학습 · 과목/번들",
    price: "과목별",
    priceUnit: "결제",
    includes: [
      "조문·판례·문제 본문 학습 (결제 과목)",
      "자연과학 기본 포함",
      "오답노트·하이라이트·코멘트·암기",
      "학습관리 (대시보드·진도)",
    ],
    note: "필요한 과목만 · 산업재산권법/전체 통합 번들 제공",
    cta: "요금제 보기",
    to: "/pricing",
    variant: "primary",
    recommended: true,
  },
  {
    label: "종합반 · 학원",
    price: "상담 후 결정",
    priceUnit: "",
    includes: [
      "자기학습 전체",
      "1차 모의고사",
      "커리큘럼 + 위클리 과제",
      "1:1 상담",
      "반별 게시판",
    ],
    note: "2차 모의고사·온라인 GS는 별도 프로그램",
    cta: "학원 상담",
    to: "/contact",
    variant: "outline",
  },
];

interface BundleTeaser {
  name: string;
  base: number;
  effective: number;
  learnNote: string | null;
}

export function PricingTeaserSection({
  bundleTeaser,
}: {
  bundleTeaser: BundleTeaser | null;
}) {
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
          "커뮤니티·학습정보는 평생 무료, 가입 후 15일은 특허법을 무료로 체험합니다. 조문·판례·문제 학습은 필요한 과목만 결제하고, 합격까지 함께라면 종합반입니다."
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
              background: "var(--card)",
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
                  color: PALETTE.link,
                  marginBottom: 10,
                }}
              >
                {t.label}
              </div>
              {t.recommended && bundleTeaser ? (
                <>
                  <div
                    style={{
                      font: "700 11px/1 Pretendard, sans-serif",
                      color: PALETTE.link,
                      marginBottom: 5,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {bundleTeaser.name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      flexWrap: "wrap",
                      gap: 8,
                      font: "800 32px/1 Pretendard, sans-serif",
                      letterSpacing: "-0.025em",
                      fontVariantNumeric: "tabular-nums",
                      color: PALETTE.ink,
                    }}
                  >
                    <span>₩{bundleTeaser.effective.toLocaleString("ko-KR")}</span>
                    {bundleTeaser.effective < bundleTeaser.base ? (
                      <span
                        style={{
                          fontSize: 16,
                          color: PALETTE.inkSoft,
                          textDecoration: "line-through",
                          letterSpacing: 0,
                        }}
                      >
                        ₩{bundleTeaser.base.toLocaleString("ko-KR")}
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      font: "500 12px/1.45 Pretendard, sans-serif",
                      color: PALETTE.inkSoft,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {bundleTeaser.effective < bundleTeaser.base
                      ? `₩${(bundleTeaser.base - bundleTeaser.effective).toLocaleString("ko-KR")} 할인 · `
                      : ""}
                    과목별 결제도 가능
                    {bundleTeaser.learnNote
                      ? ` · ${bundleTeaser.learnNote}`
                      : ""}
                  </div>
                </>
              ) : (
                <>
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
                  {t.note ? (
                    <div
                      style={{
                        marginTop: 8,
                        font: "500 12px/1.45 Pretendard, sans-serif",
                        color: PALETTE.inkSoft,
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {t.note}
                    </div>
                  ) : null}
                </>
              )}
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
                      color: PALETTE.link,
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
