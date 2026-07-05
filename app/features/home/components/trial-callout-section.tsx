// feat-8-027 — 신규 가입 무료 15일 체험 안내. Hero 직후 콜아웃.
import { ArrowRightIcon, CheckIcon, GiftIcon } from "lucide-react";

import { LandingButton, PALETTE, Reveal } from "~/features/home/lib/landing";

const POINTS = ["15일 무료 이용", "특허법 학습과목 전체", "카드 등록 없이 시작"];

export function TrialCalloutSection() {
  return (
    <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
      <Reveal
        as="div"
        style={{
          borderRadius: 20,
          border: `2px solid ${PALETTE.primary}`,
          background: "var(--secondary)",
          padding: "clamp(20px, 3vw, 28px)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          boxShadow: "0 16px 40px rgba(45, 91, 168, 0.10)",
        }}
      >
        <div style={{ flex: "1 1 340px", minWidth: 0 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              font: "700 12px/1 Pretendard, sans-serif",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: PALETTE.link,
              marginBottom: 10,
            }}
          >
            <GiftIcon size={14} strokeWidth={2} /> 무료 체험 이벤트
          </div>
          <h2
            style={{
              font: "800 clamp(22px, 3vw, 30px)/1.2 Pretendard, sans-serif",
              letterSpacing: "-0.02em",
              color: PALETTE.ink,
              margin: "0 0 8px",
            }}
          >
            가입하고 특허법 학습을 무료로 체험해 보세요
          </h2>
          <p
            style={{
              font: "400 15px/1.6 Pretendard, sans-serif",
              color: PALETTE.inkSoft,
              letterSpacing: "-0.005em",
              maxWidth: 620,
              margin: "0 0 12px",
            }}
          >
            신규 가입 시 15일 동안 특허법 학습과목(조문·판례·문제)을 무료로
            이용할 수 있습니다.
            <br />
            체험이 끝나면 원하는 과목만 결제해 계속 학습하면 됩니다.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {POINTS.map((p) => (
              <span
                key={p}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 12px",
                  borderRadius: 9999,
                  background: "var(--card)",
                  border: `1px solid ${PALETTE.line}`,
                  font: "500 13px/1 Pretendard, sans-serif",
                  color: PALETTE.ink,
                }}
              >
                <span style={{ color: PALETTE.link, display: "inline-flex" }}>
                  <CheckIcon size={13} strokeWidth={2.5} />
                </span>
                {p}
              </span>
            ))}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <LandingButton
            variant="primary"
            size="lg"
            to="/join"
            iconRight={<ArrowRightIcon size={16} strokeWidth={1.8} />}
          >
            무료로 시작하기
          </LandingButton>
        </div>
      </Reveal>
    </section>
  );
}
