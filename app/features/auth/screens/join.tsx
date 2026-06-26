/**
 * Join Screen — Kakao OAuth + 이메일·비밀번호 회원가입.
 *
 * OAuth 진입은 /login 과 동일 (신규/기존 동일 흐름).
 * 이메일·비밀번호는 Supabase signUp — 프로젝트 설정의 이메일 확인 정책을 따른다.
 */
import type { Route } from "./+types/join";

import { type MouseEventHandler, useState } from "react";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { setServiceDataConsent } from "~/features/exam-results/queries.server";
import { EASE_REVEAL, PALETTE, Reveal } from "~/features/home/lib/landing";

import { KakaoLogo } from "../components/logos/kakao";

const FONT = "Pretendard, sans-serif";

export const meta: Route.MetaFunction = () => [
  { title: `회원가입 | 리담변리사학원` },
];

const signupSchema = z.object({
  fullName: z.string().min(1, "이름을 입력해주세요.").max(40),
  email: z.string().email("올바른 이메일 주소를 입력해주세요."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
  // 필수 동의 — 미체크 시 가입 거부 (feat-8-026).
  agreeTos: z.literal("on", {
    errorMap: () => ({ message: "이용약관·개인정보처리방침 동의가 필요합니다." }),
  }),
  agreeData: z.literal("on", {
    errorMap: () => ({ message: "학습 데이터 활용 동의가 필요합니다." }),
  }),
});

export async function action({ request }: Route.ActionArgs) {
  const fd = await request.formData();
  const parsed = signupSchema.safeParse({
    fullName: fd.get("fullName"),
    email: fd.get("email"),
    password: fd.get("password"),
    agreeTos: fd.get("agreeTos"),
    agreeData: fd.get("agreeData"),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." },
      { status: 400 },
    );
  }
  const [client, headers] = makeServerClient(request);
  const { data: signUpData, error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });
  if (error) {
    return data({ error: error.message }, { status: 400 });
  }
  // 필수 동의 기록 (feat-8-026) — best-effort. 세션 미확정 시 실패해도 /consent 게이트가 강제.
  if (signUpData.user) {
    await setServiceDataConsent(client, signUpData.user.id);
  }
  // 이메일 확인 정책에 따라 즉시 로그인 또는 확인 메일 발송. 가입 직후 대시보드로.
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

export default function Join({ actionData }: Route.ComponentProps) {
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
            카카오·이메일 중 편한 방식으로 가입하세요.
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
              marginBottom: 10,
            }}
          >
            <KakaoLogo style={{ width: 20, height: 20 }} />
            카카오로 가입
          </Link>


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
              이메일·비밀번호로 가입
            </button>
          ) : (
            <Form method="post" style={{ textAlign: "left" }}>
              <label
                htmlFor="join-name"
                style={{
                  display: "block",
                  font: `500 12px/1.5 ${FONT}`,
                  color: PALETTE.inkSoft,
                  marginBottom: 4,
                }}
              >
                이름
              </label>
              <input
                id="join-name"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                maxLength={40}
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
                htmlFor="join-email"
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
                id="join-email"
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
                htmlFor="join-password"
                style={{
                  display: "block",
                  font: `500 12px/1.5 ${FONT}`,
                  color: PALETTE.inkSoft,
                  marginBottom: 4,
                }}
              >
                비밀번호 (8자 이상)
              </label>
              <input
                id="join-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
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
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  name="agreeTos"
                  required
                  style={{ marginTop: 3, accentColor: PALETTE.primary }}
                />
                <span style={{ font: `400 12px/1.5 ${FONT}`, color: PALETTE.inkSoft }}>
                  <span style={{ color: PALETTE.primary, fontWeight: 700 }}>[필수]</span>{" "}
                  <Link
                    to="/legal/terms-of-service"
                    target="_blank"
                    style={{ color: PALETTE.inkSoft, textDecoration: "underline" }}
                  >
                    이용약관
                  </Link>{" "}
                  및{" "}
                  <Link
                    to="/legal/privacy-policy"
                    target="_blank"
                    style={{ color: PALETTE.inkSoft, textDecoration: "underline" }}
                  >
                    개인정보처리방침
                  </Link>
                  에 동의합니다.
                </span>
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: 14,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  name="agreeData"
                  required
                  style={{ marginTop: 3, accentColor: PALETTE.primary }}
                />
                <span style={{ font: `400 12px/1.5 ${FONT}`, color: PALETTE.inkSoft }}>
                  <span style={{ color: PALETTE.primary, fontWeight: 700 }}>[필수]</span>{" "}
                  <Link
                    to="/legal/privacy-policy"
                    target="_blank"
                    style={{ color: PALETTE.inkSoft, textDecoration: "underline" }}
                  >
                    학습 데이터 활용
                  </Link>
                  에 동의합니다. (서비스 제공·진단·가명처리 분석)
                </span>
              </label>
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
                {submitting ? "가입 중..." : "가입하기"}
              </button>
              <p
                style={{
                  font: `400 13px/1.5 ${FONT}`,
                  color: PALETTE.inkSoft,
                  textAlign: "center",
                  marginTop: 14,
                }}
              >
                이미 계정이 있으세요?{" "}
                <Link to="/login" style={{ color: PALETTE.primary, textDecoration: "underline" }}>
                  로그인
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
