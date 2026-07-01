// /pricing 공개 가격표 — 상품(개별 과목 · 번들 · 회원제) 기반. feat-8-028 Stage C.
// 비로그인도 접근 가능. 로그인 사용자는 "구독 시작" 클릭 시 결제 흐름 진입.
import type { Route } from "./+types/pricing";

import { CheckIcon, SparklesIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { listActiveDiscounts } from "~/features/subscriptions/discounts.server";
import {
  type Discount,
  FEATURE_LABEL,
  bestAutomaticDiscount,
  effectivePriceKrw,
} from "~/features/subscriptions/labels";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";
import {
  type SubscriptionPlan,
  getActiveSubscription,
  listSubscriptionPlans,
} from "~/features/subscriptions/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

// ?locked= 배너 라벨 — feature 코드 또는 "subject:<slug>"(과목별 게이트) 해소.
function lockedLabel(locked: string): string {
  if (locked.startsWith("subject:")) {
    const slug = locked.slice("subject:".length);
    if (slug === "science") return "자연과학 학습과목";
    const meta = LAW_SUBJECTS[slug as keyof typeof LAW_SUBJECTS];
    return meta ? `${meta.name} 학습과목` : "이 과목";
  }
  return FEATURE_LABEL[locked] ?? "이 기능";
}

const subjectName = (slug: string) =>
  slug === "science"
    ? "자연과학"
    : (LAW_SUBJECTS[slug as keyof typeof LAW_SUBJECTS]?.name ?? slug);

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
        features: [] as string[],
      };
  // feat-8-028 — 이미 보유(결제/종합반/staff)한 과목. "보유 중" 표시용.
  let ownedSubjects: "all" | string[] = [];
  if (user) {
    const access = await getMembershipAccess(client, user.id);
    ownedSubjects =
      access.grade === "self_study" ||
      access.grade === "cohort" ||
      access.grade === "staff"
        ? access.subjects
        : [];
  }

  const discounts = await listActiveDiscounts(client);
  const locked = new URL(request.url).searchParams.get("locked");
  return {
    plans,
    active,
    isAuthed: !!user,
    tossClientKey: process.env.TOSS_CLIENT_KEY ?? null,
    locked,
    ownedSubjects,
    discounts,
  };
}

