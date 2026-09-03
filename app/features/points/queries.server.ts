// feat-11-011 — 포인트 운영 조회·쓰기. 화면(admin-points)이 쓰는 얇은 층.

import adminClient from "~/core/lib/supa-admin-client.server";

// ★select 문자열은 **한 줄 리터럴**로 둔다. `"a, " + "b(...)"` 처럼 이어 붙이면
//   supabase-js 의 타입 수준 파서가 결과를 GenericStringError 로 떨어뜨려,
//   행의 모든 속성이 "존재하지 않음"이 된다(런타임은 멀쩡해 원인 찾기가 어렵다).
//   길어도 줄바꿈하지 말 것.

export interface PointOfferRow {
  offerId: string;
  couponId: string;
  couponName: string;
  couponStatus: string;
  discountLabel: string;
  usableDays: number | null;
  pointCost: number;
  stock: number | null;
  granted: number;
  isActive: boolean;
  sortOrder: number;
  note: string | null;
}

export interface PointLedgerRow {
  txnId: string;
  userId: string;
  userName: string | null;
  memberNo: number | null;
  delta: number;
  balanceAfter: number | null;
  kind: string;
  policyLabel: string | null;
  reason: string | null;
  orderNo: string | null;
  actorName: string | null;
  createdAt: string;
}

function discountLabel(type: string, value: number, max: number | null): string {
  if (type === "percent") {
    return `${value}%${max ? ` (최대 ${max.toLocaleString("ko-KR")}원)` : ""}`;
  }
  return `${value.toLocaleString("ko-KR")}원`;
}

export async function listPointOffers(): Promise<PointOfferRow[]> {
  const { data, error } = await adminClient
    .from("point_coupon_offers")
    // eslint-disable-next-line prettier/prettier
    .select("offer_id, coupon_id, point_cost, stock, is_active, sort_order, note, coupon:coupons!point_coupon_offers_coupon_id_fkey(name, status, discount_type, discount_value, max_discount, usable_days)")
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  // 발급 수(재고 표시용) — 쿠폰별 유효 발급 건수.
  const couponIds = rows.map((r) => r.coupon_id);
  const grantedBy = new Map<string, number>();
  if (couponIds.length) {
    const { data: grants } = await adminClient
      .from("coupon_grants")
      .select("coupon_id")
      .in("coupon_id", couponIds)
      .is("revoked_at", null);
    for (const g of grants ?? []) {
      grantedBy.set(g.coupon_id, (grantedBy.get(g.coupon_id) ?? 0) + 1);
    }
  }

  return rows.map((r) => {
    const c = r.coupon as {
      name: string;
      status: string;
      discount_type: string;
      discount_value: number;
      max_discount: number | null;
      usable_days: number | null;
    } | null;
    return {
      offerId: r.offer_id,
      couponId: r.coupon_id,
      couponName: c?.name ?? "(삭제된 쿠폰)",
      couponStatus: c?.status ?? "stopped",
      discountLabel: c
        ? discountLabel(c.discount_type, c.discount_value, c.max_discount)
        : "—",
      usableDays: c?.usable_days ?? null,
      pointCost: r.point_cost,
      stock: r.stock,
      granted: grantedBy.get(r.coupon_id) ?? 0,
      isActive: r.is_active,
      sortOrder: r.sort_order,
      note: r.note,
    };
  });
}

/** 아직 교환 상품으로 등록되지 않은 활성 쿠폰 — 등록 드롭다운용. */
export async function listCouponsForOffer(): Promise<
  { couponId: string; name: string; label: string }[]
> {
  const [{ data: coupons }, { data: offers }] = await Promise.all([
    adminClient
      .from("coupons")
      .select("coupon_id, name, discount_type, discount_value, max_discount")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    adminClient.from("point_coupon_offers").select("coupon_id").is("deleted_at", null),
  ]);
  const taken = new Set((offers ?? []).map((o) => o.coupon_id));
  return (coupons ?? [])
    .filter((c) => !taken.has(c.coupon_id))
    .map((c) => ({
      couponId: c.coupon_id,
      name: c.name,
      label: `${c.name} · ${discountLabel(c.discount_type, c.discount_value, c.max_discount)}`,
    }));
}

export async function listPointLedger(options: {
  query?: string;
  kind?: string;
  limit?: number;
}): Promise<PointLedgerRow[]> {
  let q = adminClient
    .from("point_transactions")
    // eslint-disable-next-line prettier/prettier
    .select("txn_id, user_id, delta, balance_after, kind, reason, order_id, created_at, policy:point_policies!point_transactions_policy_key_fkey(label), user:profiles!point_transactions_user_id_fkey(name, member_no), actor:profiles!point_transactions_actor_id_fkey(name)")
    .order("created_at", { ascending: false })
    .limit(Math.min(options.limit ?? 300, 1000));
  if (options.kind) q = q.eq("kind", options.kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((r) => {
    const u = r.user as { name: string | null; member_no: number | null } | null;
    return {
      txnId: r.txn_id,
      userId: r.user_id,
      userName: u?.name ?? null,
      memberNo: u?.member_no ?? null,
      delta: r.delta,
      balanceAfter: r.balance_after,
      kind: r.kind,
      policyLabel: (r.policy as { label: string } | null)?.label ?? null,
      reason: r.reason,
      orderNo: r.order_id ? r.order_id.slice(0, 8) : null,
      actorName: (r.actor as { name: string | null } | null)?.name ?? null,
      createdAt: r.created_at,
    };
  });
  const query = options.query?.trim();
  if (!query) return rows;
  return rows.filter(
    (r) =>
      (r.userName ?? "").includes(query) ||
      String(r.memberNo ?? "").includes(query) ||
      (r.reason ?? "").includes(query),
  );
}
