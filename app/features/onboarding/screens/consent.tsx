// feat-8-026 — 학습 데이터 활용 필수 동의 게이트.
// 미동의 학생이 인증 라우트에 접근하면 layout 게이트가 이리로 보낸다.
// 학습 데이터 처리는 본 서비스의 본질적 구성요소(PIPA 15①4 계약 이행)이므로
// 동의는 서비스 이용의 전제 조건이다 — "건너뛰기" 없음. 거부는 로그아웃/계정해지로만.

import { CheckCircle2Icon, ShieldCheckIcon } from "lucide-react";
import { Form, Link, data, redirect, useNavigation } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { isStaffRole } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { setServiceDataConsent } from "~/features/exam-results/queries.server";

import type { Route } from "./+types/consent";

export const meta: Route.MetaFunction = () => [
  { title: "학습 데이터 활용 동의 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login", { headers });

  const { data: profile } = await client
    .from("profiles")
    .select("name, role, service_data_consent_at")
    .eq("profile_id", user.id)
    .maybeSingle();

  // staff 면제 또는 이미 동의 → 게이트 불필요.
  if (!profile || isStaffRole(profile.role) || profile.service_data_consent_at) {
    throw redirect("/dashboard", { headers });
  }

  return data({ name: profile.name?.trim() || "학습자" }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ error: "로그인이 필요합니다." }, { status: 401, headers });
  }
  const res = await setServiceDataConsent(client, user.id);
  if (!res.ok) {
    return data({ error: res.error }, { status: 400, headers });
  }
  // 동의 완료 → 대시보드(필요 시 온보딩 wizard 로 자동 이어짐).
  throw redirect("/dashboard", { headers });
}

export default function Consent({ loaderData, actionData }: Route.ComponentProps) {
  const { name } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state !== "idle" && nav.formMethod === "POST";
  const error = actionData && "error" in actionData ? actionData.error : null;

  return (
    <div className="bg-muted/30 flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader className="space-y-2 px-6 pt-6 pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="text-primary size-6" />
              <h1 className="text-xl font-bold tracking-tight">
                학습 데이터 활용 동의
              </h1>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {name}님, 본 플랫폼은 <strong>학습 데이터 기반 진단·합격자 비교
              컨설팅</strong>을 핵심으로 제공합니다. 서비스 제공을 위해 아래
              데이터 처리에 동의해 주셔야 이용하실 수 있습니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 px-6 pb-6">
            <div className="bg-muted/40 space-y-2 rounded-md border p-4 text-sm leading-relaxed">
              <p className="font-semibold">활용되는 학습 데이터</p>
              <ul className="text-muted-foreground list-inside list-disc space-y-1 text-[13px]">
                <li>문제 풀이 결과, 조문·판례 열람 이력</li>
                <li>빈칸·암기 시도, 강의 시청 진행률</li>
                <li>학습 시간·일관성 등 학습 메타데이터</li>
              </ul>
              <p className="text-muted-foreground pt-1 text-[13px]">
                모든 분석은 <strong>가명처리 후 집계 형태</strong>로만 수행되며,
                마케팅·외부 판매에는 활용되지 않습니다. 처리 근거·항목은{" "}
                <Link
                  to="/legal/terms-of-service"
                  target="_blank"
                  className="text-primary underline"
                >
                  이용약관
                </Link>
                {" · "}
                <Link
                  to="/legal/privacy-policy"
                  target="_blank"
                  className="text-primary underline"
                >
                  개인정보처리방침
                </Link>
                {" 을 따릅니다."}
              </p>
            </div>

            <div className="text-muted-foreground bg-primary/5 flex items-start gap-2 rounded-md p-3 text-[13px] leading-relaxed">
              <CheckCircle2Icon className="text-primary mt-0.5 size-4 shrink-0" />
              <span>
                합격 결과 인증(합격증 제출)은 <strong>별개의 선택 사항</strong>
                이며, 거부하셔도 서비스 이용에 제한이 없습니다.
              </span>
            </div>

            {error ? (
              <p className="text-destructive text-sm">{error}</p>
            ) : null}

            <Form method="post">
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? "처리 중..." : "동의하고 시작하기"}
              </Button>
            </Form>

            <p className="text-muted-foreground text-center text-xs">
              동의를 원치 않으시면{" "}
              <Link to="/logout" className="underline">
                로그아웃
              </Link>
              할 수 있습니다. 동의 철회는 계정 해지 또는 운영자 문의로 가능합니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
