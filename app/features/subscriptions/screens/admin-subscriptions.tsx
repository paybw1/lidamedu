// feat-7-014 — 운영자 수강권 관리. manager+ 권한.
// 조회 + 재량 조정: 수동 부여(결제 없음) / 만료 연장 / 취소 — 전부 사유 필수·감사 로그.

import { useEffect, useState } from "react";
import {
  AlertTriangleIcon,
  CalendarCheckIcon,
  CreditCardIcon,
  HistoryIcon,
  PlusIcon,
  UserIcon,
} from "lucide-react";
import { Link, redirect, useFetcher } from "react-router";
import { toast } from "sonner";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/core/components/ui/dialog";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  listAllSubscriptions,
  listSubscriptionAdminLogs,
  type StudentCandidate,
  type SubscriptionAdminLogRow,
  type SubscriptionWithUser,
} from "~/features/subscriptions/admin-queries.server";
import { SUBSCRIPTION_STATUS_LABEL } from "~/features/subscriptions/labels";
import {
  listAllPlans,
  listSubscriptionPlans,
} from "~/features/subscriptions/queries.server";

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

  const [items, plans, allPlans] = await Promise.all([
    listAllSubscriptions({
      status: status === "all" ? "all" : status,
      planCode: planCode || undefined,
      search: search || undefined,
      expiringInDays: expiring ? 7 : undefined,
      limit: 500,
    }),
    listSubscriptionPlans(client),
    // 재량 부여 옵션 — 판매 전(비활성) 상품 포함(운영자 재량은 판매 게이트와 별개).
    listAllPlans(),
  ]);
  const logsBySub = await listSubscriptionAdminLogs(
    items.map((i) => i.subscriptionId),
  );

  return {
    items,
    plans,
    allPlans,
    logsBySub,
    filter: { status, planCode, search, expiring },
  };
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

const LOG_ACTION_LABEL: Record<SubscriptionAdminLogRow["action"], string> = {
  grant: "수동 부여",
  extend: "기간 연장",
  cancel: "취소",
  auto_cancel: "자동 취소(재부여)",
};

type PlanOption = Route.ComponentProps["loaderData"]["plans"][number];

export default function AdminSubscriptions({ loaderData }: Route.ComponentProps) {
  const { items, plans, allPlans, logsBySub, filter } = loaderData;
  // 수동 부여 대상 상품 = 자기학습 계열(개별 과목/번들)만 — 종합반은 반 배정이 수강권.
  // 판매 전(비활성) 상품도 재량 부여 가능하므로 전체 플랜에서 파생.
  const grantPlans = allPlans.filter(
    (p) => p.productKind === "subject" || p.productKind === "bundle",
  );

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
    <AdminShell title="수강권 관리" cluster="products">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
              <CreditCardIcon className="text-link size-5" /> 수강권 / 결제 관리
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              운영자 재량으로 수강권을 부여·연장·취소합니다. 모든 조정은 사유와
              함께 이력에 남습니다. 종합반 수강권은 반 관리(반 배정)에서.
            </p>
          </div>
          <GrantDialog plans={grantPlans} />
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
              <SubRow
                key={s.subscriptionId}
                s={s}
                logs={logsBySub[s.subscriptionId] ?? []}
              />
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}

// ── 수동 부여 다이얼로그 ────────────────────────────────────────────────────

