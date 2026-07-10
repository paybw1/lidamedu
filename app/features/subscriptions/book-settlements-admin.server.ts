// feat-8-029 P6 — 도서정산 배분규칙 (manager+). 강사 배분규칙과 동일한 세대교체 모델.
// 값 수정 대신 "새 규칙 + 기존 비활성" — 정산 지급 근거 보존. 정산 계산/지급은 추후.
// 호출부에서 권한(manager+) 검증 필수. admin client(service_role) — RLS 정책 없음.

import adminClient from "~/core/lib/supa-admin-client.server";

import { monthRangeKst } from "./settlements-admin.server";

export type ShareKind = "percent" | "fixed";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface BookSettlementRule {
  ruleId: string;
  bookId: string | null; // null = 전체 기본
  bookTitle: string | null;
  payeeName: string;
  shareKind: ShareKind;
  shareValue: number;
  effectiveFrom: string;
  memo: string | null;
  isActive: boolean;
  createdAt: string;
}

export async function listBookSettlementRules(): Promise<BookSettlementRule[]> {
  const { data, error } = await adminClient
    .from("book_settlement_rules")
    .select(
      "rule_id, book_id, payee_name, share_kind, share_value, effective_from, memo, is_active, created_at, " +
        "book:books!book_settlement_rules_book_id_fkey(title)",
    )
    .order("is_active", { ascending: false })
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  // 임베드 조인 — PostgREST 타입 추론이 GenericStringError 로 실패해 명시 캐스팅.
  const rows = (data ?? []) as unknown as Array<{
    rule_id: string;
    book_id: string | null;
    payee_name: string;
    share_kind: string;
    share_value: number;
    effective_from: string;
    memo: string | null;
    is_active: boolean;
    created_at: string;
    book: { title: string } | null;
  }>;
  return rows.map((r) => ({
    ruleId: r.rule_id,
    bookId: r.book_id,
    bookTitle: r.book?.title ?? null,
    payeeName: r.payee_name,
    shareKind: r.share_kind as ShareKind,
    shareValue: r.share_value,
    effectiveFrom: r.effective_from,
    memo: r.memo,
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}

export async function createBookSettlementRule(input: {
  bookId: string | null;
  payeeName: string;
  shareKind: ShareKind;
  shareValue: number;
  effectiveFrom: string;
  memo: string | null;
  createdBy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const payee = input.payeeName.trim();
  if (!payee) return { ok: false, error: "정산 대상(저자/출판사)을 입력해 주세요." };
  if (input.shareKind === "percent" && (input.shareValue < 1 || input.shareValue > 100)) {
    return { ok: false, error: "정률은 1~100(%) 사이여야 합니다." };
  }
  if (input.shareValue < 0) return { ok: false, error: "배분 값이 올바르지 않습니다." };
  const { error } = await adminClient.from("book_settlement_rules").insert({
    book_id: input.bookId,
    payee_name: payee,
    share_kind: input.shareKind,
    share_value: input.shareValue,
    effective_from: input.effectiveFrom,
    memo: input.memo?.trim() || null,
    created_by: input.createdBy,
  });
  if (error) return { ok: false, error: "규칙 등록에 실패했습니다." };
  return { ok: true };
}

export async function toggleBookSettlementRule(
  ruleId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient
    .from("book_settlement_rules")
    .update({ is_active: isActive })
    .eq("rule_id", ruleId);
  if (error) return { ok: false, error: "상태 변경에 실패했습니다." };
  return { ok: true };
}

// ─── 도서정산 계산·지급 (강사정산 instructor_settlements 와 동형) ───────────────

export type SettlementStatus = "draft" | "confirmed" | "paid";

const PAID_ORDER_STATUSES = ["paid", "partially_refunded", "refunded"];

interface RuleForSettle {
  rule_id: string;
  book_id: string | null;
  payee_name: string;
  share_kind: ShareKind;
  share_value: number;
  effective_from: string;
}

interface BookItemForSettle {
  order_item_id: string;
  book_id: string | null;
  quantity: number;
  unit_price_krw: number;
  refunded_at: string | null;
  refund_amount_krw: number | null;
  saleDateKst: string; // orders.created_at → KST YYYY-MM-DD
  bookTitle: string | null;
}

/** 도서 order_item × 배분규칙 — book_id 일치(2) > 전체 기본(1), 동급이면 effective_from 최신. */
function pickBookRule(rules: RuleForSettle[], item: BookItemForSettle): RuleForSettle | null {
  const specificity = (r: RuleForSettle): number => {
    if (r.effective_from > item.saleDateKst) return 0;
    if (r.book_id === null) return 1;
    return r.book_id === item.book_id ? 2 : 0;
  };
  let best: RuleForSettle | null = null;
  let bestS = 0;
  for (const r of rules) {
    const s = specificity(r);
    if (s === 0) continue;
    if (
      s > bestS ||
      (s === bestS && best && r.effective_from > best.effective_from)
    ) {
      best = r;
      bestS = s;
    }
  }
  return best;
}

/** 배분액 — percent: 기준액×%, fixed: 권당 정액×수량(부분=기준액 비례). */
function shareOf(
  rule: RuleForSettle,
  baseKrw: number,
  itemGrossKrw: number,
  quantity: number,
): number {
  if (rule.share_kind === "percent") {
    return Math.round((baseKrw * rule.share_value) / 100);
  }
  if (itemGrossKrw <= 0) return rule.share_value * quantity;
  return Math.round((rule.share_value * quantity * baseKrw) / itemGrossKrw);
}

export interface GenerateBookResult {
  ok: boolean;
  created: { payeeName: string; total: number; items: number }[];
  skippedConfirmed: string[];
  error?: string;
}

/**
 * month("YYYY-MM") 도서정산 생성 — payee(저자/출판사)별 draft upsert.
 *   share: 해당 월 도서 판매(결제완료 주문)에 규칙 적용. 이미 타 정산에 잡힌 항목 제외.
 *   refund_adjustment: 해당 월 환불 중, 원 share 가 확정·지급된 정산에 있거나 당월 판매인 건 음수 차감.
 * 기존 draft 는 삭제 후 재생성. confirmed/paid 는 건드리지 않음.
 */
export async function generateBookSettlements(
  month: string,
  createdBy: string,
): Promise<GenerateBookResult> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, created: [], skippedConfirmed: [], error: "month 형식 YYYY-MM" };
  }
  const { fromIso, toIso, periodStart, periodEnd } = monthRangeKst(month);

  const toKstDate = (iso: string) =>
    new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
  const SELECT =
    "order_item_id, book_id, quantity, unit_price_krw, refunded_at, refund_amount_krw, " +
    "orders!inner(created_at, status), book:books!order_items_book_fk(title)";
  const mapItem = (r: unknown): BookItemForSettle => {
    const x = r as {
      order_item_id: string;
      book_id: string | null;
      quantity: number;
      unit_price_krw: number;
      refunded_at: string | null;
      refund_amount_krw: number | null;
      orders: { created_at: string; status: string } | null;
      book: { title: string } | null;
    };
    return {
      order_item_id: x.order_item_id,
      book_id: x.book_id,
      quantity: x.quantity ?? 1,
      unit_price_krw: x.unit_price_krw ?? 0,
      refunded_at: x.refunded_at,
      refund_amount_krw: x.refund_amount_krw,
      saleDateKst: x.orders?.created_at ? toKstDate(x.orders.created_at) : periodStart,
      bookTitle: x.book?.title ?? null,
    };
  };

  const [soldRes, refundRes, ruleRes] = await Promise.all([
    adminClient
      .from("order_items")
      .select(SELECT)
      .eq("item_type", "book")
      .in("orders.status", PAID_ORDER_STATUSES)
      .gte("orders.created_at", fromIso)
      .lt("orders.created_at", toIso)
      .limit(20000),
    adminClient
      .from("order_items")
      .select(SELECT)
      .eq("item_type", "book")
      .not("refunded_at", "is", null)
      .gte("refunded_at", fromIso)
      .lt("refunded_at", toIso)
      .limit(20000),
    adminClient
      .from("book_settlement_rules")
      .select("rule_id, book_id, payee_name, share_kind, share_value, effective_from")
      .eq("is_active", true)
      .limit(2000),
  ]);
  for (const r of [soldRes, refundRes, ruleRes]) {
    if (r.error) return { ok: false, created: [], skippedConfirmed: [], error: r.error.message };
  }
  const sold = (soldRes.data ?? []).map(mapItem);
  const refunds = (refundRes.data ?? []).map(mapItem);
  const rules = (ruleRes.data ?? []) as unknown as RuleForSettle[];

  // 이중 계상 방지 — (payee, order_item, kind) 전 기간 조회. 이번 달 draft 는 재생성 대상이라 제외.
  const { data: prevItems, error: prevErr } = await adminClient
    .from("book_settlement_items")
    .select("order_item_id, kind, book_settlements!inner(payee_name, status, period_start)")
    .limit(100000);
  if (prevErr) return { ok: false, created: [], skippedConfirmed: [], error: prevErr.message };
  const settled = new Set<string>();
  const sharedBy = new Map<string, Set<string>>(); // orderItemId → payees(원 share 존재)
  for (const it of (prevItems ?? []) as unknown as Array<{
    order_item_id: string;
    kind: string;
    book_settlements: { payee_name: string; status: string; period_start: string };
  }>) {
    const s = it.book_settlements;
    if (s.period_start === periodStart && s.status === "draft") continue;
    settled.add(`${s.payee_name}:${it.order_item_id}:${it.kind}`);
    if (it.kind === "share") {
      if (!sharedBy.has(it.order_item_id)) sharedBy.set(it.order_item_id, new Set());
      sharedBy.get(it.order_item_id)!.add(s.payee_name);
    }
  }

  type NewItem = {
    order_item_id: string;
    rule_id: string | null;
    kind: "share" | "refund_adjustment";
    share_kind: ShareKind;
    share_value: number;
    base_amount_krw: number;
    share_amount_krw: number;
    note: string | null;
  };
  const byPayee = new Map<string, NewItem[]>();
  const push = (payee: string, item: NewItem) => {
    if (!byPayee.has(payee)) byPayee.set(payee, []);
    byPayee.get(payee)!.push(item);
  };

  // share — 당월 판매. (당월 판매 & 당월 환불 건은 share 를 그대로 두고 아래 환불 루프가
  //  refund_adjustment 음수 항목을 명시 — 강사정산과 동일하게 순액이 두 줄로 남는다.)
  for (const it of sold) {
    const rule = pickBookRule(rules, it);
    if (!rule) continue;
    if (settled.has(`${rule.payee_name}:${it.order_item_id}:share`)) continue;
    const gross = it.unit_price_krw * it.quantity;
    push(rule.payee_name, {
      order_item_id: it.order_item_id,
      rule_id: rule.rule_id,
      kind: "share",
      share_kind: rule.share_kind,
      share_value: rule.share_value,
      base_amount_krw: gross,
      share_amount_krw: shareOf(rule, gross, gross, it.quantity),
      note: it.bookTitle,
    });
  }

  // refund_adjustment — 당월 환불.
  for (const it of refunds) {
    const gross = it.unit_price_krw * it.quantity;
    const refundKrw = it.refund_amount_krw ?? gross;
    if (refundKrw <= 0) continue;
    const rule = pickBookRule(rules, it);
    if (!rule) continue;
    const inThisMonth = it.saleDateKst >= periodStart && it.saleDateKst < periodEnd;
    const hadShare = sharedBy.get(it.order_item_id)?.has(rule.payee_name) ?? false;
    if (!hadShare && !inThisMonth) continue;
    if (settled.has(`${rule.payee_name}:${it.order_item_id}:refund_adjustment`)) continue;
    push(rule.payee_name, {
      order_item_id: it.order_item_id,
      rule_id: rule.rule_id,
      kind: "refund_adjustment",
      share_kind: rule.share_kind,
      share_value: rule.share_value,
      base_amount_krw: refundKrw,
      share_amount_krw: -shareOf(rule, refundKrw, gross, it.quantity),
      note: inThisMonth ? "당월 판매·환불" : "확정 정산분 환불 차감",
    });
  }

  // payee 별 정산 upsert.
  const created: GenerateBookResult["created"] = [];
  const skippedConfirmed: string[] = [];
  for (const [payeeName, items] of byPayee) {
    const total = items.reduce((a, i) => a + i.share_amount_krw, 0);
    const { data: existing } = await adminClient
      .from("book_settlements")
      .select("settlement_id, status")
      .eq("payee_name", payeeName)
      .eq("period_start", periodStart)
      .maybeSingle();
    if (existing && existing.status !== "draft") {
      skippedConfirmed.push(payeeName);
      continue;
    }
    let settlementId: string;
    if (existing) {
      settlementId = existing.settlement_id;
      await adminClient
        .from("book_settlement_items")
        .delete()
        .eq("settlement_id", settlementId);
      await adminClient
        .from("book_settlements")
        .update({ total_share_krw: total })
        .eq("settlement_id", settlementId);
    } else {
      const { data: ins, error: insErr } = await adminClient
        .from("book_settlements")
        .insert({
          payee_name: payeeName,
          period_start: periodStart,
          period_end: periodEnd,
          status: "draft",
          total_share_krw: total,
          created_by: createdBy,
        })
        .select("settlement_id")
        .single();
      if (insErr || !ins) {
        return { ok: false, created, skippedConfirmed, error: insErr?.message ?? "정산 insert 실패" };
      }
      settlementId = ins.settlement_id;
    }
    const { error: itemErr } = await adminClient
      .from("book_settlement_items")
      .insert(items.map((i) => ({ ...i, settlement_id: settlementId })));
    if (itemErr) return { ok: false, created, skippedConfirmed, error: itemErr.message };
    created.push({ payeeName, total, items: items.length });
  }
  return { ok: true, created, skippedConfirmed };
}

export interface BookSettlementRow {
  settlementId: string;
  payeeName: string;
  periodStart: string;
  periodEnd: string;
  status: SettlementStatus;
  totalShareKrw: number;
  itemCount: number;
  confirmedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export async function listBookSettlements(opts?: {
  month?: string;
}): Promise<BookSettlementRow[]> {
  let q = adminClient
    .from("book_settlements")
    .select(
      "settlement_id, payee_name, period_start, period_end, status, total_share_krw, confirmed_at, paid_at, created_at, book_settlement_items(item_id)",
    )
    .order("period_start", { ascending: false })
    .limit(500);
  if (opts?.month) q = q.eq("period_start", `${opts.month}-01`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    settlementId: r.settlement_id,
    payeeName: r.payee_name,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: r.status as SettlementStatus,
    totalShareKrw: r.total_share_krw,
    itemCount: (r.book_settlement_items ?? []).length,
    confirmedAt: r.confirmed_at,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  }));
}

