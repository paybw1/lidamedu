// /me/subscription — 본인 구독 상태 + 결제 이력.
import type { Route } from "./+types/my-subscription";

import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CrownIcon,
  ReceiptIcon,
} from "lucide-react";
import { Form, Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import {
  FEATURE_LABEL,
  PAYMENT_STATUS_LABEL,
  type PaymentStatus,
  SUBSCRIPTION_STATUS_LABEL,
} from "~/features/subscriptions/labels";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";
import {
  REFUND_WINDOW_DAYS,
  getActiveBillingKey,
  getActiveSubscription,
  isRefundable,
  listMyPayments,
} from "~/features/subscriptions/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = () => [
  { title: "내 구독 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const [active, payments, access] = await Promise.all([
    getActiveSubscription(client, user.id),
    listMyPayments(client, user.id),
    getMembershipAccess(client, user.id),
  ]);
  // feat-8-027 — 자기학습 활성 학습과목. cohort/staff=전체, self_study=보유 과목, 그 외=없음.
  const activeSubjects: "all" | string[] | null =
    access.grade === "cohort" || access.grade === "staff"
      ? "all"
      : access.grade === "self_study"
        ? access.subjects
        : null;
  const url = new URL(request.url);
  const paid = url.searchParams.get("paid") === "1";
  // 가상계좌 발급 완료·입금 대기 — 입금 확인(웹훅) 후 구독이 활성화된다.
  const deposit = url.searchParams.get("deposit") === "1";
  const failed = url.searchParams.get("failed") === "1";
  const failMsg = url.searchParams.get("msg");
  const refunded = url.searchParams.get("refunded") === "1";
  const cancelled = url.searchParams.get("cancelled") === "1";
  const cancelError = url.searchParams.get("cancelError");
  // 활성 구독 해지 시 전액 환불 대상인지 — 연결 결제가 3일 이내인지 서버에서 판정.
  const linkedPayment = active.subscription?.paymentId
    ? (payments.find((p) => p.paymentId === active.subscription!.paymentId) ??
      null)
    : null;
  const refundEligible = linkedPayment
    ? isRefundable(linkedPayment.status, linkedPayment.createdAt)
    : false;
  // 자동결제(정기결제) 상태 + 등록 카드 표시.
  let autoRenew = false;
  if (active.subscription) {
    const { data: sc } = await client
      .from("user_subscriptions")
      .select("auto_renew")
      .eq("subscription_id", active.subscription.subscriptionId)
      .maybeSingle();
    autoRenew = !!sc?.auto_renew;
  }
  const billingCard = autoRenew ? await getActiveBillingKey(client, user.id) : null;
  return {
    active,
    payments,
    paid,
    deposit,
    failed,
    failMsg,
    refunded,
    cancelled,
    cancelError,
    activeSubjects,
    refundWindowDays: REFUND_WINDOW_DAYS,
    refundEligible,
    autoRenew,
    billingCard,
  };
}

const STATUS_TONE: Record<PaymentStatus, string> = {
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  failed: "bg-rose-50 text-rose-800 border-rose-200",
  refunded: "bg-muted text-muted-foreground",
};

const subjectLabel = (slug: string) =>
  slug === "science"
    ? "자연과학"
    : (LAW_SUBJECTS[slug as keyof typeof LAW_SUBJECTS]?.name ?? slug);

