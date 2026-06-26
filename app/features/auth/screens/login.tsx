/**
 * Login Screen — Kakao / Google OAuth + 이메일·비밀번호.
 *
 * 진입 방식 3가지:
 *  1) 카카오 OAuth (기본)
 *  2) 구글 OAuth
 *  3) 이메일 + 비밀번호 (Supabase email/password auth)
 *
 * 가입 화면(/join)도 동일 세 가지 진입. 디자인 토큰은 랜딩(lidam-design-system)을 따른다.
 */
import type { Route } from "./+types/login";

import { type MouseEventHandler, useState } from "react";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { EASE_REVEAL, PALETTE, Reveal } from "~/features/home/lib/landing";

import { GoogleLogo } from "../components/logos/google";
import { KakaoLogo } from "../components/logos/kakao";

const FONT = "Pretendard, sans-serif";

export const meta: Route.MetaFunction = () => [
  { title: `로그인 | 리담변리사학원` },
];

const credentialsSchema = z.object({
  email: z.string().email("올바른 이메일 주소를 입력해주세요."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
});

export async function action({ request }: Route.ActionArgs) {
  const fd = await request.formData();
  const parsed = credentialsSchema.safeParse({
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." },
      { status: 400 },
    );
  }
  const [client, headers] = makeServerClient(request);
  const { error } = await client.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return data({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 400 });
  }
  return redirect("/dashboard", { headers });
}

const liftKakao: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(-1px)";
  e.currentTarget.style.boxShadow = "0 12px 28px rgba(254, 229, 0, 0.45)";
};
const liftKakaoLeave: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "0 8px 22px rgba(254, 229, 0, 0.35)";
};

export default function Login({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state !== "idle" && nav.formMethod === "POST";
  const error = actionData && "error" in actionData ? actionData.error : null;
  const [showEmail, setShowEmail] = useState(false);

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
            다시 오신 것을 환영합니다
          </h1>
          <p
            style={{
              font: `400 15px/1.6 ${FONT}`,
              color: PALETTE.inkSoft,
              letterSpacing: "-0.01em",
              margin: "0 0 28px",
            }}
          >
            카카오·구글·이메일 중 편한 방식으로 시작하세요.
          </p>

          {/* 1) Kakao OAuth */}
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
              marginBottom: 10,
            }}
          >
            <KakaoLogo style={{ width: 20, height: 20 }} />
            카카오로 시작하기
          </Link>

          {/* 2) Google OAuth */}
          <Link
            to="/auth/social/start/google"
            viewTransition
            style={{
              display: "flex",
              width: "100%",
              height: 52,
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 12,
              background: "#fff",
              color: "#1f1f1f",
              font: `600 15px/1 ${FONT}`,
              letterSpacing: "-0.01em",
              textDecoration: "none",
              border: `1px solid ${PALETTE.line}`,
              marginBottom: 18,
            }}
          >
            <GoogleLogo style={{ width: 18, height: 18 }} />
            구글로 시작하기
          </Link>

          {/* 3) Email + Password */}
          {!showEmail ? (
            <button
              type="button"
              onClick={() => setShowEmail(true)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: PALETTE.inkSoft,
                font: `500 13px/1.5 ${FONT}`,
                textDecoration: "underline",
              }}
            >
              이메일·비밀번호로 로그인
            </button>
          ) : (
            <Form method="post" style={{ textAlign: "left" }}>
              <label
                htmlFor="login-email"
                style={{
                  display: "block",
                  font: `500 12px/1.5 ${FONT}`,
                  color: PALETTE.inkSoft,
                  marginBottom: 4,
                }}
              >
                이메일
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                style={{
                  width: "100%",
                  height: 44,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: `1px solid ${PALETTE.line}`,
                  font: `400 15px/1 ${FONT}`,
                  color: PALETTE.ink,
                  marginBottom: 12,
                  background: PALETTE.base,
                }}
              />
              <label
                htmlFor="login-password"
                style={{
                  display: "block",
                  font: `500 12px/1.5 ${FONT}`,
                  color: PALETTE.inkSoft,
                  marginBottom: 4,
                }}
              >
                비밀번호
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                style={{
                  width: "100%",
                  height: 44,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: `1px solid ${PALETTE.line}`,
                  font: `400 15px/1 ${FONT}`,
                  color: PALETTE.ink,
                  marginBottom: 14,
                  background: PALETTE.base,
                }}
              />
              {error ? (
                <p
                  style={{
                    font: `500 12px/1.4 ${FONT}`,
                    color: "#c2410c",
                    margin: "0 0 10px",
                  }}
                >
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 10,
                  background: PALETTE.primary,
                  color: "#fff",
                  font: `700 15px/1 ${FONT}`,
                  border: "none",
                  cursor: submitting ? "wait" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "로그인 중..." : "로그인"}
              </button>
              <p
                style={{
                  font: `400 13px/1.5 ${FONT}`,
                  color: PALETTE.inkSoft,
                  textAlign: "center",
                  marginTop: 14,
                }}
              >
                <Link
                  to="/forgot-password"
                  style={{ color: PALETTE.inkSoft, textDecoration: "underline" }}
                >
                  비밀번호를 잊으셨나요?
                </Link>
              </p>
              <p
                style={{
                  font: `400 13px/1.5 ${FONT}`,
                  color: PALETTE.inkSoft,
                  textAlign: "center",
                  marginTop: 6,
                }}
              >
                계정이 없으세요?{" "}
                <Link to="/join" style={{ color: PALETTE.primary, textDecoration: "underline" }}>
                  회원가입
                </Link>
              </p>
            </Form>
          )}

          <p
            style={{
              font: `400 12px/1.7 ${FONT}`,
              color: PALETTE.inkMute,
              letterSpacing: "-0.01em",
              margin: "20px 0 0",
            }}
          >
            로그인 시{" "}
            <Link to="/legal/terms-of-service" style={{ color: PALETTE.inkSoft, textDecoration: "underline" }}>
              이용약관
            </Link>
            과{" "}
            <Link to="/legal/privacy-policy" style={{ color: PALETTE.inkSoft, textDecoration: "underline" }}>
              개인정보처리방침
            </Link>
            에 동의하게 됩니다.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
