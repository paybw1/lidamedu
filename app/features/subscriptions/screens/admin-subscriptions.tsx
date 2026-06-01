// feat-7-014 — 운영자 수강권 list 화면. manager+ 권한.

import {
  AlertTriangleIcon,
  CalendarCheckIcon,
  CreditCardIcon,
  UserIcon,
} from "lucide-react";
import { Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  listAllSubscriptions,
  type SubscriptionWithUser,
} from "~/features/subscriptions/admin-queries.server";
import { SUBSCRIPTION_STATUS_LABEL } from "~/features/subscriptions/labels";
import { listSubscriptionPlans } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/admin-subscriptions";

export const meta: Route.MetaFunction = () => [
  { title: "수강권 관리 | 운영자" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  // manager+ 권한 — feat-7-031 4단계 권한.
  const { data: prof } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!roleAtLeast(prof?.role, "manager")) {
    throw redirect("/admin");
  }

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") ?? "all") as
    | "all"
    | "active"
    | "expired"
    | "cancelled"
    | "pending";
  const planCode = url.searchParams.get("planCode") ?? "";
  const search = url.searchParams.get("q") ?? "";
  const expiring = url.searchParams.get("expiring") === "1";

  const [items, plans] = await Promise.all([
    listAllSubscriptions({
      status: status === "all" ? "all" : status,
      planCode: planCode || undefined,
      search: search || undefined,
      expiringInDays: expiring ? 7 : undefined,
      limit: 500,
    }),
    listSubscriptionPlans(client),
  ]);

  return { items, plans, filter: { status, planCode, search, expiring } };
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

const STATUS_TABS = [
  { value: "all", label: "전체" },
  { value: "active", label: "활성" },
  { value: "expired", label: "만료" },
  { value: "cancelled", label: "취소" },
] as const;

export default function AdminSubscriptions({ loaderData }: Route.ComponentProps) {
  const { items, plans, filter } = loaderData;

  // 요약 카운트.
  const counts = {
    active: items.filter((i) => i.status === "active").length,
    expiring7: items.filter(
      (i) =>
        i.status === "active" &&
        daysFromNow(i.expiresAt) >= 0 &&
        daysFromNow(i.expiresAt) <= 7,
    ).length,
    expired: items.filter((i) => i.status === "expired").length,
    cancelled: items.filter((i) => i.status === "cancelled").length,
  };

  return (
    <AdminShell title="수강권 관리" cluster="students">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
              <CreditCardIcon className="text-primary size-5" /> 수강권 / 결제 관리
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              feat-8-018 결제 인프라(`subscription_plans` / `payments` /
              `user_subscriptions`) 위에 운영팀이 수동 부여 / 만료 연장 / 취소
              관리. 학생별 상세는 학생 상세 페이지에서.
            </p>
          </div>
        </header>

        {/* 요약 카드 */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="활성 구독자" value={`${counts.active}명`} icon={UserIcon} />
          <Stat
            label="7일 내 만료 임박"
            value={`${counts.expiring7}명`}
            icon={AlertTriangleIcon}
            accent={counts.expiring7 > 0 ? "amber" : undefined}
          />
          <Stat label="만료" value={`${counts.expired}명`} />
          <Stat label="취소" value={`${counts.cancelled}명`} />
        </section>

        {/* 필터 */}
        <form
          method="get"
          className="border-border bg-card flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm"
        >
          <div className="flex items-center gap-1.5 text-xs">
            {STATUS_TABS.map((t) => (
              <Link
                key={t.value}
                to={`/admin/subscriptions?status=${t.value}`}
                className={cn(
                  "rounded-full px-3 py-1 transition-colors",
                  filter.status === t.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
          <select
            name="planCode"
            defaultValue={filter.planCode ?? ""}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            <option value="">전체 요금제</option>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              name="expiring"
              value="1"
              defaultChecked={filter.expiring}
              className="h-3 w-3"
            />
            7일 내 만료
          </label>
          <Input
            name="q"
            placeholder="이름 검색"
            defaultValue={filter.search ?? ""}
            className="h-8 flex-1 text-xs"
          />
          <input type="hidden" name="status" value={filter.status} />
          <Button type="submit" size="sm" variant="outline" className="h-8 rounded-full text-xs">
            필터 적용
          </Button>
        </form>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-12 text-center">
            <CalendarCheckIcon className="text-muted-foreground mx-auto size-10" />
            <p className="text-muted-foreground mt-3 text-sm">
              조건에 해당하는 수강권이 없습니다.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <SubRow key={s.subscriptionId} s={s} />
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}

function SubRow({ s }: { s: SubscriptionWithUser }) {
  const daysLeft = daysFromNow(s.expiresAt);
  const statusColor =
    s.status === "active"
      ? daysLeft <= 7
        ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
        : "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
      : s.status === "expired"
        ? "border-rose-500/40 text-rose-700 dark:text-rose-300"
        : "text-muted-foreground";
  return (
    <li className="border-border bg-card rounded-xl border p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">
            {s.displayName ?? "(이름 없음)"}{" "}
            {s.email ? (
              <span className="text-muted-foreground ml-1 text-xs font-normal">
                {s.email}
              </span>
            ) : null}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
            {s.userId.slice(0, 8)}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {s.planName}
        </Badge>
        <Badge variant="outline" className={cn("text-xs", statusColor)}>
          {SUBSCRIPTION_STATUS_LABEL[s.status]}
        </Badge>
        <Badge variant="secondary" className="text-xs tabular-nums">
          {s.status === "active"
            ? daysLeft >= 0
              ? `D-${daysLeft}`
              : "만료됨"
            : fmtDate(s.expiresAt)}
        </Badge>
        <span className="text-muted-foreground text-xs tabular-nums">
          {fmtDate(s.startedAt)} → {fmtDate(s.expiresAt)}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          결제 {fmtKrw(s.totalPaidKrw)}
        </span>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="h-7 rounded-full px-3 text-xs"
        >
          <Link to={`/admin/students/${s.userId}`}>학생 상세</Link>
        </Button>
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon?: typeof UserIcon;
  accent?: "amber" | "rose" | "emerald";
}) {
  const cls =
    accent === "amber"
      ? "text-amber-700 dark:text-amber-300"
      : accent === "rose"
        ? "text-rose-700 dark:text-rose-300"
        : accent === "emerald"
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-foreground";
  return (
    <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
      <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
