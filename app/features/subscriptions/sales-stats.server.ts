// feat-8-029 P2 · feat-11-007 #7~11 — 상품유형별(구독/강의/도서) 매출 통계.
// order_items 를 orders(status, created_at) 와 조인해 집계. 결제 인식 주문만 포함.
// 호출부에서 권한(manager+ 또는 lms_stats_view) 검증 필수. admin client(service_role) — RLS 우회.
//
// ★분류(3분할): item_type='book' → 도서 / plan product_kind in (course,tpass) → 강의 /
//   그 외 plan(subject·bundle·membership) → 정기구독. (recurring 구독 결제는 payments 경로가
//   별도이나, 주문 경유 구독분은 여기 '구독'으로 합류. 강의/도서 스트림은 주문 기반으로 정확.)
import adminClient from "~/core/lib/supa-admin-client.server";

import { kstBucketKey, type StatsGranularity } from "./payments-admin.server";
import {
  classifyItem as classify,
  type ItemCategory,
} from "./sales-stats-labels";

export type { ItemCategory } from "./sales-stats-labels";

/** 매출 인식 대상 주문 상태(결제 완료 계열). draft/pending/cancelled/failed 제외. */
const PAID_STATUSES = ["paid", "partially_refunded", "refunded"];

export interface CategoryAgg {
  itemCount: number; // 판매 항목 건수
  qty: number; // 수량 합
  grossKrw: number; // 결제(승인)액
  refundKrw: number; // 환불액
  netKrw: number; // 순매출
}
type Cats = Record<ItemCategory, CategoryAgg>;

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
  summary: Cats & { total: CategoryAgg };
  buckets: Array<{ key: string } & Cats>;
  rank: ProductRankRow[]; // 전 카테고리 순매출 순
}

function emptyAgg(): CategoryAgg {
  return { itemCount: 0, qty: 0, grossKrw: 0, refundKrw: 0, netKrw: 0 };
}
function emptyCats(): Cats {
  return { subscription: emptyAgg(), course: emptyAgg(), book: emptyAgg() };
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
  plan: {
    name: string;
    product_kind: string | null;
    lecture_category: string | null;
    subject_codes: string[] | null;
  } | null;
  book: { title: string; category_id: string | null } | null;
}

const SELECT =
  "item_type, plan_id, book_id, quantity, unit_price_krw, refunded_at, refund_amount_krw, " +
  "orders!inner(status, created_at), " +
  "plan:subscription_plans!order_items_plan_id_fkey(name, product_kind, lecture_category, subject_codes), " +
  "book:books!order_items_book_fk(title, category_id)";

export interface SalesStatsFilter {
  fromIso: string | null;
  toIso: string | null;
  granularity: StatsGranularity;
  // 강의 스트림 좁히기(선택) — 지정 시 해당 조건의 강의 항목만 집계(구독·도서 제외).
  lectureCategory?: string | null; // round1|round2|package|onsite
  subject?: string | null; // 과목 코드
  // 도서 스트림 좁히기(선택) — 지정 시 해당 카테고리 도서만(강의·구독 제외).
  bookCategoryId?: string | null;
}

export async function getSalesStats(
  f: SalesStatsFilter,
): Promise<SalesStatsResult> {
  let q = adminClient
    .from("order_items")
    .select(SELECT)
    .in("orders.status", PAID_STATUSES)
    .limit(20000);
  if (f.fromIso) q = q.gte("orders.created_at", f.fromIso);
  if (f.toIso) q = q.lt("orders.created_at", f.toIso);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as OrderItemRow[];

  const courseFilterOn = Boolean(f.lectureCategory || f.subject);
  const bookFilterOn = Boolean(f.bookCategoryId);

  const summary: Cats & { total: CategoryAgg } = {
    ...emptyCats(),
    total: emptyAgg(),
  };
  const buckets = new Map<string, { key: string } & Cats>();
  const products = new Map<string, ProductRankRow>();

  for (const r of rows) {
    const category = classify(r.item_type, r.plan?.product_kind ?? null);

    // 스트림별 필터 — 강의 필터가 켜지면 강의 항목만, 도서 필터가 켜지면 도서 항목만.
    if (courseFilterOn) {
      if (category !== "course") continue;
      if (f.lectureCategory && r.plan?.lecture_category !== f.lectureCategory)
        continue;
      if (f.subject && !(r.plan?.subject_codes ?? []).includes(f.subject))
        continue;
    }
    if (bookFilterOn) {
      if (category !== "book") continue;
      if (r.book?.category_id !== f.bookCategoryId) continue;
    }

    const gross = (r.unit_price_krw ?? 0) * (r.quantity ?? 1);
    const refund = r.refunded_at ? (r.refund_amount_krw ?? gross) : 0;
    const qty = r.quantity ?? 1;

    addToAgg(summary[category], gross, refund, qty);
    addToAgg(summary.total, gross, refund, qty);

    const createdAt = r.orders?.created_at;
    if (createdAt) {
      const key = kstBucketKey(createdAt, f.granularity);
      let b = buckets.get(key);
      if (!b) {
        b = { key, ...emptyCats() };
        buckets.set(key, b);
      }
      addToAgg(b[category], gross, refund, qty);
    }

    // 상품 랭킹 — 강의/구독은 plan_id, 도서는 book_id 로 그룹.
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

  return {
    summary,
    buckets: [...buckets.values()].sort((a, b) => b.key.localeCompare(a.key)),
    rank: [...products.values()].sort((a, b) => b.netKrw - a.netKrw),
  };
}
