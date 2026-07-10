// feat-8-029 P2 — 항목(강의/교재)별 매출 통계.
// order_items 를 orders(status, created_at) 와 조인해 집계. 결제 인식 주문만 포함.
// 호출부에서 권한(manager+) 검증 필수. admin client(service_role) — RLS 우회.

import adminClient from "~/core/lib/supa-admin-client.server";

import { kstBucketKey, type StatsGranularity } from "./payments-admin.server";

/** 항목 카테고리 — 강의류(수강권/단과/패키지/멤버십) vs 교재(도서). */
export type ItemCategory = "course" | "book";

const CATEGORY_OF: Record<string, ItemCategory> = {
  plan: "course",
  course: "course",
  bundle: "course",
  membership: "course",
  book: "book",
};

/** 매출 인식 대상 주문 상태(결제 완료 계열). draft/pending/cancelled/failed 제외. */
const PAID_STATUSES = ["paid", "partially_refunded", "refunded"];

export interface CategoryAgg {
  itemCount: number; // 판매 항목 건수
  qty: number; // 수량 합
  grossKrw: number; // 결제(승인)액
  refundKrw: number; // 환불액
  netKrw: number; // 순매출
}

export interface ProductRankRow {
  id: string;
  name: string;
  category: ItemCategory;
  qty: number;
  grossKrw: number;
  refundKrw: number;
  netKrw: number;
}

export interface SalesStatsResult {
  summary: { course: CategoryAgg; book: CategoryAgg; total: CategoryAgg };
  buckets: Array<{ key: string; course: CategoryAgg; book: CategoryAgg }>;
  courseRank: ProductRankRow[];
  bookRank: ProductRankRow[];
}

function emptyAgg(): CategoryAgg {
  return { itemCount: 0, qty: 0, grossKrw: 0, refundKrw: 0, netKrw: 0 };
}

function addToAgg(agg: CategoryAgg, gross: number, refund: number, qty: number): void {
  agg.itemCount += 1;
  agg.qty += qty;
  agg.grossKrw += gross;
  agg.refundKrw += refund;
  agg.netKrw += gross - refund;
}

interface OrderItemRow {
  item_type: string;
  plan_id: string | null;
  book_id: string | null;
  quantity: number;
  unit_price_krw: number;
  refunded_at: string | null;
  refund_amount_krw: number | null;
  orders: { status: string; created_at: string } | null;
  plan: { name: string } | null;
  book: { title: string } | null;
}

const SELECT =
  "item_type, plan_id, book_id, quantity, unit_price_krw, refunded_at, refund_amount_krw, " +
  "orders!inner(status, created_at), " +
  "plan:subscription_plans!order_items_plan_id_fkey(name), book:books!order_items_book_fk(title)";

/**
 * 기간 내 결제 완료 주문의 항목을 집계.
 * gross = 항목 결제액(단가×수량, 환불돼도 원매출 카운트),
 * refund = 환불된 항목의 환불액(refund_amount_krw ?? 단가×수량).
 */
export async function getSalesStats(range: {
  fromIso: string | null;
  toIso: string | null;
  granularity: StatsGranularity;
}): Promise<SalesStatsResult> {
  let q = adminClient
    .from("order_items")
    .select(SELECT)
    .in("orders.status", PAID_STATUSES)
    .limit(20000);
  if (range.fromIso) q = q.gte("orders.created_at", range.fromIso);
  if (range.toIso) q = q.lt("orders.created_at", range.toIso);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as OrderItemRow[];

  const summary = { course: emptyAgg(), book: emptyAgg(), total: emptyAgg() };
  const buckets = new Map<string, { key: string; course: CategoryAgg; book: CategoryAgg }>();
  const products = new Map<string, ProductRankRow>();

  for (const r of rows) {
    const category = CATEGORY_OF[r.item_type] ?? "course";
    const gross = (r.unit_price_krw ?? 0) * (r.quantity ?? 1);
    const refund = r.refunded_at ? (r.refund_amount_krw ?? gross) : 0;
    const qty = r.quantity ?? 1;

    addToAgg(summary[category], gross, refund, qty);
    addToAgg(summary.total, gross, refund, qty);

    const createdAt = r.orders?.created_at;
    if (createdAt) {
      const key = kstBucketKey(createdAt, range.granularity);
      let b = buckets.get(key);
      if (!b) {
        b = { key, course: emptyAgg(), book: emptyAgg() };
        buckets.set(key, b);
      }
      addToAgg(b[category], gross, refund, qty);
    }

    // 상품 랭킹 — 강의류는 plan_id, 교재는 book_id 로 그룹.
    const groupId = category === "book" ? r.book_id : r.plan_id;
    if (groupId) {
      const rankKey = `${category}:${groupId}`;
      let p = products.get(rankKey);
      if (!p) {
        p = {
          id: groupId,
          name:
            category === "book"
              ? (r.book?.title ?? "(도서)")
              : (r.plan?.name ?? "(상품)"),
          category,
          qty: 0,
          grossKrw: 0,
          refundKrw: 0,
          netKrw: 0,
        };
        products.set(rankKey, p);
      }
      p.qty += qty;
      p.grossKrw += gross;
      p.refundKrw += refund;
      p.netKrw += gross - refund;
    }
  }

  const rankList = [...products.values()];
  return {
    summary,
    buckets: [...buckets.values()].sort((a, b) => b.key.localeCompare(a.key)),
    courseRank: rankList
      .filter((p) => p.category === "course")
      .sort((a, b) => b.netKrw - a.netKrw),
    bookRank: rankList
      .filter((p) => p.category === "book")
      .sort((a, b) => b.netKrw - a.netKrw),
  };
}
