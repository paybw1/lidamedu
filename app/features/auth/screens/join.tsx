/**
 * Join Screen — 카카오 OAuth 단일 회원가입.
 *
 * 이메일·비밀번호·구글 진입 제거 — 가입은 카카오로만. 수집 항목(닉네임·프로필 사진·
 * 카카오계정 이메일·이름·전화번호·배송지)은 카카오 동의항목으로 받는다(start.tsx scope).
 * 필수 동의(이용약관·개인정보·학습 데이터)는 가입 후 /consent 게이트에서 수렴한다.
 */
import type { Route } from "./+types/join";

import type { MouseEventHandler } from "react";
import { Link } from "react-router";

import { EASE_REVEAL, PALETTE, Reveal } from "~/features/home/lib/landing";

import { KakaoLogo } from "../components/logos/kakao";

const FONT = "Pretendard, sans-serif";

export const meta: Route.MetaFunction = () => [
  { title: `회원가입 | 리담변리사학원` },
];

const liftKakao: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(-1px)";
  e.currentTarget.style.boxShadow = "0 12px 28px rgba(254, 229, 0, 0.45)";
};
const liftKakaoLeave: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "0 8px 22px rgba(254, 229, 0, 0.35)";
};

export default function Join() {
  return (
    <section
      style={{
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: `radial-gradient(120% 80% at 50% 0%, ${PALETTE.tint} 0%, transparent 60%)`,
      }}
    >
      <Reveal>
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: PALETTE.base,
            borderRadius: 20,
            border: `1px solid ${PALETTE.line}`,
            boxShadow: "0 16px 48px rgba(0,0,0,0.08)",
            padding: "44px 36px 32px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              background: PALETTE.tint,
              color: PALETTE.primary,
              borderRadius: 9999,
              font: `600 11px/1 ${FONT}`,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 22,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: PALETTE.primary }} />
            리담변리사학원
          </div>

          <h1
            style={{
              font: `800 26px/1.3 ${FONT}`,
              color: PALETTE.ink,
              letterSpacing: "-0.025em",
              margin: "0 0 10px",
            }}
          >
            회원가입
          </h1>
          <p
            style={{
              font: `400 15px/1.6 ${FONT}`,
              color: PALETTE.inkSoft,
              letterSpacing: "-0.01em",
              margin: "0 0 28px",
            }}
          >
            카카오로 간편하게 가입하세요.
          </p>

          <Link
            to="/auth/social/start/kakao"
            viewTransition
            onMouseEnter={liftKakao}
            onMouseLeave={liftKakaoLeave}
            style={{
              display: "flex",
              width: "100%",
              height: 52,
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 12,
              background: "#FEE500",
              color: "#191600",
              font: `700 15px/1 ${FONT}`,
              letterSpacing: "-0.01em",
              textDecoration: "none",
              boxShadow: "0 8px 22px rgba(254, 229, 0, 0.35)",
              transition: `transform 160ms ${EASE_REVEAL}, box-shadow 160ms ${EASE_REVEAL}`,
            }}
          >
            <KakaoLogo style={{ width: 20, height: 20 }} />
            카카오로 시작하기
          </Link>

          <p
            style={{
              font: `400 13px/1.5 ${FONT}`,
              color: PALETTE.inkSoft,
              textAlign: "center",
              marginTop: 18,
            }}
          >
            이미 계정이 있으세요?{" "}
            <Link to="/login" style={{ color: PALETTE.primary, textDecoration: "underline" }}>
              로그인
            </Link>
          </p>

          <p
            style={{
              font: `400 12px/1.7 ${FONT}`,
              color: PALETTE.inkMute,
              letterSpacing: "-0.01em",
              margin: "16px 0 0",
            }}
          >
            카카오로 가입 시{" "}
            <Link to="/legal/terms-of-service" style={{ color: PALETTE.inkSoft, textDecoration: "underline" }}>
              이용약관
            </Link>
            ·{" "}
            <Link to="/legal/privacy-policy" style={{ color: PALETTE.inkSoft, textDecoration: "underline" }}>
              개인정보처리방침
            </Link>{" "}
            및 학습 데이터 활용에 동의하게 됩니다.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
