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

// feat-8-008 — 3-tier 영역 게이팅에 맞춰 includes 정렬.
// 회원1(무료) = 학습정보 + 커뮤니티 / 회원2(정회원) = +학습과목·학습보조 / 회원3(종합반) = +학습관리·모의고사.
const TIERS: Tier[] = [
  {
    label: "무료 · 평생",
    price: "₩0",
    priceUnit: "",
    includes: [
      "최근 판례·법령 개정 피드",
      "1·2차 기출문제 색인",
      "논문·도서 추록 색인",
      "커뮤니티·공지·스터디 모집",
    ],
    cta: "무료로 시작",
    to: "/join",
    variant: "outline",
  },
  {
    label: "정회원 · 자기주도",
    price: "₩99,000",
    priceUnit: "/ 월",
    includes: [
      "무료 전체",
      "조문·판례·문제 본문 학습 (학습과목)",
      "오답노트·하이라이트·메모·암기",
      "조문 트리·맞춤 퀴즈",
      "Q&A·강사 주석 열람",
    ],
    cta: "정회원 시작",
    to: "/pricing",
    variant: "primary",
    recommended: true,
  },
  {
    label: "종합반 · 학원",
    price: "상담 후 결정",
    priceUnit: "",
    includes: [
      "정회원 전체",
      "대시보드·진도·합격 진단 분석",
      "1·2차 모의고사 + 온라인 GS",
      "커리큘럼 + 위클리 과제",
      "강사 첨삭 + 1:1 상담",
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
          "학습정보·커뮤니티는 평생 무료. 조문·판례·문제 본격 학습은 정회원, 합격까지 함께는 종합반."
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
