// 허브 경영 KPI 밴드 — 최근 30일 매출·환불·구독 건강 지표를 한 줄로 요약.
// manager+ 전용(민감 집계) — 호출부(허브 loader)에서 역할 확인 후에만 호출한다.
// 기존 통계 쿼리(sales-stats·subscription-stats)를 30일 범위로 재사용해 별도 스캔을 늘리지 않는다.

import { getSalesStats } from "~/features/subscriptions/sales-stats.server";
import { getSubscriptionStats } from "~/features/subscriptions/subscription-stats.server";

const KPI_WINDOW_DAYS = 30;

export interface BusinessKpis {
  windowDays: number;
  netKrw: number; // 순매출(결제−환불)
  grossKrw: number; // 결제(승인)액
  refundKrw: number; // 환불액
  refundRatePct: number | null; // 환불액/결제액
  activeSubs: number; // 현재 활성 구독
  churnRatePct: number | null; // 기간 해지율(해지/기간초 활성)
  expiringSoon: number; // 30일 내 만료 예정
  netSubChange: number; // 기간 신규−해지
}

export async function getBusinessKpis(): Promise<BusinessKpis> {
  const now = Date.now();
  const fromIso = new Date(now - KPI_WINDOW_DAYS * 86_400_000).toISOString();
  const toIso = new Date(now).toISOString();

  const [sales, subs] = await Promise.all([
    getSalesStats({ fromIso, toIso, granularity: "day" }),
    getSubscriptionStats({ fromIso, toIso }),
  ]);

  const gross = sales.summary.total.grossKrw;
  const refund = sales.summary.total.refundKrw;
  return {
    windowDays: KPI_WINDOW_DAYS,
    netKrw: sales.summary.total.netKrw,
    grossKrw: gross,
    refundKrw: refund,
    refundRatePct: gross > 0 ? (refund / gross) * 100 : null,
    activeSubs: subs.snapshot.activeCount,
    churnRatePct:
      subs.period.churnRate != null ? subs.period.churnRate * 100 : null,
    expiringSoon: subs.snapshot.expiringSoonCount,
    netSubChange: subs.period.netChange,
  };
}