export default function Pricing({ loaderData }: Route.ComponentProps) {
  const { plans, active, isAuthed, tossClientKey, locked, ownedSubjects, discounts } =
    loaderData;
  const [coupon, setCoupon] = useState("");
  const nowMs = Date.now();
  const bundles = plans.filter((p) => p.productKind === "bundle");
  const subjects = plans.filter((p) => p.productKind === "subject");
  const memberships = plans.filter((p) => p.productKind === "membership");
  // 상품 보유 여부 — 상품의 부여 과목이 모두 열려 있으면 보유.
  const owns = (p: SubscriptionPlan) =>
    p.subjectCodes.length > 0 &&
    (ownedSubjects === "all" ||
      p.subjectCodes.every((s) => (ownedSubjects as string[]).includes(s)));

  const cardProps = (p: SubscriptionPlan) => ({
    key: p.planId,
    plan: p,
    owned: owns(p),
    isAuthed,
    tossClientKey,
    activeCode: active.planCode,
    discounts,
    nowMs,
    coupon: coupon.trim() || null,
  });

  return (
    <div className="bg-muted/30 min-h-screen px-4 py-10 md:py-14">
      <div className="mx-auto w-full max-w-screen-lg">
        <header className="mb-6 text-center">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            <SparklesIcon className="mr-1 inline size-3.5" />
            요금제
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
            필요한 과목만, 원하는 만큼
          </h1>
          <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm">
            과목별로 결제하거나 번들로 한 번에. 자연과학은 기본 무료로 함께
            열립니다. 상담·과제·모의고사·반별 게시판은 종합반에서 제공됩니다.
          </p>
        </header>

        {locked ? (
          <Card className="mb-4 border-amber-300 bg-amber-50/70 dark:border-amber-700/50 dark:bg-amber-950/30">
            <CardContent className="px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              🔒 <strong>{lockedLabel(locked)}</strong> 은(는) 결제 후 이용할 수
              있습니다. 아래에서 상품을 확인하세요.
            </CardContent>
          </Card>
        ) : null}

        {active.hasActive && active.subscription ? (
          <Card className="mb-6 border-emerald-300 bg-emerald-50/60">
            <CardContent className="px-4 py-3 text-sm text-emerald-900">
              ✅ 현재 <strong>{active.subscription.planName}</strong> 이용 중 ·
              만료 {active.subscription.expiresAt.slice(0, 10)} ·{" "}
              <Link to="/me/subscription" className="underline">
                관리
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {isAuthed ? (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Input
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              placeholder="쿠폰 코드 (선택)"
              className="h-9 max-w-[220px] text-sm"
            />
            {coupon.trim() ? (
              <span className="text-muted-foreground text-xs">
                결제 시 자동 적용됩니다
              </span>
            ) : null}
          </div>
        ) : null}

        {bundles.length > 0 ? (
          <Section title="번들" desc="여러 과목을 한 번에 · 통합가">
            {bundles.map((p) => (
              <PlanCard {...cardProps(p)} />
            ))}
          </Section>
        ) : null}

        {subjects.length > 0 ? (
          <Section title="개별 과목" desc="필요한 과목만 선택해 결제">
            {subjects.map((p) => (
              <PlanCard {...cardProps(p)} />
            ))}
          </Section>
        ) : null}

        {memberships.length > 0 ? (
          <Section title="회원제">
            {memberships.map((p) => (
              <PlanCard {...cardProps(p)} />
            ))}
          </Section>
        ) : null}

        <p className="text-muted-foreground mt-2 text-center text-[11px]">
          모든 결제는 토스페이먼츠를 통해 안전하게 처리됩니다. 종합반은 학원 직접
          상담을 권장합니다.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {desc ? (
          <p className="text-muted-foreground text-xs">{desc}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  owned,
  isAuthed,
  tossClientKey,
  activeCode,
  discounts,
  nowMs,
  coupon,
}: {
  plan: SubscriptionPlan;
  owned: boolean;
  isAuthed: boolean;
  tossClientKey: string | null;
  activeCode: string;
  discounts: Discount[];
  nowMs: number;
  coupon: string | null;
}) {
  const isFree = plan.code === "free";
  const isCohort = plan.code === "cohort";
  const highlight = plan.code === "bundle_all";
  // 자동 프로모션(코드 없는) 할인 미리보기. 쿠폰은 결제 시 서버가 재계산.
  const auto =
    plan.priceKrw > 0
      ? bestAutomaticDiscount(plan, plan.priceKrw, discounts, nowMs)
      : null;
  const effective = auto ? effectivePriceKrw(plan.priceKrw, auto) : plan.priceKrw;

  return (
    <Card
      className={cn(
        "flex h-full flex-col",
        highlight && "border-primary shadow-md",
      )}
    >
      <CardHeader className="space-y-2 px-5 pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{plan.name}</p>
          <div className="flex items-center gap-1">
            {highlight ? (
              <Badge variant="default" className="text-[10px]">
                추천
              </Badge>
            ) : null}
            {owned ? (
              <Badge
                variant="outline"
                className="bg-emerald-50 text-[10px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              >
                보유 중
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          {plan.priceKrw === 0 ? (
            <span className="text-3xl font-bold">무료</span>
          ) : (
            <>
              <span className="text-3xl font-bold tabular-nums">
                ₩{effective.toLocaleString("ko-KR")}
              </span>
              {auto ? (
                <span className="text-muted-foreground text-sm line-through tabular-nums">
                  ₩{plan.priceKrw.toLocaleString("ko-KR")}
                </span>
              ) : null}
            </>
          )}
          {plan.durationDays > 0 && plan.priceKrw > 0 ? (
            <span className="text-muted-foreground text-xs">
              / {plan.durationDays}일
            </span>
          ) : null}
        </div>
        {auto ? (
          <Badge className="w-fit bg-rose-500 text-[10px] text-white hover:bg-rose-500">
            {auto.name}
          </Badge>
        ) : null}
        {plan.description ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {plan.description}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3 px-5 pb-5">
        {plan.subjectCodes.length > 0 ? (
          <div>
            <p className="text-muted-foreground mb-1 text-[11px] font-semibold">
              열리는 학습과목
            </p>
            <div className="flex flex-wrap gap-1">
              {plan.subjectCodes.map((s) => (
                <span
                  key={s}
                  className="border-border bg-muted/60 inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[11px]"
                >
                  <CheckIcon className="text-link size-3" /> {subjectName(s)}
                </span>
              ))}
              <span className="text-muted-foreground inline-flex items-center rounded px-1 py-0.5 text-[11px]">
                + 자연과학(기본)
              </span>
            </div>
          </div>
        ) : (
          <ul className="space-y-1 text-xs">
            {plan.features.slice(0, 4).map((f) => (
              <li key={f} className="flex items-center gap-1.5">
                <CheckIcon className="text-link size-3.5 shrink-0" />
                <span>{FEATURE_LABEL[f] ?? f}</span>
              </li>
            ))}
          </ul>
        )}
        <PlanCta
          plan={plan}
          owned={owned}
          isFree={isFree}
          isCohort={isCohort}
          isAuthed={isAuthed}
          tossClientKey={tossClientKey}
          activeCode={activeCode}
          coupon={coupon}
        />
      </CardContent>
    </Card>
  );
}

function PlanCta({
  plan,
  owned,
  isFree,
  isCohort,
  isAuthed,
  tossClientKey,
  activeCode,
  coupon,
}: {
  plan: SubscriptionPlan;
  owned: boolean;
  isFree: boolean;
  isCohort: boolean;
  isAuthed: boolean;
  tossClientKey: string | null;
  activeCode: string;
  coupon: string | null;
}) {
  if (isFree) {
    const isActive = activeCode === "free";
    return (
      <Button asChild variant="outline" size="sm">
        <Link to={isAuthed ? "/dashboard" : "/join"}>
          {isActive ? "현재 등급" : isAuthed ? "대시보드" : "가입하기"}
        </Link>
      </Button>
    );
  }
  if (isCohort) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/contact">학원 상담</Link>
      </Button>
    );
  }
  if (owned) {
    return (
      <Button size="sm" variant="outline" disabled>
        <CheckIcon className="size-3.5" /> 보유 중
      </Button>
    );
  }
  return (
    <SubscribeButton
      plan={plan}
      isAuthed={isAuthed}
      tossClientKey={tossClientKey}
      coupon={coupon}
    />
  );
}

function SubscribeButton({
  plan,
  isAuthed,
  tossClientKey,
  coupon,
}: {
  plan: SubscriptionPlan;
  isAuthed: boolean;
  tossClientKey: string | null;
  coupon: string | null;
}) {
  const [pending, setPending] = useState(false);
  if (!isAuthed) {
    return (
      <Button asChild size="sm">
        <Link to="/join?redirect=/pricing">가입하고 구독</Link>
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
  return (
    <Button
      size="sm"
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await startSubscriptionCheckout(plan, tossClientKey, coupon);
        } finally {
          setPending(false);
        }
      }}
    >
      구독 시작
    </Button>
  );
}

// 결제 개시 — pending payment 생성(서버가 할인 계산) 후 토스 SDK 호출. 상품 단위.
async function startSubscriptionCheckout(
  plan: SubscriptionPlan,
  tossClientKey: string,
  couponCode?: string | null,
): Promise<void> {
  const fd = new FormData();
  fd.append("intent", "create-order");
  fd.append("planCode", plan.code);
  if (couponCode) fd.append("discountCode", couponCode);
  const res = await fetch("/api/payments/create-order", {
    method: "POST",
    body: fd,
  });
  const json = (await res.json()) as {
    ok?: boolean;
    orderId?: string;
    amount?: number;
    error?: string;
  };
  if (!json.ok || !json.orderId) {
    alert(`결제 준비 실패: ${json.error ?? "알 수 없는 오류"}`);
    return;
  }
  // 서버가 계산한 할인 후 금액으로 결제(정가 아님 — confirm 금액 검증과 정합).
  const amount = typeof json.amount === "number" ? json.amount : plan.priceKrw;
  try {
    const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
    const tossPayments = await loadTossPayments(tossClientKey);
    const payment = tossPayments.payment({ customerKey: plan.planId });
    await payment.requestPayment({
      method: "CARD",
      amount: { currency: "KRW", value: amount },
      orderId: json.orderId,
      orderName: plan.name,
      successUrl: `${window.location.origin}/api/payments/toss/confirm`,
      failUrl: `${window.location.origin}/me/subscription?failed=1`,
    });
  } catch (e) {
    alert(`결제 SDK 오류: ${e instanceof Error ? e.message : String(e)}`);
  }
}