export interface BookSettlementItemRow {
  itemId: string;
  orderItemId: string;
  kind: "share" | "refund_adjustment";
  shareKind: ShareKind;
  shareValue: number;
  baseAmountKrw: number;
  shareAmountKrw: number;
  note: string | null;
  bookTitle: string | null;
  quantity: number;
}

export async function getBookSettlementDetail(settlementId: string): Promise<{
  settlement: BookSettlementRow;
  items: BookSettlementItemRow[];
} | null> {
  const { data: s, error } = await adminClient
    .from("book_settlements")
    .select(
      "settlement_id, payee_name, period_start, period_end, status, total_share_krw, confirmed_at, paid_at, created_at",
    )
    .eq("settlement_id", settlementId)
    .maybeSingle();
  if (error) throw error;
  if (!s) return null;
  const { data: itemsData, error: itemErr } = await adminClient
    .from("book_settlement_items")
    .select(
      "item_id, order_item_id, kind, share_kind, share_value, base_amount_krw, share_amount_krw, note, created_at, " +
        "order_item:order_items!book_settlement_items_order_item_id_fkey(quantity, book:books!order_items_book_fk(title))",
    )
    .eq("settlement_id", settlementId)
    .order("created_at", { ascending: true })
    .limit(20000);
  if (itemErr) throw itemErr;
  const items = (itemsData ?? []) as unknown as Array<{
    item_id: string;
    order_item_id: string;
    kind: string;
    share_kind: string;
    share_value: number;
    base_amount_krw: number;
    share_amount_krw: number;
    note: string | null;
    order_item: { quantity: number; book: { title: string } | null } | null;
  }>;
  return {
    settlement: {
      settlementId: s.settlement_id,
      payeeName: s.payee_name,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      status: s.status as SettlementStatus,
      totalShareKrw: s.total_share_krw,
      itemCount: items.length,
      confirmedAt: s.confirmed_at,
      paidAt: s.paid_at,
      createdAt: s.created_at,
    },
    items: items.map((i) => ({
      itemId: i.item_id,
      orderItemId: i.order_item_id,
      kind: i.kind as "share" | "refund_adjustment",
      shareKind: i.share_kind as ShareKind,
      shareValue: i.share_value,
      baseAmountKrw: i.base_amount_krw,
      shareAmountKrw: i.share_amount_krw,
      note: i.note,
      bookTitle: i.order_item?.book?.title ?? null,
      quantity: i.order_item?.quantity ?? 1,
    })),
  };
}

export async function transitionBookSettlement(
  settlementId: string,
  to: "confirmed" | "paid" | "draft",
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: s } = await adminClient
    .from("book_settlements")
    .select("status")
    .eq("settlement_id", settlementId)
    .maybeSingle();
  if (!s) return { ok: false, error: "정산 없음" };
  const allowed: Record<string, string[]> = {
    draft: ["confirmed"],
    confirmed: ["paid", "draft"],
    paid: [],
  };
  if (!allowed[s.status]?.includes(to)) {
    return { ok: false, error: `${s.status} → ${to} 전이 불가` };
  }
  const patch: Record<string, unknown> = { status: to };
  if (to === "confirmed") {
    patch.confirmed_at = new Date().toISOString();
    patch.confirmed_by = actorId;
  }
  if (to === "paid") patch.paid_at = new Date().toISOString();
  if (to === "draft") {
    patch.confirmed_at = null;
    patch.confirmed_by = null;
  }
  const { error } = await adminClient
    .from("book_settlements")
    .update(patch)
    .eq("settlement_id", settlementId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
