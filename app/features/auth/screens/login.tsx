/**
 * Login Screen — 카카오 OAuth + (운영자 토글 시) 이메일·비밀번호.
 *
 * 기본은 카카오 단일. 운영자가 /admin/auth 에서 id/pw 를 켜면 이메일·비밀번호
 * 로그인 폼이 함께 노출된다. 디자인 토큰은 랜딩(lidam-design-system)을 따른다.
 */
import type { Route } from "./+types/login";

import type { MouseEventHandler } from "react";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import { z } from "zod";

import { claimSession } from "~/core/lib/single-session.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { isPasswordLoginEnabled } from "~/features/auth/settings.server";
import { EASE_REVEAL, PALETTE, Reveal } from "~/features/home/lib/landing";

import { KakaoLogo } from "../components/logos/kakao";

const FONT = "Pretendard, sans-serif";

export const meta: Route.MetaFunction = () => [
  { title: `로그인 | 리담변리사학원` },
];

// feat-000-016 — 다른 기기 로그인으로 추방된 경우 안내 배너를 띄운다.
export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const reason = new URL(request.url).searchParams.get("reason");
  const passwordLogin = await isPasswordLoginEnabled(client);
  return { otherDevice: reason === "other-device", passwordLogin };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// feat-000-017 — 이메일·비밀번호 로그인. ★서버 권위: 토글 OFF면 거부(UI 숨김만 불충분).
export async function action({ request }: Route.ActionArgs) {
  const [client, headers] = makeServerClient(request);
  if (!(await isPasswordLoginEnabled(client))) {
    return data(
      { error: "이메일 로그인이 비활성화되어 있습니다." },
      { status: 403 },
    );
  }
  const fd = await request.formData();
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    return data(
      { error: "이메일과 비밀번호를 확인해 주세요." },
      { status: 400 },
    );
  }
  const { error } = await client.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return data(
      { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
      { status: 400 },
    );
  }
  // 단일 세션(feat-000-016): 현재 세션을 유효 세션으로 등록 + 이전 기기 폐기(카카오와 동일).
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user) {
    await claimSession(client, request, headers);
    try {
      await client.auth.signOut({ scope: "others" });
    } catch {
      /* 보조 수단 — 핵심 차단은 claimSession + 레이아웃 검사 */
    }
  }
  return redirect("/", { headers });
}

const liftKakao: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(-1px)";
  e.currentTarget.style.boxShadow = "0 12px 28px rgba(254, 229, 0, 0.45)";
};
const liftKakaoLeave: MouseEventHandler<HTMLElement> = (e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "0 8px 22px rgba(254, 229, 0, 0.35)";
};

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const error =
    actionData && "error" in actionData ? actionData.error : null;

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
          {loaderData.otherDevice ? (
            <div
              style={{
                marginBottom: 20,
                padding: "12px 14px",
                borderRadius: 12,
                background: PALETTE.tint,
                border: `1px solid ${PALETTE.line}`,
                color: PALETTE.ink,
                font: `500 13px/1.6 ${FONT}`,
                letterSpacing: "-0.01em",
                textAlign: "left",
              }}
            >
              다른 기기에서 로그인되어 이 기기에서는 자동 로그아웃되었습니다. 본인이
              맞다면 다시 로그인해 주세요.
            </div>
          ) : null}

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              background: PALETTE.primary,
              color: "#fff",
              borderRadius: 9999,
              font: `700 12px/1 ${FONT}`,
              letterSpacing: "0.1em",
              marginBottom: 22,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />
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
            카카오로 간편하게 시작하세요.
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

          {/* feat-000-017 — 운영자가 켠 경우에만 이메일·비밀번호 로그인 노출 */}
          {loaderData.passwordLogin ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  margin: "22px 0 18px",
                }}
              >
                <span style={{ flex: 1, height: 1, background: PALETTE.line }} />
                <span
                  style={{
                    font: `500 12px/1 ${FONT}`,
                    color: PALETTE.inkMute,
                  }}
                >
                  또는 이메일로 로그인
                </span>
                <span style={{ flex: 1, height: 1, background: PALETTE.line }} />
              </div>
              <Form method="post" style={{ textAlign: "left" }}>
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="이메일"
                  className="border-input bg-background mb-2 h-11 w-full rounded-lg border px-3 text-sm"
                />
                <input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder="비밀번호"
                  className="border-input bg-background h-11 w-full rounded-lg border px-3 text-sm"
                />
                {error ? (
                  <p
                    style={{
                      font: `500 12px/1.5 ${FONT}`,
                      color: "#dc2626",
                      margin: "8px 2px 0",
                    }}
                  >
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-primary text-primary-foreground mt-3 h-11 w-full rounded-lg text-sm font-bold disabled:opacity-60"
                >
                  {submitting ? "로그인 중…" : "이메일로 로그인"}
                </button>
              </Form>
              <div style={{ marginTop: 12 }}>
                <Link
                  to="/forgot-password"
                  style={{
                    font: `500 12px/1 ${FONT}`,
                    color: PALETTE.inkSoft,
                    textDecoration: "underline",
                  }}
                >
                  비밀번호를 잊으셨나요?
                </Link>
              </div>
            </>
          ) : null}

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
