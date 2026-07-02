// feat-000-017 — 운영자 로그인 방식 설정. id/pw(이메일·비밀번호) 로그인·가입 노출 토글.
// 기본 OFF(카카오만). 켜면 로그인·가입 화면에 이메일/비번 폼이 노출된다.

import { Loader2Icon, SaveIcon } from "lucide-react";
import { useState } from "react";
import { Form, data, redirect, useNavigation } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Switch } from "~/core/components/ui/switch";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  isPasswordLoginEnabled,
  setPasswordLoginEnabled,
} from "~/features/auth/settings.server";

import type { Route } from "./+types/admin-auth-settings";

export const meta: Route.MetaFunction = () => [
  { title: "로그인 설정 | 운영자" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/admin");
  const passwordLogin = await isPasswordLoginEnabled(client);
  return { passwordLogin };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const enabled = fd.get("passwordLogin") === "on";
  const res = await setPasswordLoginEnabled(client, enabled, user.id);
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return data({ ok: true, saved: enabled });
}

export default function AdminAuthSettings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const saving = navigation.state !== "idle";
  const [enabled, setEnabled] = useState(loaderData.passwordLogin);
  const saved = actionData && "saved" in actionData;
  const error = actionData && "error" in actionData ? actionData.error : null;

  return (
    <AdminShell title="로그인 설정" cluster="auth-settings">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-xl font-bold tracking-tight">로그인 설정</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            로그인·회원가입 화면에 노출되는 방식을 관리합니다. 저장 즉시
            반영됩니다.
          </p>
        </header>

        <Form
          method="post"
          className="border-border bg-card space-y-4 rounded-2xl border p-5 shadow-sm"
        >
          <input
            type="hidden"
            name="passwordLogin"
            value={enabled ? "on" : "off"}
          />
          <div className="border-border/60 flex items-start justify-between gap-4 rounded-xl border p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">
                이메일·비밀번호 로그인/가입 사용
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                OFF(기본): 카카오로만 로그인·가입합니다. ON: 로그인·가입 화면에
                이메일·비밀번호 방식이 함께 노출됩니다.
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="이메일·비밀번호 로그인 사용"
              className="mt-0.5 shrink-0"
            />
          </div>

          {saved ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-300">
              저장되었습니다.{" "}
              {loaderData.passwordLogin !== enabled
                ? "새로고침 후 로그인 화면에 반영됩니다."
                : ""}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="rounded-full"
            >
              {saving ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SaveIcon className="size-3.5" />
              )}
              저장
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEnabled(loaderData.passwordLogin)}
              disabled={saving}
              className="rounded-full"
            >
              되돌리기
            </Button>
          </div>
        </Form>
      </div>
    </AdminShell>
  );
}
