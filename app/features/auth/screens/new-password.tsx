/**
 * New Password — 재설정 메일 링크를 타고 들어와 새 비밀번호 입력.
 *
 * Supabase recovery 흐름: 메일의 링크에 access_token + type=recovery 가 fragment 로 붙어
 * 클라이언트에서 detectSessionInUrl 로 임시 세션이 생성됨. 그 세션 안에서 updateUser({
 * password }) 호출 → 비밀번호 변경 후 정식 세션으로 전환.
 *
 * public.layout 안에 두면 임시 세션이 있어서 /dashboard 로 redirect 되므로 별도 layout
 * 아래에 둔다(navigation.layout 직속).
 */
import type { Route } from "./+types/new-password";

import { Form, Link, data, redirect, useNavigation } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { PALETTE, Reveal } from "~/features/home/lib/landing";

const FONT = "Pretendard, sans-serif";

export const meta: Route.MetaFunction = () => [
  { title: `새 비밀번호 | ${import.meta.env.VITE_APP_NAME}` },
];

const schema = z
  .object({
    password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "비밀번호가 일치하지 않습니다.",
    path: ["confirm"],
  });

export async function action({ request }: Route.ActionArgs) {
  const fd = await request.formData();
  const parsed = schema.safeParse({
    password: fd.get("password"),
    confirm: fd.get("confirm"),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." },
      { status: 400 },
    );
  }
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    // recovery 세션이 없음 — 메일 링크가 만료됐거나 잘못된 진입.
    return data(
      {
        error:
          "재설정 세션이 만료됐습니다. 비밀번호 재설정 메일을 다시 받아주세요.",
      },
      { status: 401 },
    );
  }
  const { error } = await client.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return data({ error: error.message }, { status: 400 });
  }
  return redirect("/dashboard", { headers });
}

export default function NewPassword({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state !== "idle" && nav.formMethod === "POST";
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
            새 비밀번호 설정
          </h1>
          <p
            style={{
              font: `400 14px/1.6 ${FONT}`,
              color: PALETTE.inkSoft,
              margin: "0 0 24px",
            }}
          >
            안전하게 사용할 새 비밀번호를 입력해주세요.
          </p>

          <Form method="post" style={{ textAlign: "left" }}>
            <label
              htmlFor="new-password"
              style={{
                display: "block",
                font: `500 12px/1.5 ${FONT}`,
                color: PALETTE.inkSoft,
                marginBottom: 4,
              }}
            >
              새 비밀번호 (8자 이상)
            </label>
            <input
              id="new-password"
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
                marginBottom: 12,
                background: PALETTE.base,
              }}
            />
            <label
              htmlFor="new-password-confirm"
              style={{
                display: "block",
                font: `500 12px/1.5 ${FONT}`,
                color: PALETTE.inkSoft,
                marginBottom: 4,
              }}
            >
              비밀번호 확인
            </label>
            <input
              id="new-password-confirm"
              name="confirm"
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
              {submitting ? "변경 중..." : "비밀번호 변경"}
            </button>
          </Form>

          <p
            style={{
              font: `400 13px/1.5 ${FONT}`,
              color: PALETTE.inkSoft,
              textAlign: "center",
              marginTop: 18,
            }}
          >
            <Link
              to="/forgot-password"
              style={{ color: PALETTE.primary, textDecoration: "underline" }}
            >
              메일을 다시 받기
            </Link>
          </p>
        </div>
      </Reveal>
    </section>
  );
}