function GrantDialog({ plans }: { plans: PlanOption[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<StudentCandidate | null>(null);
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? "");
  const searchFetcher = useFetcher<{
    candidates?: StudentCandidate[];
    error?: string;
  }>();
  const grantFetcher = useFetcher<{ error?: string; ok?: boolean }>();
  const busy = grantFetcher.state !== "idle";

  useEffect(() => {
    if (grantFetcher.state === "idle" && grantFetcher.data) {
      if (grantFetcher.data.error) toast.error(grantFetcher.data.error);
      else {
        toast.success("수강권을 부여했습니다.");
        setOpen(false);
        setPicked(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantFetcher.state, grantFetcher.data]);

  const selectedPlan = plans.find((p) => p.code === planCode);
  const candidates = searchFetcher.data?.candidates ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPicked(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full">
          <PlusIcon className="size-3.5" /> 수강권 부여
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>수강권 수동 부여</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {/* 1) 학생 선택 */}
          {picked ? (
            <div className="border-border bg-muted/40 flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="font-semibold">
                {picked.name ?? picked.nickname ?? "(이름 없음)"}
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  회원번호 {picked.memberNo ?? "-"}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => setPicked(null)}
              >
                변경
              </Button>
            </div>
          ) : (
            <div>
              <searchFetcher.Form
                method="post"
                action="/api/admin/subscription"
                className="flex gap-2"
              >
                <input type="hidden" name="intent" value="find_user" />
                <Input
                  name="q"
                  placeholder="학생 이름·닉네임 또는 회원번호"
                  className="h-8 text-xs"
                  autoFocus
                />
                <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                  검색
                </Button>
              </searchFetcher.Form>
              {searchFetcher.state === "idle" && searchFetcher.data ? (
                candidates.length === 0 ? (
                  <p className="text-muted-foreground mt-2 text-xs">
                    검색 결과가 없습니다.
                  </p>
                ) : (
                  <ul className="border-border mt-2 divide-y rounded-lg border">
                    {candidates.map((c) => (
                      <li key={c.userId}>
                        <button
                          type="button"
                          onClick={() => setPicked(c)}
                          className="hover:bg-muted/50 flex w-full items-center justify-between px-3 py-2 text-left text-xs"
                        >
                          <span className="font-medium">
                            {c.name ?? c.nickname ?? "(이름 없음)"}
                          </span>
                          <span className="text-muted-foreground">
                            회원번호 {c.memberNo ?? "-"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          )}

          {/* 2) 상품·기간·사유 */}
          <grantFetcher.Form method="post" action="/api/admin/subscription" className="space-y-3">
            <input type="hidden" name="intent" value="grant" />
            <input type="hidden" name="userId" value={picked?.userId ?? ""} />
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-muted-foreground text-xs font-semibold">상품</span>
                <select
                  name="planCode"
                  value={planCode}
                  onChange={(e) => setPlanCode(e.target.value)}
                  className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
                >
                  {plans.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                      {!p.isActive ? " (판매 전)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground text-xs font-semibold">기간(일)</span>
                <Input
                  name="durationDays"
                  type="number"
                  min={1}
                  max={3650}
                  key={planCode}
                  defaultValue={selectedPlan?.durationDays ?? 365}
                  className="h-8 text-xs"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-muted-foreground text-xs font-semibold">
                부여 사유 (필수 — 이력에 기록)
              </span>
              <Textarea
                name="note"
                required
                minLength={2}
                maxLength={500}
                rows={2}
                placeholder="예: 오프라인 결제 확인, 이벤트 제공, 보상 연장 등"
                className="text-xs"
              />
            </label>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              결제 없이 부여되며 매출·정산에 잡히지 않습니다. 같은 상품의 활성
              수강권이 있으면 기간이 연장되고, 다른 상품이 활성 상태면 기존
              수강권은 자동 취소 후 새로 부여됩니다.
            </p>
            <Button type="submit" size="sm" disabled={!picked || busy} className="w-full">
              {busy ? "처리 중…" : "부여"}
            </Button>
          </grantFetcher.Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── 행: 수강권 + 조정 액션 + 이력 ──────────────────────────────────────────

function SubRow({
  s,
  logs,
}: {
  s: SubscriptionWithUser;
  logs: SubscriptionAdminLogRow[];
}) {
  const [showLogs, setShowLogs] = useState(false);
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
        {s.manualGrant ? (
          <Badge
            variant="outline"
            className="border-sky-500/40 text-xs text-sky-700 dark:text-sky-300"
          >
            수동 부여
          </Badge>
        ) : null}
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
        <ExtendDialog subscriptionId={s.subscriptionId} planName={s.planName} />
        {s.status === "active" ? (
          <CancelDialog subscriptionId={s.subscriptionId} planName={s.planName} />
        ) : null}
        {logs.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 rounded-full px-2 text-xs"
            onClick={() => setShowLogs((v) => !v)}
          >
            <HistoryIcon className="size-3" /> 이력 {logs.length}
          </Button>
        ) : null}
        <Button
          asChild
          size="sm"
          variant="outline"
          className="h-7 rounded-full px-3 text-xs"
        >
          <Link to={`/admin/students/${s.userId}`}>학생 상세</Link>
        </Button>
      </div>
      {s.adminNote ? (
        <p className="text-muted-foreground mt-1.5 text-[11px]">
          메모: {s.adminNote}
        </p>
      ) : null}
      {showLogs ? (
        <ul className="border-border mt-2 space-y-1 border-t pt-2">
          {logs.map((l) => (
            <li key={l.logId} className="text-muted-foreground text-[11px]">
              <span className="text-foreground font-semibold">
                {LOG_ACTION_LABEL[l.action]}
              </span>{" "}
              · {new Date(l.createdAt).toLocaleString("ko-KR")} ·{" "}
              {l.actorName ?? "(알 수 없음)"}
              {typeof l.detail?.addDays === "number" ? ` · +${l.detail.addDays}일` : ""}
              {typeof l.detail?.durationDays === "number"
                ? ` · ${l.detail.durationDays}일`
                : ""}
              {l.note ? ` — ${l.note}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ExtendDialog({
  subscriptionId,
  planName,
}: {
  subscriptionId: string;
  planName: string;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ error?: string }>();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.error) toast.error(fetcher.data.error);
      else {
        toast.success("만료일을 연장했습니다.");
        setOpen(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 rounded-full px-3 text-xs">
          연장
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>기간 연장 — {planName}</DialogTitle>
        </DialogHeader>
        <fetcher.Form method="post" action="/api/admin/subscription" className="space-y-3 text-sm">
          <input type="hidden" name="intent" value="extend" />
          <input type="hidden" name="subscriptionId" value={subscriptionId} />
          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs font-semibold">추가 기간(일)</span>
            <Input name="addDays" type="number" min={1} max={3650} defaultValue={30} className="h-8 text-xs" />
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs font-semibold">
              사유 (필수 — 이력에 기록)
            </span>
            <Textarea name="note" required minLength={2} maxLength={500} rows={2} className="text-xs" />
          </label>
          <p className="text-muted-foreground text-[11px]">
            만료·취소 상태면 다시 활성으로 전환됩니다.
          </p>
          <Button type="submit" size="sm" disabled={busy} className="w-full">
            {busy ? "처리 중…" : "연장"}
          </Button>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  subscriptionId,
  planName,
}: {
  subscriptionId: string;
  planName: string;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ error?: string }>();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.error) toast.error(fetcher.data.error);
      else {
        toast.success("수강권을 취소했습니다.");
        setOpen(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-full px-3 text-xs text-rose-600 dark:text-rose-400"
        >
          취소
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>수강권 취소 — {planName}</DialogTitle>
        </DialogHeader>
        <fetcher.Form method="post" action="/api/admin/subscription" className="space-y-3 text-sm">
          <input type="hidden" name="intent" value="cancel" />
          <input type="hidden" name="subscriptionId" value={subscriptionId} />
          <p className="text-muted-foreground text-xs leading-relaxed">
            학생의 해당 과목 접근이 즉시 잠깁니다. 되돌리려면 연장으로 다시
            활성화할 수 있습니다. 취소하시겠습니까?
          </p>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs font-semibold">
              사유 (필수 — 이력에 기록)
            </span>
            <Textarea name="note" required minLength={2} maxLength={500} rows={2} className="text-xs" />
          </label>
          <Button type="submit" size="sm" variant="destructive" disabled={busy} className="w-full">
            {busy ? "처리 중…" : "취소 확정"}
          </Button>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
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
