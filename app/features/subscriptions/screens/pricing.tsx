// /pricing 공개 가격표 페이지.
// 비로그인도 접근 가능. 로그인 사용자는 "구독 시작" 클릭 시 결제 흐름 진입.
import type { Route } from "./+types/pricing";

import { CheckIcon, SparklesIcon } from "lucide-react";
import { Link, data, redirect, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { FEATURE_LABEL } from "~/features/subscriptions/labels";
import {
  type SubscriptionPlan,
  getActiveSubscription,
  listSubscriptionPlans,
} from "~/features/subscriptions/queries.server";

export const meta: Route.MetaFunction = () => [
  { title: "요금제 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const plans = await listSubscriptionPlans(client);
  const active = user
    ? await getActiveSubscription(client, user.id)
    : {
        hasActive: false,
        subscription: null,
        planCode: "free",
        features: [],
      };
  // feat-8-008: 영역 게이트 redirect — ?locked={feature} 로 안내 배너 표시.
  const locked = new URL(request.url).searchParams.get("locked");
  return {
    plans,
    active,
    isAuthed: !!user,
    tossClientKey: process.env.TOSS_CLIENT_KEY ?? null,
    locked,
  };
}

export default function Pricing({ loaderData }: Route.ComponentProps) {
  const { plans, active, isAuthed, tossClientKey, locked } = loaderData;
  return (
    <div className="bg-muted/30 min-h-screen px-4 py-10 md:py-14">
      <div className="mx-auto w-full max-w-screen-lg">
        <header className="mb-6 text-center">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            <SparklesIcon className="mr-1 inline size-3.5" />
            요금제
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
            합격 데이터 기반 컨설팅
          </h1>
          <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm">
            기본 학습은 무료, 합격자 비교 컨설팅·자동 추천·12주 곡선·수기 모음은
            자기주도 구독에서 풀로 열립니다. 합격자 비교는 실 합격자 데이터가
            누적되면 활성화됩니다.
          </p>
        </header>

        {locked ? (
          <Card className="mb-4 border-amber-300 bg-amber-50/70 dark:border-amber-700/50 dark:bg-amber-950/30">
            <CardContent className="px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              🔒 <strong>{FEATURE_LABEL[locked] ?? "이 기능"}</strong> 영역은
              상위 요금제에서 이용할 수 있습니다. 아래에서 요금제를 확인하세요.
            </CardContent>
          </Card>
        ) : null}

        {active.hasActive && active.subscription ? (
          <Card className="mb-6 border-emerald-300 bg-emerald-50/60">
            <CardContent className="px-4 py-3 text-sm text-emerald-900">
              ✅ 현재 <strong>{active.subscription.planName}</strong> 구독 중 ·
              만료 {active.subscription.expiresAt.slice(0, 10)} ·{" "}
              <Link to="/me/subscription" className="underline">
                관리
              </Link>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <PlanCard
              key={p.planId}
              plan={p}
              isAuthed={isAuthed}
              activeCode={active.planCode}
              tossClientKey={tossClientKey}
            />
          ))}
        </div>

        <p className="text-muted-foreground mt-6 text-center text-[11px]">
          모든 결제는 토스페이먼츠를 통해 안전하게 처리됩니다. 종합반은 학원
          직접 상담을 권장합니다.
        </p>
      </div>
    </div>
  );
}

const seedSchemaIntent = (planCode: string) => `subscribe-${planCode}`;
void seedSchemaIntent;

function PlanCard({
  plan,
  isAuthed,
  activeCode,
  tossClientKey,
}: {
  plan: SubscriptionPlan;
  isAuthed: boolean;
  activeCode: string;
  tossClientKey: string | null;
}) {
  const isActive = activeCode === plan.code;
  const isFree = plan.priceKrw === 0 && plan.code !== "cohort";
  const isCohort = plan.code === "cohort";
  const isHighlight = plan.code === "pro_monthly";

  return (
    <Card
      className={cn(
        "flex h-full flex-col",
        isHighlight && "border-primary shadow-md",
      )}
    >
      <CardHeader className="space-y-2 px-5 pb-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{plan.name}</p>
          {isHighlight ? (
            <Badge variant="default" className="text-[10px]">
              추천
            </Badge>
          ) : null}
          {isActive ? (
            <Badge
              variant="outline"
              className="bg-emerald-50 text-[10px] text-emerald-800"
            >
              현재 플랜
            </Badge>
          ) : null}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold tabular-nums">
            {plan.priceKrw === 0
              ? "₩0"
              : `₩${plan.priceKrw.toLocaleString("ko-KR")}`}
          </span>
          {plan.durationDays > 0 ? (
            <span className="text-muted-foreground text-xs">
              / {plan.durationDays}일
            </span>
          ) : null}
        </div>
        {plan.description ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {plan.description}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between px-5 pb-5">
        <ul className="mb-4 space-y-1.5 text-xs">
          {plan.features.map((f) => (
            <li key={f} className="flex items-center gap-1.5">
              <CheckIcon className="text-link size-3.5 flex-shrink-0" />
              <span>{FEATURE_LABEL[f] ?? f}</span>
            </li>
          ))}
        </ul>
        {isFree ? (
          <Button asChild variant="outline" size="sm" disabled={isActive}>
            <Link to={isAuthed ? "/dashboard" : "/join"}>
              {isActive ? "사용 중" : isAuthed ? "대시보드" : "가입하기"}
            </Link>
          </Button>
        ) : isCohort ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/contact">학원 상담</Link>
          </Button>
        ) : (
          <SubscribeButton
            plan={plan}
            isAuthed={isAuthed}
            tossClientKey={tossClientKey}
            isActive={isActive}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SubscribeButton({
  plan,
  isAuthed,
  tossClientKey,
  isActive,
}: {
  plan: SubscriptionPlan;
  isAuthed: boolean;
  tossClientKey: string | null;
  isActive: boolean;
}) {
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    orderId?: string;
    paymentId?: string;
  }>();

  if (!isAuthed) {
    return (
      <Button asChild size="sm">
        <Link to={`/join?redirect=/pricing`}>가입하고 구독</Link>
      </Button>
    );
  }
  if (!tossClientKey) {
    return (
      <Button size="sm" variant="outline" disabled>
        결제 미설정
      </Button>
    );
  }

  async function startCheckout() {
    // 1) 서버에 pending payment 생성 요청
    const fd = new FormData();
    fd.append("intent", "create-order");
    fd.append("planCode", plan.code);
    const res = await fetch("/api/payments/create-order", {
      method: "POST",
      body: fd,
    });
    const json = (await res.json()) as {
      ok?: boolean;
      orderId?: string;
      error?: string;
    };
    if (!json.ok || !json.orderId) {
      alert(`결제 준비 실패: ${json.error ?? "알 수 없는 오류"}`);
      return;
    }
    // 2) 토스 SDK 호출
    try {
      const { loadTossPayments } = await import(
        "@tosspayments/tosspayments-sdk"
      );
      const tossPayments = await loadTossPayments(tossClientKey!);
      const payment = tossPayments.payment({ customerKey: plan.planId });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: plan.priceKrw },
        orderId: json.orderId,
        orderName: plan.name,
        successUrl: `${window.location.origin}/api/payments/toss/confirm`,
        failUrl: `${window.location.origin}/me/subscription?failed=1`,
      });
    } catch (e) {
      alert(`결제 SDK 오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <Button
      size="sm"
      type="button"
      disabled={isActive || fetcher.state !== "idle"}
      onClick={startCheckout}
    >
      {isActive ? "사용 중" : "구독 시작"}
    </Button>
  );
}
