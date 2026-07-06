// /pricing 공개 가격표 — 상품(개별 과목 · 번들 · 회원제) 기반. feat-8-028 Stage C.
// 비로그인도 접근 가능. 로그인 사용자는 "구독 시작" 클릭 시 결제 흐름 진입.
import type { Route } from "./+types/pricing";

import { CheckIcon, SparklesIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/core/components/ui/dialog";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { hasPendingUpgradeRequest } from "~/features/cohorts/upgrade-requests.server";
import { listActiveDiscounts } from "~/features/subscriptions/discounts.server";
import {
  type Discount,
  FEATURE_LABEL,
  bestAutomaticDiscount,
  discountPeriodLabel,
  effectivePriceKrw,
  openMonthLabel,
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
  let isStaff = false;
  let isCohortMember = false;
  let upgradePending = false;
  if (user) {
    const access = await getMembershipAccess(client, user.id);
    isStaff = access.grade === "staff";
    isCohortMember = access.grade === "cohort";
    ownedSubjects =
      access.grade === "self_study" ||
      access.grade === "cohort" ||
      access.grade === "staff"
        ? access.subjects
        : [];
    // 종합반 카드 CTA — 대기 중 등업 신청 여부.
    if (!isStaff && !isCohortMember) {
      upgradePending = await hasPendingUpgradeRequest(client, user.id);
    }
  }
  // 관리자 결제 테스트 모드 — staff 는 전 과목 "보유 중"이라 결제 UI가 안 뜬다.
  // ?testStudent=1 이면 (staff 한정) 미보유로 취급해 학생처럼 결제 흐름을 볼 수 있게.
  const reqUrl = new URL(request.url);
  const testStudentMode =
    isStaff && reqUrl.searchParams.get("testStudent") === "1";
  if (testStudentMode) ownedSubjects = [];

  const discounts = await listActiveDiscounts(client);
  // 학습 개시 예정 과목(상표·디자인 등) — 개별 상품 available_from 미래. 번들엔 안내만.
  const nowMs = Date.now();
  const csProducts = plans.filter(
    (p) =>
      p.productKind === "subject" &&
      p.availableFrom &&
      new Date(p.availableFrom).getTime() > nowMs,
  );
  const comingSoon = csProducts.length
    ? {
        slugs: csProducts.flatMap((p) => p.subjectCodes),
        note: `${csProducts.map((p) => p.name).join("·")}은 ${openMonthLabel(csProducts[0].availableFrom as string)}부터 학습 가능`,
      }
    : null;
  const locked = reqUrl.searchParams.get("locked");
  return {
    plans,
    active,
    isAuthed: !!user,
    userId: user?.id ?? null,
    tossClientKey: process.env.TOSS_CLIENT_KEY ?? null,
    locked,
    ownedSubjects,
    discounts,
    comingSoon,
    isStaff,
    testStudentMode,
    isCohortMember,
    upgradePending,
  };
}

export default function Pricing({ loaderData }: Route.ComponentProps) {
  const {
    plans,
    active,
    isAuthed,
    userId,
    tossClientKey,
    locked,
    ownedSubjects,
    discounts,
    comingSoon,
    isStaff,
    testStudentMode,
    isCohortMember,
    upgradePending,
  } = loaderData;
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
    userId,
    tossClientKey,
    activeCode: active.planCode,
    discounts,
    nowMs,
    coupon: coupon.trim() || null,
    learningSoon: comingSoon,
    isCohortMember,
    upgradePending,
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
            과목별로 결제하거나 번들로 한 번에 결제할 수 있습니다. 자연과학은
            기본 무료로 함께 열립니다. 상담·과제·1차 모의고사·반별 게시판은
            종합반에서 제공됩니다.
          </p>
          {!isAuthed ? (
            <p className="border-primary/25 bg-primary/[0.06] mx-auto mt-4 inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border px-4 py-2 text-xs">
              <span>
                🎁 지금 가입하면 <strong>특허법 학습과목 15일 무료 체험</strong>
                이 바로 열립니다.
              </span>
              <Link to="/join" className="text-link font-semibold underline">
                무료로 시작하기
              </Link>
            </p>
          ) : null}
        </header>

        {isStaff ? (
          <Card className="mb-4 border-sky-300 bg-sky-50/70 dark:border-sky-700/50 dark:bg-sky-950/30">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-sky-900 dark:text-sky-200">
              <span>
                🧪 관리자 결제 테스트 모드 —{" "}
                {testStudentMode
                  ? "학생처럼 결제 UI가 표시됩니다. 실제 결제(테스트 키)까지 진행할 수 있어요."
                  : "관리자는 전 과목 보유 중이라 결제 버튼이 숨겨집니다. 켜면 학생처럼 결제 UI가 보입니다."}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link to={testStudentMode ? "/pricing" : "/pricing?testStudent=1"}>
                  {testStudentMode ? "테스트 모드 끄기" : "테스트 모드 켜기"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {locked ? (
          <Card className="mb-4 border-amber-300 bg-amber-50/70 dark:border-amber-700/50 dark:bg-amber-950/30">
            <CardContent className="px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              🔒 <strong>{lockedLabel(locked)}</strong>은(는) 결제 후 이용할 수
              있습니다. 아래에서 상품을 확인해 보세요.
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
                결제 시 자동 적용됩니다.
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

        {/* 결제 전 궁금한 것 — 환불·해지·체험 신뢰 요소. */}
        <section className="mt-10">
          <h2 className="mb-3 text-center text-lg font-bold tracking-tight">
            자주 묻는 질문
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FaqCard
              q="무료 체험은 어떻게 하나요?"
              a="가입하면 특허법 학습과목이 15일 동안 무료로 열립니다. 체험이 끝나도 학습 기록(풀이·하이라이트·포스트잇)은 그대로 보관되며, 결제하면 이어서 학습할 수 있습니다."
            />
            <FaqCard
              q="환불은 어떻게 되나요?"
              a={
                <>
                  결제 후 3일 이내에는 전액 환불됩니다. 3일이 지나면 해지 시
                  다음 갱신 청구만 중단되고 남은 기간은 그대로 이용할 수
                  있습니다.{" "}
                  <Link
                    to="/legal/refund-policy"
                    target="_blank"
                    className="text-link underline"
                  >
                    환불 규정 전문
                  </Link>
                </>
              }
            />
            <FaqCard
              q="자동결제는 언제든 해지할 수 있나요?"
              a="네. «내 구독»에서 언제든 해지할 수 있고, 해지하면 다음 갱신부터 청구되지 않습니다. 이미 결제한 기간은 만료일까지 이용됩니다."
            />
            <FaqCard
              q="종합반은 어떻게 등록하나요?"
              a="위 종합반 카드에서 등업 신청을 하면 운영자가 확인 후 반에 배정해 드립니다. 배정되는 즉시 전 과목·상담·과제·반별 게시판이 열리며, 수강료 결제는 학원 안내에 따라 별도로 진행됩니다."
            />
          </div>
        </section>

        <p className="text-muted-foreground mt-6 text-center text-[11px]">
          모든 결제는 토스페이먼츠를 통해 안전하게 처리됩니다. 종합반은 등업
          신청 후 운영자 확인을 거쳐 배정됩니다.
        </p>
      </div>
    </div>
  );
}

function FaqCard({ q, a }: { q: string; a: ReactNode }) {
  return (
    <Card>
      <CardContent className="px-4 py-3.5">
        <p className="text-sm font-semibold">{q}</p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {a}
        </p>
      </CardContent>
    </Card>
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
  userId,
  tossClientKey,
  activeCode,
  discounts,
  nowMs,
  coupon,
  learningSoon,
  isCohortMember,
  upgradePending,
}: {
  plan: SubscriptionPlan;
  owned: boolean;
  isAuthed: boolean;
  userId: string | null;
  tossClientKey: string | null;
  activeCode: string;
  discounts: Discount[];
  nowMs: number;
  coupon: string | null;
  learningSoon: { slugs: string[]; note: string } | null;
  isCohortMember: boolean;
  upgradePending: boolean;
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
  // 오픈 예정(available_from 이후 판매) — 데이터 고도화 중 과목 등.
  const comingSoon =
    !!plan.availableFrom && new Date(plan.availableFrom).getTime() > nowMs;
  const openLabel = comingSoon
    ? openMonthLabel(plan.availableFrom as string)
    : null;
  // 지금 판매되는 상품이지만 포함 과목 중 학습 개시 예정(상표·디자인 등)이 있으면 안내.
  const learnNote =
    learningSoon &&
    !plan.availableFrom &&
    plan.subjectCodes.some((s) => learningSoon.slugs.includes(s))
      ? learningSoon.note
      : null;

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
            {comingSoon ? (
              <Badge
                variant="outline"
                className="border-amber-400 text-[10px] text-amber-700 dark:text-amber-300"
              >
                {openLabel}
              </Badge>
            ) : null}
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
          <div className="space-y-1">
            <Badge className="w-fit bg-rose-500 text-[10px] text-white hover:bg-rose-500">
              {auto.name}
            </Badge>
            {discountPeriodLabel(auto) ? (
              <p className="text-[11px] leading-snug text-rose-700 dark:text-rose-300">
                {discountPeriodLabel(auto)}
              </p>
            ) : null}
          </div>
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
            {learnNote ? (
              <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                ⏳ {learnNote}
              </p>
            ) : null}
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
          comingSoon={comingSoon}
          openLabel={openLabel}
          isAuthed={isAuthed}
          userId={userId}
          tossClientKey={tossClientKey}
          activeCode={activeCode}
          coupon={coupon}
          isCohortMember={isCohortMember}
          upgradePending={upgradePending}
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
  comingSoon,
  openLabel,
  isAuthed,
  userId,
  tossClientKey,
  activeCode,
  coupon,
  isCohortMember,
  upgradePending,
}: {
  plan: SubscriptionPlan;
  owned: boolean;
  isFree: boolean;
  isCohort: boolean;
  comingSoon: boolean;
  openLabel: string | null;
  isAuthed: boolean;
  userId: string | null;
  tossClientKey: string | null;
  activeCode: string;
  coupon: string | null;
  isCohortMember: boolean;
  upgradePending: boolean;
}) {
  if (comingSoon && !isFree && !isCohort) {
    return (
      <Button size="sm" variant="outline" disabled>
        {openLabel ?? "오픈 예정"}
      </Button>
    );
  }
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
      <CohortUpgradeCta
        isAuthed={isAuthed}
        isCohortMember={isCohortMember}
        upgradePending={upgradePending}
      />
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
      userId={userId}
      tossClientKey={tossClientKey}
      coupon={coupon}
    />
  );
}

// 종합반 CTA — 등업 신청(운영자 승인으로 반 배정) 흐름. feat-8-027 종합반 승인.
function CohortUpgradeCta({
  isAuthed,
  isCohortMember,
  upgradePending,
}: {
  isAuthed: boolean;
  isCohortMember: boolean;
  upgradePending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const fetcher = useFetcher<{ error?: string; ok?: boolean }>();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.error) toast.error(fetcher.data.error);
      else {
        toast.success("등업 신청이 접수됐습니다. 운영자 확인 후 배정됩니다.");
        setSent(true);
        setOpen(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  if (isCohortMember) {
    return (
      <Button size="sm" variant="outline" disabled>
        <CheckIcon className="size-3.5" /> 현재 등급
      </Button>
    );
  }
  if (!isAuthed) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/login?next=/pricing">로그인 후 등업 신청</Link>
      </Button>
    );
  }
  if (upgradePending || sent) {
    return (
      <Button size="sm" variant="outline" disabled>
        등업 신청 접수됨 — 확인 중
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">종합반 등업 신청</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>종합반 등업 신청</DialogTitle>
        </DialogHeader>
        <fetcher.Form
          method="post"
          action="/api/cohorts/upgrade-request"
          className="space-y-3 text-sm"
        >
          <p className="text-muted-foreground text-xs leading-relaxed">
            신청하면 운영자가 확인 후 반에 배정해 드립니다. 배정이 완료되면
            알림으로 안내되고 전 과목·상담·과제·반별 게시판이 열립니다. 수강료
            결제는 학원 안내에 따라 별도로 진행됩니다.
          </p>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs font-semibold">
              남기실 말 (선택)
            </span>
            <Textarea
              name="message"
              maxLength={500}
              rows={3}
              placeholder="예: 연락 가능한 시간대, 문의 사항 등"
              className="text-xs"
            />
          </label>
          <Button type="submit" size="sm" disabled={busy} className="w-full">
            {busy ? "접수 중…" : "등업 신청"}
          </Button>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function SubscribeButton({
  plan,
  isAuthed,
  userId,
  tossClientKey,
  coupon,
}: {
  plan: SubscriptionPlan;
  isAuthed: boolean;
  userId: string | null;
  tossClientKey: string | null;
  coupon: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [autoPay, setAutoPay] = useState(false);
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
    <div className="flex flex-col gap-1.5">
      <label className="flex items-start gap-1.5 text-[11px] leading-snug">
        <input
          type="checkbox"
          checked={autoPay}
          onChange={(e) => setAutoPay(e.target.checked)}
          className="mt-0.5 size-3.5 shrink-0"
        />
        <span className="text-muted-foreground">매월 자동결제(정기결제)에 동의</span>
      </label>
      {autoPay ? (
        <p className="text-muted-foreground rounded-md bg-muted/60 px-2 py-1.5 text-[10px] leading-relaxed">
          매월 결제일에 <strong>위 표시 금액(할인 적용가)</strong>이 등록하신
          카드로 <strong>자동 청구</strong>되며, 해지 전까지 매월 갱신됩니다.
          «내 구독»에서 언제든 해지할 수 있고, 결제 후 3일 이내에는 전액
          환불됩니다.{" "}
          <Link to="/legal/refund-policy" className="underline" target="_blank">
            환불 규정
          </Link>
        </p>
      ) : null}
      <Button
        size="sm"
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            if (autoPay) {
              await startBillingCheckout(plan, userId, tossClientKey, coupon);
            } else {
              await startSubscriptionCheckout(plan, tossClientKey, coupon);
            }
          } finally {
            setPending(false);
          }
        }}
      >
        {autoPay ? "자동결제로 시작" : "구독 시작"}
      </Button>
    </div>
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
    alert(`결제 준비에 실패했습니다: ${json.error ?? "알 수 없는 오류"}`);
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
    alert(`결제 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// 자동결제 개시 — 카드 등록(requestBillingAuth). 콜백에서 빌링키 발급 + 첫 달 청구.
// customerKey=본인 userId(콜백 서버가 위조 검증). 첫 결제·연장 금액은 서버 권위.
async function startBillingCheckout(
  plan: SubscriptionPlan,
  userId: string | null,
  tossClientKey: string,
  couponCode?: string | null,
): Promise<void> {
  if (!userId) {
    alert("로그인이 필요합니다.");
    return;
  }
  try {
    const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
    const tossPayments = await loadTossPayments(tossClientKey);
    const payment = tossPayments.payment({ customerKey: userId });
    const qs = new URLSearchParams({ planCode: plan.code });
    if (couponCode) qs.set("discountCode", couponCode);
    await payment.requestBillingAuth({
      method: "CARD",
      successUrl: `${window.location.origin}/api/payments/toss/billing-confirm?${qs.toString()}`,
      failUrl: `${window.location.origin}/me/subscription?failed=1`,
    });
  } catch (e) {
    alert(`자동결제 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`);
  }
}
