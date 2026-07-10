// feat-8-029 P5 — 정기구독 통계.
// user_subscriptions 스냅샷(현재 활성·자동갱신 유지) + 기간 지표(신규·해지·순증).
// 호출부에서 권한(manager+) 검증 필수. admin client(service_role) — RLS 우회.

import adminClient from "~/core/lib/supa-admin-client.server";

/** 해지 의미(queries.server cancelSubscription):
 *  - 환불 해지(3일 내): status='cancelled' + cancelled_at, 즉시 종료.
 *  - 갱신 중지(3일 후): auto_renew=false + cancelled_at, status는 active 유지(잔여기간 이용).
 *  갱신 대상(chargeDueRenewals): status=active · auto_renew=true · cancelled_at IS NULL. */

export interface SubscriptionSnapshot {
  activeCount: number; // 현재 접근 가능한 구독(활성·만료 전, 즉시해지 제외)
  autoRenewCount: number; // 그 중 자동갱신 유지(auto_renew=true · cancelled_at null)
  cancelScheduledCount: number; // 그 중 해지 예정(auto_renew off 또는 cancelled_at 있으나 잔여 이용)
  autoRenewRatio: number; // autoRenewCount / activeCount (0~1)
  billingKeyCount: number; // 자동결제 카드 보유(활성 billing_keys)
  expiringSoonCount: number; // 30일 내 만료 예정 활성 구독
}

export interface SubscriptionPeriod {
  newCount: number; // 기간 내 신규(started_at)
  cancelRefundCount: number; // 기간 내 환불 해지(status=cancelled)
  cancelRenewOffCount: number; // 기간 내 갱신 중지(status≠cancelled)
  cancelTotal: number;
  netChange: number; // 신규 − 해지
  activeAtStart: number; // 기간 시작 시점 활성 추정(해지율 분모)
  churnRate: number | null; // cancelTotal / activeAtStart (분모 0이면 null)
}

export interface SubscriptionStatusBreakdown {
  status: string;
  count: number;
}

export interface SubscriptionPlanRank {
  planId: string;
  name: string;
  activeCount: number;
}

export interface SubscriptionStatsResult {
  snapshot: SubscriptionSnapshot;
  period: SubscriptionPeriod;
  statusBreakdown: SubscriptionStatusBreakdown[];
  planRank: SubscriptionPlanRank[];
}

interface SubRow {
  status: string;
  auto_renew: boolean | null;
  cancelled_at: string | null;
  started_at: string | null;
  expires_at: string | null;
  plan_id: string | null;
  subscription_plans: { name: string } | null;
}

/** 시점 T 에 접근 가능(활성)했는지 추정 — 정확한 이력이 없어 필드 기반 근사.
 *  즉시 해지(status=cancelled)는 cancelled_at 이후 종료로 간주, 갱신중지는 만료까지 활성. */
function wasActiveAt(r: SubRow, tMs: number): boolean {
  const started = r.started_at ? Date.parse(r.started_at) : null;
  if (started == null || started > tMs) return false;
  const expires = r.expires_at ? Date.parse(r.expires_at) : null;
  if (expires != null && expires <= tMs) return false;
  if (r.status === "cancelled" && r.cancelled_at && Date.parse(r.cancelled_at) <= tMs) {
    return false; // 즉시 종료
  }
  // pending/failed 는 미개시로 취급
  if (r.status === "pending" || r.status === "failed") return false;
  return true;
}

export async function getSubscriptionStats(range: {
  fromIso: string | null;
  toIso: string | null;
}): Promise<SubscriptionStatsResult> {
  const [{ data: subsData, error }, { count: billingKeyCount }] = await Promise.all([
    adminClient
      .from("user_subscriptions")
      .select(
        "status, auto_renew, cancelled_at, started_at, expires_at, plan_id, subscription_plans(name)",
      )
      .limit(20000),
    adminClient
      .from("billing_keys")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);
  if (error) throw error;
  const subs = (subsData ?? []) as unknown as SubRow[];

  const nowMs = Date.now();
  const soonMs = nowMs + 30 * 86400_000;
  const fromMs = range.fromIso ? Date.parse(range.fromIso) : null;
  const toMs = range.toIso ? Date.parse(range.toIso) : null;
  const inPeriod = (iso: string | null): boolean => {
    if (!iso) return false;
    const t = Date.parse(iso);
    if (fromMs != null && t < fromMs) return false;
    if (toMs != null && t >= toMs) return false;
    return true;
  };

  const snapshot: SubscriptionSnapshot = {
    activeCount: 0,
    autoRenewCount: 0,
    cancelScheduledCount: 0,
    autoRenewRatio: 0,
    billingKeyCount: billingKeyCount ?? 0,
    expiringSoonCount: 0,
  };
  const period: SubscriptionPeriod = {
    newCount: 0,
    cancelRefundCount: 0,
    cancelRenewOffCount: 0,
    cancelTotal: 0,
    netChange: 0,
    activeAtStart: 0,
    churnRate: null,
  };
  const statusMap = new Map<string, number>();
  const planMap = new Map<string, SubscriptionPlanRank>();

  for (const r of subs) {
    statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1);

    const liveNow = wasActiveAt(r, nowMs);
    if (liveNow) {
      snapshot.activeCount += 1;
      const renewing = r.auto_renew === true && r.cancelled_at == null;
      if (renewing) snapshot.autoRenewCount += 1;
      else snapshot.cancelScheduledCount += 1;
      if (r.expires_at && Date.parse(r.expires_at) <= soonMs) {
        snapshot.expiringSoonCount += 1;
      }
      if (r.plan_id) {
        let p = planMap.get(r.plan_id);
        if (!p) {
          p = {
            planId: r.plan_id,
            name: r.subscription_plans?.name ?? "(상품)",
            activeCount: 0,
          };
          planMap.set(r.plan_id, p);
        }
        p.activeCount += 1;
      }
    }

    // 기간 지표
    if (inPeriod(r.started_at)) period.newCount += 1;
    if (inPeriod(r.cancelled_at)) {
      if (r.status === "cancelled") period.cancelRefundCount += 1;
      else period.cancelRenewOffCount += 1;
    }
    if (fromMs != null && wasActiveAt(r, fromMs)) period.activeAtStart += 1;
  }

  snapshot.autoRenewRatio =
    snapshot.activeCount > 0 ? snapshot.autoRenewCount / snapshot.activeCount : 0;
  period.cancelTotal = period.cancelRefundCount + period.cancelRenewOffCount;
  period.netChange = period.newCount - period.cancelTotal;
  period.churnRate =
    period.activeAtStart > 0 ? period.cancelTotal / period.activeAtStart : null;

  return {
    snapshot,
    period,
    statusBreakdown: [...statusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    planRank: [...planMap.values()].sort((a, b) => b.activeCount - a.activeCount),
  };
}
