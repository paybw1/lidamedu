/**
 * Join Screen — 카카오 OAuth + (운영자 토글 시) 이메일·비밀번호 가입.
 *
 * 기본은 카카오 단일. 운영자가 /admin/auth 에서 id/pw 를 켜면 이메일·비밀번호
 * 가입 폼이 함께 노출된다. 필수 동의는 가입 후 /consent 게이트에서 수렴한다.
 */
import type { Route } from "./+types/join";

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
  { title: `회원가입 | 리담변리사학원` },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const passwordLogin = await isPasswordLoginEnabled(client);
  return { passwordLogin };
}

const signupSchema = z.object({
  name: z.string().trim().min(1).max(40),
  email: z.string().email(),
  password: z.string().min(8),
});

// feat-000-017 — 이메일·비밀번호 가입. ★서버 권위: 토글 OFF면 거부.
export async function action({ request }: Route.ActionArgs) {
  const [client, headers] = makeServerClient(request);
  if (!(await isPasswordLoginEnabled(client))) {
    return data(
      { error: "이메일 가입이 비활성화되어 있습니다." },
      { status: 403 },
    );
  }
  const fd = await request.formData();
  const parsed = signupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    return data(
      { error: "이름·이메일·비밀번호(8자 이상)를 확인해 주세요." },
      { status: 400 },
    );
  }
  const origin = new URL(request.url).origin;
  const { data: signUpData, error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: `${origin}/auth/confirm?type=email`,
    },
  });
  if (error) {
    return data(
      { error: "가입에 실패했습니다. 이미 가입된 이메일인지 확인해 주세요." },
      { status: 400 },
    );
  }
  // 이메일 확인 필요(세션 없음) → 안내. 자동 확인(세션 있음) → 단일세션 등록 후 진입.
  if (!signUpData.session) {
    return data({ ok: true as const, needsConfirm: true as const });
  }
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user) {
    await claimSession(client, request, headers);
    try {
      await client.auth.signOut({ scope: "others" });
    } catch {
      /* 보조 */
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

export default function Join({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const error = actionData && "error" in actionData ? actionData.error : null;
  const needsConfirm =
    actionData && "needsConfirm" in actionData && actionData.needsConfirm;

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

          {/* feat-000-017 — 운영자가 켠 경우에만 이메일·비밀번호 가입 노출 */}
          {loaderData.passwordLogin ? (
            needsConfirm ? (
              <div
                style={{
                  marginTop: 22,
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: PALETTE.tint,
                  border: `1px solid ${PALETTE.line}`,
                  color: PALETTE.ink,
                  font: `500 13px/1.6 ${FONT}`,
                  textAlign: "left",
                }}
              >
                입력하신 이메일로 <strong>가입 확인 메일</strong>을 보냈습니다.
                메일의 링크를 클릭해 인증을 완료한 뒤 로그인해 주세요.
              </div>
            ) : (
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
                  <span style={{ font: `500 12px/1 ${FONT}`, color: PALETTE.inkMute }}>
                    또는 이메일로 가입
                  </span>
                  <span style={{ flex: 1, height: 1, background: PALETTE.line }} />
                </div>
                {/* 이메일 가입은 심사용 임시 개방 — 신규 가입은 카카오로 유도 */}
                <div
                  style={{
                    marginBottom: 14,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    color: PALETTE.ink,
                    font: `500 12.5px/1.6 ${FONT}`,
                    textAlign: "left",
                  }}
                >
                  이메일·비밀번호 가입은 <strong>내부 심사를 위해 임시로 열어 둔
                  것</strong>으로, 정상적인 가입이 어려울 수 있습니다. 신규
                  가입은 위의 <strong>카카오로 시작하기</strong>를 이용해
                  주세요.
                </div>
                <Form method="post" style={{ textAlign: "left" }}>
                  <input
                    type="text"
                    name="name"
                    required
                    maxLength={40}
                    autoComplete="name"
                    placeholder="이름"
                    className="border-input bg-background mb-2 h-11 w-full rounded-lg border px-3 text-sm"
                  />
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
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="비밀번호 (8자 이상)"
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
                    {submitting ? "가입 중…" : "이메일로 가입"}
                  </button>
                </Form>
              </>
            )
          ) : null}

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
            가입 시{" "}
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
