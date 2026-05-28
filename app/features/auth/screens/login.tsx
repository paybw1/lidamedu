/**
 * Login Screen — 카카오 전용
 *
 * 로그인 수단은 카카오 OAuth 하나로 통일한다. (이메일/비밀번호·매직링크·OTP·기타 소셜 미제공)
 * 카카오는 신규/기존 구분 없이 동일 OAuth 흐름이므로 회원가입(/join)도 이 화면으로 합류한다.
 * 디자인 토큰은 랜딩(lidam-design-system, Wantedly blue + Pretendard)을 그대로 따른다.
 */
import type { Route } from "./+types/login";

import type { MouseEventHandler } from "react";
import { Link } from "react-router";

import { EASE_REVEAL, PALETTE, Reveal } from "~/features/home/lib/landing";

import { KakaoLogo } from "../components/logos/kakao";

const FONT = "Pretendard, sans-serif";

export const meta: Route.MetaFunction = () => {
  return [
    {
      title: `로그인 | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

const liftEnter: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(-1px)";
  e.currentTarget.style.boxShadow = "0 12px 28px rgba(254, 229, 0, 0.45)";
};
const liftLeave: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "0 8px 22px rgba(254, 229, 0, 0.35)";
};

export default function Login() {
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
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: PALETTE.primary,
              }}
            />
            리담 변리사 학원
          </div>

          <h1
            style={{
              font: `800 26px/1.3 ${FONT}`,
              color: PALETTE.ink,
              letterSpacing: "-0.025em",
              margin: "0 0 10px",
            }}
          >
            다시 오신 걸 환영해요
          </h1>
          <p
            style={{
              font: `400 15px/1.6 ${FONT}`,
              color: PALETTE.inkSoft,
              letterSpacing: "-0.01em",
              margin: "0 0 28px",
            }}
          >
            카카오 계정으로 간편하게 시작하세요.
            <br />
            별도의 회원가입은 필요하지 않아요.
          </p>

          <Link
            to="/auth/social/start/kakao"
            viewTransition
            onMouseEnter={liftEnter}
            onMouseLeave={liftLeave}
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
            카카오로 3초 만에 시작하기
          </Link>

          <p
            style={{
              font: `400 12px/1.7 ${FONT}`,
              color: PALETTE.inkMute,
              letterSpacing: "-0.01em",
              margin: "20px 0 0",
            }}
          >
            로그인 시{" "}
            <Link
              to="/legal/terms-of-service"
              style={{ color: PALETTE.inkSoft, textDecoration: "underline" }}
            >
              이용약관
            </Link>
            과{" "}
            <Link
              to="/legal/privacy-policy"
              style={{ color: PALETTE.inkSoft, textDecoration: "underline" }}
            >
              개인정보처리방침
            </Link>
            에 동의하게 됩니다.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
