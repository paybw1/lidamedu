// feat-8-030 — 가입 후 필수정보(회원명·휴대전화·주소) 입력 화면.
// 필수정보 미입력 학생이 인증 라우트에 접근하면 layout 게이트가 이리로 보낸다.
// 카카오가 못 주는 정보를 인앱에서 수집한다 — "건너뛰기" 없음(이메일은 카카오 값 확인만).

import { UserRoundCogIcon } from "lucide-react";
import { Form, redirect, useNavigation } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { isStaffRole } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  formatPhoneForDisplay,
  normalizePhoneToE164,
} from "~/features/onboarding/lib/profile-info";

import type { Route } from "./+types/profile";

export const meta: Route.MetaFunction = () => [
  { title: "필수정보 입력 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login", { headers });

  const { data: profile } = await client
    .from("profiles")
    .select("name, role, phone_e164, address, profile_completed_at")
    .eq("profile_id", user.id)
    .maybeSingle();

  // staff 면제 또는 이미 입력 완료 → 게이트 불필요.
  if (!profile || isStaffRole(profile.role) || profile.profile_completed_at) {
    throw redirect("/dashboard", { headers });
  }

  // 이메일은 카카오 값(확인용, 수정 불가). 이름은 카카오가 준 값(이메일 앞부분일 수 있음)을
  // 프리필해 사용자가 실제 이름으로 정정하게 한다.
  return {
    email: user.email ?? "",
    name: profile.name?.trim() ?? "",
    phone: formatPhoneForDisplay(profile.phone_e164),
    address: profile.address ?? "",
  };
}

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "회원명을 2자 이상 입력해 주세요.")
    .max(40),
  phone: z.string().trim().min(1, "휴대전화 번호를 입력해 주세요.").max(40),
  address: z
    .string()
    .trim()
    .min(5, "주소를 입력해 주세요.")
    .max(200),
});

type FieldErrors = Partial<Record<"name" | "phone" | "address", string[]>>;

export async function action({ request }: Route.ActionArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login", { headers });

  const formData = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors,
      values: null,
    };
  }

  const phoneE164 = normalizePhoneToE164(parsed.data.phone);
  if (phoneE164 === "invalid" || phoneE164 === null) {
    return {
      fieldErrors: {
        phone: ["휴대전화 형식이 올바르지 않습니다 (예: 010-1234-5678)"],
      } as FieldErrors,
      values: null,
    };
  }

  const { error } = await client
    .from("profiles")
    .update({
      name: parsed.data.name,
      phone_e164: phoneE164,
      address: parsed.data.address,
      profile_completed_at: new Date().toISOString(),
    })
    .eq("profile_id", user.id);
  if (error) {
    return {
      fieldErrors: { name: [error.message] } as FieldErrors,
      values: null,
    };
  }

  // auth 메타데이터의 표시 이름도 정정(관리자 목록·헤더 표기 일관).
  await client.auth.updateUser({
    data: { name: parsed.data.name, display_name: parsed.data.name },
  });

  throw redirect("/dashboard", { headers });
}

export default function ProfileInfo({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state !== "idle" && nav.formMethod === "POST";
  const fe = actionData?.fieldErrors;

  return (
    <div className="bg-muted/30 flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader className="space-y-2 px-6 pt-6 pb-2">
            <div className="flex items-center gap-2">
              <UserRoundCogIcon className="text-link size-6" />
              <h1 className="text-xl font-bold tracking-tight">필수정보 입력</h1>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              원활한 수강 안내와 본인 확인을 위해 아래 정보를 입력해 주세요.
              입력을 완료하셔야 서비스를 이용하실 수 있습니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 px-6 pb-6">
            <Form method="post" className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  value={loaderData.email}
                  readOnly
                  disabled
                  className="bg-muted/50"
                />
                <p className="text-muted-foreground text-xs">
                  카카오 계정 이메일입니다. 변경할 수 없습니다.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="name">회원명 (실명)</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={loaderData.name}
                  placeholder="홍길동"
                  autoComplete="name"
                  required
                />
                {fe?.name ? (
                  <p className="text-destructive text-xs">{fe.name[0]}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">휴대전화</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={loaderData.phone}
                  placeholder="010-1234-5678"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                />
                {fe?.phone ? (
                  <p className="text-destructive text-xs">{fe.phone[0]}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address">주소</Label>
                <Input
                  id="address"
                  name="address"
                  defaultValue={loaderData.address}
                  placeholder="시·군·구 및 상세주소"
                  autoComplete="street-address"
                  required
                />
                {fe?.address ? (
                  <p className="text-destructive text-xs">{fe.address[0]}</p>
                ) : null}
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? "저장 중..." : "저장하고 시작하기"}
              </Button>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
