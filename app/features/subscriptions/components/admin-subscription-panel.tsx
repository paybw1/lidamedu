// feat-7-014 — 학생 상세 화면에 들어가는 구독·결제 패널.
// 활성 구독 + 결제 이력 + 액션(grant/extend/cancel). manager+ 권한 — 호출부에서 검증.

import {
  AlertTriangleIcon,
  CalendarPlusIcon,
  CheckCircleIcon,
  CreditCardIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { cn } from "~/core/lib/utils";
import {
  PAYMENT_STATUS_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  type PaymentRow,
  type SubscriptionPlan,
  type UserSubscription,
} from "~/features/subscriptions/labels";

export interface AdminSubscriptionPanelProps {
  userId: string;
  subscriptions: ReadonlyArray<UserSubscription>;
  payments: ReadonlyArray<PaymentRow>;
  plans: ReadonlyArray<SubscriptionPlan>;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysFromNow(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function fmtKrw(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export function AdminSubscriptionPanel({
  userId,
  subscriptions,
  payments,
  plans,
}: AdminSubscriptionPanelProps) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const submitting = fetcher.state !== "idle";
  const result = fetcher.data;

  const active = subscriptions.find((s) => s.status === "active") ?? null;
  const history = subscriptions.filter((s) => s !== active);

  const totalPaid = payments
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + p.amountKrw, 0);

  function refresh() {
    revalidator.revalidate();
  }

  return (
    <section className="border-border bg-card rounded-2xl border p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="inline-flex items-center gap-2 text-base font-bold tracking-tight">
          <CreditCardIcon className="text-link size-4" /> 수강권·결제
        </h3>
        <Badge variant="outline" className="text-xs">
          누적 결제 {fmtKrw(totalPaid)}
        </Badge>
      </header>

      {/* 활성 구독 */}
      {active ? (
        <ActiveCard sub={active} onMutated={refresh} fetcher={fetcher} submitting={submitting} />
      ) : (
        <div className="text-muted-foreground border-dashed bg-muted/30 rounded-xl border p-4 text-center text-sm">
          활성 구독 없음 — 아래에서 수동 부여 가능
        </div>
      )}

      {/* 수동 부여 폼 */}
      <GrantForm
        userId={userId}
        plans={plans}
        fetcher={fetcher}
        submitting={submitting}
        onSuccess={refresh}
      />

      {/* 이력 */}
      {history.length > 0 ? (
        <details className="border-border/60 mt-4 border-t pt-3 text-xs">
          <summary className="text-foreground cursor-pointer font-semibold">
            구독 이력 {history.length}건 펼치기
          </summary>
          <ul className="mt-2 space-y-1">
            {history.map((s) => (
              <li
                key={s.subscriptionId}
                className="text-muted-foreground flex flex-wrap items-center gap-2 tabular-nums"
              >
                <Badge variant="outline" className="text-[10px]">
                  {s.planName}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {SUBSCRIPTION_STATUS_LABEL[s.status]}
                </Badge>
                <span>
                  {fmtDate(s.startedAt)} → {fmtDate(s.expiresAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* 결제 이력 */}
      {payments.length > 0 ? (
        <details className="border-border/60 mt-3 border-t pt-3 text-xs">
          <summary className="text-foreground cursor-pointer font-semibold">
            결제 이력 {payments.length}건 펼치기
          </summary>
          <ul className="mt-2 space-y-1">
            {payments.map((p) => (
              <li
                key={p.paymentId}
                className="text-muted-foreground flex flex-wrap items-center gap-2 tabular-nums"
              >
                <span>{fmtDate(p.createdAt)}</span>
                <Badge variant="outline" className="text-[10px]">
                  {p.planName}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {PAYMENT_STATUS_LABEL[p.status]}
                </Badge>
                <span className="text-foreground font-semibold">
                  {fmtKrw(p.amountKrw)}
                </span>
                {p.failureReason ? (
                  <span className="text-rose-700 dark:text-rose-300">
                    {p.failureReason.slice(0, 50)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {result?.error ? (
        <p className="mt-3 text-xs text-rose-600">{result.error}</p>
      ) : null}
      {result?.ok && !submitting ? (
        <p className="mt-3 text-xs text-emerald-600">처리되었습니다.</p>
      ) : null}
    </section>
  );
}

function ActiveCard({
  sub,
  onMutated,
  fetcher,
  submitting,
}: {
  sub: UserSubscription;
  onMutated: () => void;
  fetcher: ReturnType<typeof useFetcher>;
  submitting: boolean;
}) {
  const daysLeft = daysFromNow(sub.expiresAt);
  const warn = daysLeft <= 7 && daysLeft >= 0;
  const [extendDays, setExtendDays] = useState<number>(30);

  function doExtend() {
    const fd = new FormData();
    fd.set("intent", "extend");
    fd.set("subscriptionId", sub.subscriptionId);
    fd.set("addDays", String(extendDays));
    fetcher.submit(fd, { method: "post", action: "/api/admin/subscription" });
    setTimeout(onMutated, 200);
  }
  function doCancel() {
    if (!confirm(`이 구독을 취소합니다(만료일은 유지). 진행하시겠습니까?`)) return;
    const fd = new FormData();
    fd.set("intent", "cancel");
    fd.set("subscriptionId", sub.subscriptionId);
    fetcher.submit(fd, { method: "post", action: "/api/admin/subscription" });
    setTimeout(onMutated, 200);
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        warn
          ? "border-amber-500/40 bg-amber-500/[0.04]"
          : "border-emerald-500/40 bg-emerald-500/[0.04]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {sub.planName}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            warn
              ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
              : "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
          )}
        >
          {SUBSCRIPTION_STATUS_LABEL[sub.status]}
        </Badge>
        <span className="text-foreground text-sm font-semibold tabular-nums">
          {daysLeft >= 0 ? `D-${daysLeft}` : "만료됨"}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {fmtDate(sub.startedAt)} → {fmtDate(sub.expiresAt)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 text-xs">
        <div className="space-y-1">
          <Label htmlFor="extendDays" className="text-[11px]">
            연장(일)
          </Label>
          <Input
            id="extendDays"
            type="number"
            min={1}
            max={3650}
            value={extendDays}
            onChange={(e) => setExtendDays(Number(e.target.value))}
            className="h-8 w-20 text-xs"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={doExtend}
          disabled={submitting || extendDays <= 0}
          className="h-8 rounded-full px-3 text-xs"
        >
          {submitting ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <CalendarPlusIcon className="size-3" />
          )}
          만료 연장
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={doCancel}
          disabled={submitting}
          className="h-8 rounded-full px-3 text-xs text-rose-600 hover:text-rose-700"
        >
          <XCircleIcon className="size-3" /> 취소
        </Button>
      </div>
    </div>
  );
}

function GrantForm({
  userId,
  plans,
  fetcher,
  submitting,
  onSuccess,
}: {
  userId: string;
  plans: ReadonlyArray<SubscriptionPlan>;
  fetcher: ReturnType<typeof useFetcher>;
  submitting: boolean;
  onSuccess: () => void;
}) {
  const [planCode, setPlanCode] = useState<string>(plans[0]?.code ?? "");
  const [days, setDays] = useState<number>(plans[0]?.durationDays ?? 30);

  function onPlanChange(code: string) {
    setPlanCode(code);
    const p = plans.find((pl) => pl.code === code);
    if (p) setDays(p.durationDays);
  }

  function doGrant() {
    if (!planCode) return;
    const fd = new FormData();
    fd.set("intent", "grant");
    fd.set("userId", userId);
    fd.set("planCode", planCode);
    fd.set("durationDays", String(days));
    fetcher.submit(fd, { method: "post", action: "/api/admin/subscription" });
    setTimeout(onSuccess, 200);
  }

  return (
    <div className="border-border/60 mt-4 rounded-xl border-dashed border bg-muted/20 p-3">
      <p className="text-foreground inline-flex items-center gap-1 text-xs font-semibold">
        <CheckCircleIcon className="size-3" /> 수동 수강권 부여
      </p>
      <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
        결제 없이 수강권을 부여합니다. 같은 plan 의 활성 구독이 있으면 만료일이
        연장되고, 다른 plan 이면 기존 구독은 취소됩니다.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
        <div className="space-y-1">
          <Label htmlFor="planCode" className="text-[11px]">
            요금제
          </Label>
          <select
            id="planCode"
            value={planCode}
            onChange={(e) => onPlanChange(e.target.value)}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} ({fmtKrw(p.priceKrw)}/{p.durationDays}일)
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="grantDays" className="text-[11px]">
            기간(일)
          </Label>
          <Input
            id="grantDays"
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-8 w-24 text-xs"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={doGrant}
          disabled={submitting || !planCode || days <= 0}
          className="h-8 rounded-full px-3 text-xs"
        >
          {submitting ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <AlertTriangleIcon className="size-3" />
          )}
          수강권 부여
        </Button>
      </div>
    </div>
  );
}
