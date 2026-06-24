/**
 * Forgot Password — 이메일 입력 → Supabase resetPasswordForEmail 발송.
 * 재설정 링크 클릭 시 /new-password 로 임시 세션과 함께 이동.
 */
import type { Route } from "./+types/forgot-password";

import { Form, Link, data, useNavigation } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { PALETTE, Reveal } from "~/features/home/lib/landing";

const FONT = "Pretendard, sans-serif";

export const meta: Route.MetaFunction = () => [
  { title: `비밀번호 재설정 | 리담변리사학원` },
];

const schema = z.object({
  email: z.string().email("올바른 이메일 주소를 입력해주세요."),
});

export async function action({ request }: Route.ActionArgs) {
  const fd = await request.formData();
  const parsed = schema.safeParse({ email: fd.get("email") });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "이메일을 확인해주세요." },
      { status: 400 },
    );
  }
  const [client] = makeServerClient(request);
  const siteUrl = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  const { error } = await client.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/new-password`,
  });
  if (error) {
    return data({ error: error.message }, { status: 400 });
  }
  return data({ ok: true });
}

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state !== "idle" && nav.formMethod === "POST";
  const sent = actionData && "ok" in actionData ? actionData.ok : false;
  const error = actionData && "error" in actionData ? actionData.error : null;

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
          <h1
            style={{
              font: `800 24px/1.3 ${FONT}`,
              color: PALETTE.ink,
              letterSpacing: "-0.025em",
              margin: "0 0 10px",
            }}
          >
            비밀번호 재설정
          </h1>
          <p
            style={{
              font: `400 14px/1.6 ${FONT}`,
              color: PALETTE.inkSoft,
              margin: "0 0 24px",
            }}
          >
            가입한 이메일로 재설정 링크를 보내드립니다.
          </p>

          {sent ? (
            <div
              style={{
                background: PALETTE.tint,
                color: PALETTE.primary,
                borderRadius: 12,
                padding: "16px 14px",
                font: `500 14px/1.5 ${FONT}`,
              }}
            >
              메일을 보냈습니다. 메일함을 확인해주세요.
            </div>
          ) : (
            <Form method="post" style={{ textAlign: "left" }}>
              <label
                htmlFor="forgot-email"
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
                id="forgot-email"
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
                {submitting ? "발송 중..." : "재설정 메일 보내기"}
              </button>
            </Form>
          )}

          <p
            style={{
              font: `400 13px/1.5 ${FONT}`,
              color: PALETTE.inkSoft,
              textAlign: "center",
              marginTop: 18,
            }}
          >
            <Link
              to="/login"
              style={{ color: PALETTE.primary, textDecoration: "underline" }}
            >
              로그인으로 돌아가기
            </Link>
          </p>
        </div>
      </Reveal>
    </section>
  );
}
