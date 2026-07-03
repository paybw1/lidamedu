// 서비스 접근 승인 대기 화면.
// 미승인 학생이 인증 라우트에 접근하면 layout 게이트(requireAccessApproval)가 이리로
// 보낸다. 승인은 운영자가 /admin/users 에서 수행 — 학생 쪽에서 할 수 있는 동작 없음.

import { HourglassIcon } from "lucide-react";
import { Link, data, redirect } from "react-router";

import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { isStaffRole } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/pending-approval";

export const meta: Route.MetaFunction = () => [
  { title: "이용 승인 대기 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login", { headers });

  const { data: profile } = await client
    .from("profiles")
    .select("name, role, access_approved_at")
    .eq("profile_id", user.id)
    .maybeSingle();

  // staff 면제 또는 이미 승인 → 대기 화면 불필요.
  if (!profile || isStaffRole(profile.role) || profile.access_approved_at) {
    throw redirect("/dashboard", { headers });
  }

  return data({ name: profile.name?.trim() || "학습자" }, { headers });
}

export default function PendingApproval({ loaderData }: Route.ComponentProps) {
  const { name } = loaderData;

  return (
    <div className="bg-muted/30 flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader className="space-y-2 px-6 pt-6 pb-2">
            <div className="flex items-center gap-2">
              <HourglassIcon className="text-link size-6" />
              <h1 className="text-xl font-bold tracking-tight">이용 승인 대기</h1>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {name}님, 가입이 완료되었습니다. 리담변리사학원 학습 플랫폼은
              운영자 승인 후 이용하실 수 있습니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 px-6 pb-6">
            <div className="bg-muted/40 space-y-1 rounded-md border p-4 text-sm leading-relaxed">
              <p className="font-semibold">안내</p>
              <ul className="text-muted-foreground list-inside list-disc space-y-1 text-[13px]">
                <li>운영자가 확인 후 이용을 승인해 드립니다.</li>
                <li>승인이 완료되면 별도 조작 없이 바로 이용하실 수 있습니다.</li>
                <li>승인 관련 문의는 학원으로 연락해 주세요.</li>
              </ul>
            </div>
            <p className="text-muted-foreground text-center text-xs">
              다른 계정으로 이용하시려면{" "}
              <Link to="/logout" className="underline">
                로그아웃
              </Link>
              해 주세요.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
