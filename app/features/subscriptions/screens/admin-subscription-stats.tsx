// feat-8-029 P5 — 정기구독 통계 (manager+).
// 스냅샷(활성·자동갱신 유지율·해지 예정·자동결제 카드) + 기간(신규·해지·순증·해지율).

import { RefreshCwIcon, UsersIcon } from "lucide-react";
import { Form, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Bar, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { SUBSCRIPTION_STATUS_LABEL } from "~/features/subscriptions/labels";
import { getSubscriptionStats } from "~/features/subscriptions/subscription-stats.server";

import type { Route } from "./+types/admin-subscription-stats";

export const meta: Route.MetaFunction = () => [{ title: "구독 통계 | 운영자" }];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
type PeriodPreset = "this_month" | "30d" | "90d" | "this_year" | "all";

function presetRange(preset: PeriodPreset): { fromIso: string | null; toIso: string | null } {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const kstToUtcIso = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m, d) - KST_OFFSET_MS).toISOString();
  if (preset === "this_month") {
    return { fromIso: kstToUtcIso(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), 1), toIso: null };
  }
  if (preset === "this_year") {
    return { fromIso: kstToUtcIso(nowKst.getUTCFullYear(), 0, 1), toIso: null };
  }
  if (preset === "30d" || preset === "90d") {
    const days = preset === "30d" ? 30 : 90;
    return { fromIso: new Date(Date.now() - days * 86400_000).toISOString(), toIso: null };
  }
  return { fromIso: null, toIso: null };
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const { data: prof } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!roleAtLeast(prof?.role, "manager")) throw redirect("/admin");

  const url = new URL(request.url);
  const preset = (url.searchParams.get("period") ?? "this_month") as PeriodPreset;
  const { fromIso, toIso } = presetRange(preset);
  const stats = await getSubscriptionStats({ fromIso, toIso });
  return { stats, filter: { preset } };
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function AdminSubscriptionStats({ loaderData }: Route.ComponentProps) {
  const { stats, filter } = loaderData;
  const { snapshot, period, statusBreakdown, planRank } = stats;
  const maxStatus = Math.max(1, ...statusBreakdown.map((s) => s.count));
  const maxPlan = Math.max(1, ...planRank.map((p) => p.activeCount));

  return (
    <AdminShell
      cluster="sales"
      title="구독 통계"
      desc="정기구독(user_subscriptions) 현황과 기간별 신규·해지 추이입니다. '자동갱신 유지율'은 현재 활성 구독 중 자동갱신이 켜져 있고 해지되지 않은 비율입니다."
    >
      <Form
        method="get"
        className="border-border bg-card mb-4 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold">기간(신규·해지)</span>
          <AdminSelect name="period" defaultValue={filter.preset}>
            <option value="this_month">이번 달</option>
            <option value="30d">최근 30일</option>
            <option value="90d">최근 90일</option>
            <option value="this_year">올해</option>
            <option value="all">전체</option>
          </AdminSelect>
        </label>
        <Button type="submit" size="sm" variant="outline">
          적용
        </Button>
      </Form>

      {/* 현재 스냅샷 */}
      <SectionTitle icon={<UsersIcon className="size-3.5" />}>현재 스냅샷</SectionTitle>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="활성 구독"
          value={snapshot.activeCount.toLocaleString("ko-KR")}
          sub={`만료 임박(30일) ${snapshot.expiringSoonCount}건`}
        />
        <StatCard
          label="자동갱신 유지율"
          value={pct(snapshot.autoRenewRatio)}
          sub={`유지 ${snapshot.autoRenewCount} · 해지 예정 ${snapshot.cancelScheduledCount}`}
          tone="emerald"
        />
        <StatCard
          label="해지 예정"
          value={snapshot.cancelScheduledCount.toLocaleString("ko-KR")}
          sub="잔여기간 이용·갱신 안 함"
          tone={snapshot.cancelScheduledCount > 0 ? "coral" : undefined}
        />
        <StatCard
          label="자동결제 카드"
          value={snapshot.billingKeyCount.toLocaleString("ko-KR")}
          sub="빌링키 보유 회원"
        />
        <StatCard
          label="결제 실패 회수 중"
          value={snapshot.dunningCount.toLocaleString("ko-KR")}
          sub="자동결제 실패·재시도 유예 중"
          tone={snapshot.dunningCount > 0 ? "coral" : undefined}
        />
      </div>

      {/* 기간 지표 */}
      <SectionTitle icon={<RefreshCwIcon className="size-3.5" />}>
        기간 신규·해지
      </SectionTitle>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="신규 구독" value={`+${period.newCount}`} tone="emerald" />
        <StatCard
          label="해지"
          value={`−${period.cancelTotal}`}
          sub={`환불 ${period.cancelRefundCount} · 갱신중지 ${period.cancelRenewOffCount}`}
          tone={period.cancelTotal > 0 ? "coral" : undefined}
        />
        <StatCard
          label="순증"
          value={`${period.netChange >= 0 ? "+" : ""}${period.netChange}`}
          tone={period.netChange >= 0 ? "emerald" : "coral"}
        />
        <StatCard
          label="해지율"
          value={period.churnRate == null ? "—" : pct(period.churnRate)}
          sub={
            period.churnRate == null
              ? "기간 시작 활성 없음"
              : `기간초 활성 ${period.activeAtStart} 기준`
          }
        />
      </div>

      {/* 상태 분포 */}
      <SectionTitle>상태 분포(전체)</SectionTitle>
      <div className="mb-5">
        {statusBreakdown.length === 0 ? (
          <EmptyBox>구독 데이터가 없습니다.</EmptyBox>
        ) : (
          <IndexTable
            minWidth={520}
            headers={[
              { label: "상태", width: "8rem" },
              { label: "건수", align: "right", width: "6rem" },
              { label: "" },
            ]}
          >
            {statusBreakdown.map((s) => (
              <TR key={s.status}>
                <TD>
                  {SUBSCRIPTION_STATUS_LABEL[s.status as keyof typeof SUBSCRIPTION_STATUS_LABEL] ??
                    s.status}
                </TD>
                <TD align="right" mono>
                  {s.count.toLocaleString("ko-KR")}
                </TD>
                <TD>
                  <Bar value={s.count} max={maxStatus} className="w-full min-w-[80px]" />
                </TD>
              </TR>
            ))}
          </IndexTable>
        )}
      </div>

      {/* 상품별 활성 구독 */}
      <SectionTitle>상품별 활성 구독</SectionTitle>
      {planRank.length === 0 ? (
        <EmptyBox>활성 구독이 없습니다.</EmptyBox>
      ) : (
        <IndexTable
          minWidth={560}
          headers={[
            { label: "상품" },
            { label: "활성", align: "right", width: "6rem" },
            { label: "" },
          ]}
        >
          {planRank.map((p) => (
            <TR key={p.planId}>
              <TD>{p.name}</TD>
              <TD align="right" mono>
                {p.activeCount.toLocaleString("ko-KR")}
              </TD>
              <TD>
                <Bar value={p.activeCount} max={maxPlan} className="w-full min-w-[80px]" />
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "emerald" | "coral";
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p
        className={
          "mt-1 text-xl font-bold tabular-nums " +
          (tone === "emerald"
            ? "text-emerald-700 dark:text-emerald-300"
            : tone === "coral"
              ? "text-rose-600 dark:text-rose-400"
              : "text-foreground")
        }
      >
        {value}
      </p>
      {sub ? <p className="text-muted-foreground mt-0.5 text-[11px]">{sub}</p> : null}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground mb-2 inline-flex items-center gap-1.5 text-[12px] font-bold tracking-widest uppercase">
      {icon} {children}
    </h2>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-card text-muted-foreground rounded-xl border py-10 text-center text-sm shadow-sm">
      {children}
    </div>
  );
}