export default function MySubscription({ loaderData }: Route.ComponentProps) {
  const {
    active,
    payments,
    paid,
    deposit,
    failed,
    failMsg,
    refunded,
    cancelled,
    cancelError,
    activeSubjects,
    refundWindowDays,
    refundEligible,
    autoRenew,
    billingCard,
  } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <CrownIcon className="size-3.5" /> 구독 관리
        </p>
        <h1 className="text-2xl font-bold tracking-tight">내 구독</h1>
        <p className="text-muted-foreground text-sm">
          현재 구독 상태와 결제 이력을 확인할 수 있습니다.
        </p>
      </header>

      {paid ? (
        <Card className="mb-4 border-emerald-300 bg-emerald-50/60">
          <CardContent className="px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2Icon className="mr-1 inline size-4" />
            결제가 완료되어 구독이 활성화되었습니다. 대시보드에서 새 기능을
            확인해 보세요.
          </CardContent>
        </Card>
      ) : null}
      {deposit ? (
        <Card className="mb-4 border-amber-300 bg-amber-50/60">
          <CardContent className="px-4 py-3 text-sm text-amber-900">
            <CircleAlertIcon className="mr-1 inline size-4" />
            가상계좌가 발급되었습니다. 입금이 확인되면 구독이 자동으로
            활성화됩니다.
          </CardContent>
        </Card>
      ) : null}
      {failed ? (
        <Card className="mb-4 border-rose-300 bg-rose-50/60">
          <CardContent className="px-4 py-3 text-sm text-rose-900">
            <CircleAlertIcon className="mr-1 inline size-4" />
            결제가 완료되지 않았습니다{failMsg ? ` — ${failMsg}` : ""}.
            <Link to="/pricing" className="ml-1 underline">
              요금제로 돌아가기
            </Link>
          </CardContent>
        </Card>
      ) : null}
      {refunded ? (
        <Card className="mb-4 border-emerald-300 bg-emerald-50/60">
          <CardContent className="px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2Icon className="mr-1 inline size-4" />
            전액 환불되었습니다. 해당 구독은 즉시 종료되었으며, 환불 금액은
            카드사 정책에 따라 영업일 기준 수일 내 반영됩니다.
          </CardContent>
        </Card>
      ) : null}
      {cancelled ? (
        <Card className="mb-4 border-emerald-300 bg-emerald-50/60">
          <CardContent className="px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2Icon className="mr-1 inline size-4" />
            정기결제가 해지되었습니다. 이미 결제된 이 달분은 환불되지 않으며,
            남은 이용 기간(만료일)까지는 그대로 사용할 수 있습니다. 다음 갱신일에
            추가 청구되지 않습니다.
          </CardContent>
        </Card>
      ) : null}
      {cancelError ? (
        <Card className="mb-4 border-rose-300 bg-rose-50/60">
          <CardContent className="px-4 py-3 text-sm text-rose-900">
            <CircleAlertIcon className="mr-1 inline size-4" />
            해지 처리 실패 — {cancelError}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-5">
        <CardHeader className="px-4 pb-2">
          <p className="text-sm font-semibold">현재 요금제</p>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          {active.hasActive && active.subscription ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-bold">
                    {active.subscription.planName}
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    시작 {active.subscription.startedAt.slice(0, 10)} → 만료{" "}
                    {active.subscription.expiresAt.slice(0, 10)}
                  </p>
                </div>
                <Badge
                  variant="default"
                  className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                >
                  {SUBSCRIPTION_STATUS_LABEL[active.subscription.status]}
                </Badge>
              </div>
              {activeSubjects ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-[11px] font-semibold">
                    활성 학습과목
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {activeSubjects === "all" ? (
                      <Badge variant="secondary" className="text-[11px]">
                        전체 과목
                      </Badge>
                    ) : (
                      activeSubjects.map((s) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="text-[11px]"
                        >
                          {subjectLabel(s)}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
              <ul className="space-y-1">
                {active.features.map((f) => (
                  <li
                    key={f}
                    className="mr-3 inline-flex items-center gap-1 text-xs"
                  >
                    <CheckCircle2Icon className="size-3 text-emerald-600" />
                    {FEATURE_LABEL[f] ?? f}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px]",
                    autoRenew
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "text-muted-foreground",
                  )}
                >
                  {autoRenew
                    ? `매월 자동결제${billingCard?.cardCompany ? ` · ${billingCard.cardCompany}${billingCard.cardMasked ? ` ${billingCard.cardMasked}` : ""}` : ""}`
                    : "자동 갱신 없음 (만료 시 종료)"}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button asChild size="sm" variant="outline">
                  <Link to="/pricing">요금제 비교 / 연장</Link>
                </Button>
                {active.subscription ? (
                  <Form
                    method="post"
                    action="/api/subscriptions/cancel"
                    onSubmit={(e) => {
                      const msg = refundEligible
                        ? "결제 후 3일 이내입니다. 전액 환불되고 구독이 즉시 종료됩니다. 해지하시겠습니까?"
                        : "결제 후 3일이 지나 이 달분은 환불되지 않습니다. 정기결제만 해지되어 남은 기간까지 이용하고 다음 갱신은 청구되지 않습니다. 해지하시겠습니까?";
                      if (!window.confirm(msg)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="cancel" />
                    <input
                      type="hidden"
                      name="subscriptionId"
                      value={active.subscription.subscriptionId}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-rose-700"
                    >
                      {refundEligible ? "해지 / 전액 환불" : "정기결제 해지"}
                    </Button>
                  </Form>
                ) : null}
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {refundEligible
                  ? `결제 후 ${refundWindowDays}일 이내 — 지금 해지하면 전액 환불되고 구독이 즉시 종료됩니다.`
                  : `결제 후 ${refundWindowDays}일 경과 — 해지 시 이 달분은 환불되지 않지만, 남은 기간까지 이용하며 다음 갱신은 청구되지 않습니다.`}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm">
                현재 <strong>무료 요금제</strong> 사용 중입니다.
              </p>
              <p className="text-muted-foreground text-xs">
                기본 학습은 무료로 계속 이용할 수 있으며, 합격자 컨설팅 기능을 모두
                풀어 보려면 자기주도 구독을 추천합니다. (합격자 비교는 실 합격자
                데이터가 누적되면 활성화됩니다.)
              </p>
              <Button asChild size="sm">
                <Link to="/pricing">구독 시작하기 →</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 pb-2">
          <p className="text-sm font-semibold">
            <ReceiptIcon className="mr-1 inline size-3.5" /> 결제 이력
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-3">
          {payments.length === 0 ? (
            <p className="text-muted-foreground px-4 text-xs">
              아직 결제 이력이 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일시</TableHead>
                  <TableHead>상품</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.paymentId}>
                    <TableCell className="text-xs tabular-nums">
                      {p.createdAt.slice(0, 16).replace("T", " ")}
                    </TableCell>
                    <TableCell className="text-xs">{p.planName}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      ₩{p.amountKrw.toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", STATUS_TONE[p.status])}
                      >
                        {PAYMENT_STATUS_LABEL[p.status]}
                      </Badge>
                      {p.failureReason ? (
                        <div className="text-[10px] text-rose-600">
                          {p.failureReason}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-muted-foreground mt-3 px-4 text-[11px] leading-relaxed">
            결제 후 {refundWindowDays}일 이내 해지 시 전액 환불·즉시 종료,
            {refundWindowDays}일 경과 후에는 그 달분 환불 없이 정기결제만
            해지됩니다.{" "}
            <Link to="/legal/refund-policy" className="underline">
              환불 규정 전문
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
