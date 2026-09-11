// feat-8-029 Stage 2 — 강사 배분 기준 쿼리. 호출부 manager+ 검증 필수, adminClient(RLS 우회).
// 규칙 적용: 결제 1건 × 강사별 — plan > subject > all 순으로 가장 구체적인 활성 규칙 1개.
// 동급이면 effective_from 최신. 수정은 "새 규칙 등록 + 기존 비활성" (정산 항목이 rule_id 를
// 참조하므로 규칙 값 in-place 변경은 지급 근거를 훼손 — 값 변경 대신 세대 교체).
import adminClient from "~/core/lib/supa-admin-client.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

import {
  type SettlementTotals,
  type SourceKind,
  type TaxType,
  computeSettlement,
  settledKey,
  sourceKey,
  totalsOf,
} from "./settlement-engine";
import { getSettlementParams, taxProfileFor } from "./settlement-params.server";
import { loadMonthSources } from "./settlement-sources.server";

export type ShareTargetKind = "plan" | "subject" | "all";
export type ShareKind = "percent" | "fixed";

export interface ShareRule {
  ruleId: string;
  instructorId: string;
  instructorName: string | null;
  targetKind: ShareTargetKind;
  targetPlanId: string | null;
  targetPlanName: string | null;
  targetSubjectCode: string | null;
  shareKind: ShareKind;
  shareValue: number;
  effectiveFrom: string;
  isActive: boolean;
  memo: string | null;
  createdAt: string;
}

const RULE_SELECT =
  "rule_id, instructor_id, target_kind, target_plan_id, target_subject_code, share_kind, share_value, effective_from, is_active, memo, created_at, profiles!instructor_id(name), subscription_plans(name)";

function rowToRule(r: {
  rule_id: string;
  instructor_id: string;
  target_kind: string;
  target_plan_id: string | null;
  target_subject_code: string | null;
  share_kind: string;
  share_value: number;
  effective_from: string;
  is_active: boolean;
  memo: string | null;
  created_at: string;
  profiles: { name: string | null } | null;
  subscription_plans: { name: string } | null;
}): ShareRule {
  return {
    ruleId: r.rule_id,
    instructorId: r.instructor_id,
    instructorName: r.profiles?.name ?? null,
    targetKind: r.target_kind as ShareTargetKind,
    targetPlanId: r.target_plan_id,
    targetPlanName: r.subscription_plans?.name ?? null,
    targetSubjectCode: r.target_subject_code,
    shareKind: r.share_kind as ShareKind,
    shareValue: r.share_value,
    effectiveFrom: r.effective_from,
    isActive: r.is_active,
    memo: r.memo,
    createdAt: r.created_at,
  };
}

export async function listShareRules(opts?: {
  activeOnly?: boolean;
}): Promise<ShareRule[]> {
  let q = adminClient
    .from("instructor_share_rules")
    .select(RULE_SELECT)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (opts?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToRule);
}

export interface InstructorOption {
  profileId: string;
  name: string | null;
  role: string;
}

export async function listInstructorOptions(): Promise<InstructorOption[]> {
  const { data, error } = await adminClient
    .from("profiles")
    .select("profile_id, name, role")
    .in("role", ["instructor", "admin"])
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    profileId: r.profile_id,
    name: r.name,
    role: r.role,
  }));
}

export interface CreateShareRuleInput {
  instructorId: string;
  targetKind: ShareTargetKind;
  targetPlanId: string | null;
  targetSubjectCode: string | null;
  shareKind: ShareKind;
  shareValue: number;
  effectiveFrom: string; // YYYY-MM-DD
  memo: string | null;
  createdBy: string;
}

export async function createShareRule(
  input: CreateShareRuleInput,
): Promise<{ ok: true; ruleId: string } | { ok: false; error: string }> {
  if (
    input.shareKind === "percent" &&
    (input.shareValue < 1 || input.shareValue > 100)
  ) {
    return { ok: false, error: "정률은 1~100% 범위" };
  }
  if (input.shareValue <= 0) return { ok: false, error: "배분 값은 양수" };
  const { data, error } = await adminClient
    .from("instructor_share_rules")
    .insert({
      instructor_id: input.instructorId,
      target_kind: input.targetKind,
      target_plan_id: input.targetKind === "plan" ? input.targetPlanId : null,
      target_subject_code:
        input.targetKind === "subject" ? input.targetSubjectCode : null,
      share_kind: input.shareKind,
      share_value: input.shareValue,
      effective_from: input.effectiveFrom,
      memo: input.memo,
      created_by: input.createdBy,
    })
    .select("rule_id")
    .single();
  if (error || !data)
    return { ok: false, error: error?.message ?? "insert 실패" };
  return { ok: true, ruleId: data.rule_id };
}

/** 이 강사에게 적용 가능한 활성 배분 규칙이 하나라도 있는가 — 강사 화면의 "규칙 없음" 안내용. */
export async function hasActiveShareRule(
  instructorId: string,
): Promise<boolean> {
  const { count, error } = await adminClient
    .from("instructor_share_rules")
    .select("rule_id", { count: "exact", head: true })
    .eq("instructor_id", instructorId)
    .eq("is_active", true);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function setShareRuleActive(
  ruleId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient
    .from("instructor_share_rules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("rule_id", ruleId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Stage 3 — 정산 생성·확정·지급 ─────────────────────────────────────────
// feat-8-031 로 원천이 둘(payments · order_items)이 되고 수수료·세금 칸이 붙었다.
// 계산은 settlement-engine.ts(순수 함수), 원천 수집은 settlement-sources.server.ts,
// 파라미터는 settlement-params.server.ts — 여기서는 저장·조회·상태 전이만 한다.

export type SettlementStatus = "draft" | "confirmed" | "paid";

export interface SettlementRow {
  settlementId: string;
  instructorId: string;
  instructorName: string | null;
  periodStart: string;
  periodEnd: string;
  status: SettlementStatus;
  /** 정산금액 = 매출 × 정산비율. */
  totalShareKrw: number;
  itemCount: number;
  confirmedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  grossKrw: number;
  refundKrw: number;
  feeKrw: number;
  netSalesKrw: number;
  feeRateBp: number;
  taxType: TaxType;
  taxRateBp: number;
  taxKrw: number;
  payoutKrw: number;
}

export interface SettlementItemRow {
  itemId: string;
  sourceKind: SourceKind;
  sourceId: string;
  kind: "share" | "refund_adjustment";
  shareKind: ShareKind;
  shareValue: number;
  baseAmountKrw: number;
  feeKrw: number;
  settleBaseKrw: number;
  shareAmountKrw: number;
  note: string | null;
  saleAt: string | null;
  label: string | null;
  studentName: string | null;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** "YYYY-MM" → [fromIso, toIso) — KST 월 경계의 UTC ISO. */
export function monthRangeKst(month: string): {
  fromIso: string;
  toIso: string;
  periodStart: string;
  periodEnd: string;
} {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - KST_OFFSET_MS);
  const to = new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    periodStart: `${y}-${pad(m)}-01`,
    periodEnd: m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`,
  };
}

/** 오늘이 속한 달(KST) "YYYY-MM". */
export function currentMonthKst(): string {
  const now = new Date(Date.now() + KST_OFFSET_MS);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 최근 n개월 "YYYY-MM" 목록(이번 달부터 과거로). */
export function recentMonthsKst(n: number): string[] {
  const now = new Date(Date.now() + KST_OFFSET_MS);
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return out;
}

interface PrevItemRow {
  payment_id: string | null;
  order_item_id: string | null;
  kind: string;
  instructor_settlements: {
    instructor_id: string;
    status: string;
    period_start: string;
  };
}

const sourceOf = (r: {
  payment_id: string | null;
  order_item_id: string | null;
}): { sourceKind: SourceKind; sourceId: string } =>
  r.order_item_id
    ? { sourceKind: "order_item", sourceId: r.order_item_id }
    : { sourceKind: "payment", sourceId: r.payment_id ?? "" };

/** 이미 다른 정산에 잡힌 항목 — 전 기간 조회로 이중 계상 방지. 당월 draft 는 재생성 대상이라 제외. */
async function loadSettledKeys(periodStart: string): Promise<{
  settled: Set<string>;
  sharedBy: Map<string, Set<string>>;
}> {
  const { data, error } = await adminClient
    .from("instructor_settlement_items")
    .select(
      "payment_id, order_item_id, kind, instructor_settlements!inner(instructor_id, status, period_start)",
    )
    .limit(100000);
  if (error) throw error;
  const settled = new Set<string>();
  const sharedBy = new Map<string, Set<string>>();
  for (const it of (data ?? []) as unknown as PrevItemRow[]) {
    const s = it.instructor_settlements;
    if (s.period_start === periodStart && s.status === "draft") continue;
    const { sourceKind, sourceId } = sourceOf(it);
    if (!sourceId) continue;
    settled.add(
      settledKey(
        s.instructor_id,
        sourceKind,
        sourceId,
        it.kind as "share" | "refund_adjustment",
      ),
    );
    if (it.kind === "share") {
      const key = sourceKey(sourceKind, sourceId);
      if (!sharedBy.has(key)) sharedBy.set(key, new Set());
      sharedBy.get(key)!.add(s.instructor_id);
    }
  }
  return { settled, sharedBy };
}

export interface GenerateResult {
  ok: boolean;
  created: { instructorName: string | null; total: number; items: number }[];
  skippedConfirmed: string[]; // 이미 확정·지급된 정산의 강사명
  /** 담당 강의는 있는데 배분 규칙이 없어 정산되지 않은 강사(운영자에게 알림). */
  missingRule: { instructorName: string | null; count: number }[];
  feeRateBp: number;
  error?: string;
}

async function nameMap(ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const { data } = await adminClient
    .from("profiles")
    .select("profile_id, name")
    .in("profile_id", ids);
  return new Map((data ?? []).map((p) => [p.profile_id, p.name]));
}

/**
 * month("YYYY-MM") 정산 생성 — 강사별 draft upsert.
 * 기존 draft 는 삭제 후 재생성. confirmed/paid 는 건드리지 않는다(지급 근거 동결).
 */
export async function generateSettlements(
  month: string,
  createdBy: string,
): Promise<GenerateResult> {
  const empty = {
    created: [],
    skippedConfirmed: [],
    missingRule: [],
    feeRateBp: 0,
  };
  if (!/^\d{4}-\d{2}$/.test(month))
    return { ok: false, ...empty, error: "month 형식 YYYY-MM" };
  const { fromIso, toIso, periodStart, periodEnd } = monthRangeKst(month);

  let sources: Awaited<ReturnType<typeof loadMonthSources>>;
  let params: Awaited<ReturnType<typeof getSettlementParams>>;
  let keys: Awaited<ReturnType<typeof loadSettledKeys>>;
  try {
    [sources, params, keys] = await Promise.all([
      loadMonthSources(fromIso, toIso),
      getSettlementParams(),
      loadSettledKeys(periodStart),
    ]);
  } catch (e) {
    return {
      ok: false,
      ...empty,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const { byInstructor, missingRule } = computeSettlement({
    ...sources,
    settled: keys.settled,
    sharedBy: keys.sharedBy,
    fromIso,
    toIso,
    feeRateBp: params.feeRateBp,
  });

  const names = await nameMap([
    ...new Set([
      ...byInstructor.keys(),
      ...missingRule.map((m) => m.instructorId),
    ]),
  ]);
  const created: GenerateResult["created"] = [];
  const skippedConfirmed: string[] = [];

  for (const [instructorId, items] of byInstructor) {
    const tax = taxProfileFor(params, instructorId);
    const t = totalsOf(items, params.feeRateBp, tax);
    const { data: existing } = await adminClient
      .from("instructor_settlements")
      .select("settlement_id, status")
      .eq("instructor_id", instructorId)
      .eq("period_start", periodStart)
      .maybeSingle();
    if (existing && existing.status !== "draft") {
      skippedConfirmed.push(
        names.get(instructorId) ?? instructorId.slice(0, 8),
      );
      continue;
    }
    const totals = {
      total_share_krw: t.shareKrw,
      gross_krw: t.grossKrw,
      refund_krw: t.refundKrw,
      fee_krw: t.feeKrw,
      net_sales_krw: t.netSalesKrw,
      fee_rate_bp: t.feeRateBp,
      tax_type: t.taxType,
      tax_rate_bp: t.taxRateBp,
      tax_krw: t.taxKrw,
      payout_krw: t.payoutKrw,
    };
    let settlementId: string;
    if (existing) {
      settlementId = existing.settlement_id;
      await adminClient
        .from("instructor_settlement_items")
        .delete()
        .eq("settlement_id", settlementId);
      await adminClient
        .from("instructor_settlements")
        .update(totals)
        .eq("settlement_id", settlementId);
    } else {
      const { data: ins, error: insErr } = await adminClient
        .from("instructor_settlements")
        .insert({
          instructor_id: instructorId,
          period_start: periodStart,
          period_end: periodEnd,
          status: "draft",
          created_by: createdBy,
          ...totals,
        })
        .select("settlement_id")
        .single();
      if (insErr || !ins)
        return {
          ok: false,
          created,
          skippedConfirmed,
          missingRule: [],
          feeRateBp: params.feeRateBp,
          error: insErr?.message ?? "정산 insert 실패",
        };
      settlementId = ins.settlement_id;
    }
    const { error: itemErr } = await adminClient
      .from("instructor_settlement_items")
      .insert(
        items.map((i) => ({
          settlement_id: settlementId,
          payment_id: i.sourceKind === "payment" ? i.sourceId : null,
          order_item_id: i.sourceKind === "order_item" ? i.sourceId : null,
          rule_id: i.ruleId,
          kind: i.kind,
          share_kind: i.shareKind,
          share_value: i.shareValue,
          base_amount_krw: i.baseAmountKrw,
          fee_krw: i.feeKrw,
          settle_base_krw: i.settleBaseKrw,
          share_amount_krw: i.shareAmountKrw,
          note: i.note,
        })),
      );
    if (itemErr)
      return {
        ok: false,
        created,
        skippedConfirmed,
        missingRule: [],
        feeRateBp: params.feeRateBp,
        error: itemErr.message,
      };
    created.push({
      instructorName: names.get(instructorId) ?? null,
      total: t.shareKrw,
      items: items.length,
    });
  }

  const missingByInstructor = new Map<string, number>();
  for (const m of missingRule)
    missingByInstructor.set(
      m.instructorId,
      (missingByInstructor.get(m.instructorId) ?? 0) + 1,
    );

  // 확정·지급된 정산은 항목이 전부 settled 로 잡혀 계산 결과에 아예 안 나온다 — 위 루프만으로는
  // "건너뜀"이 비어 "생성된 정산이 없습니다"로 잘못 안내된다. 기간의 확정분을 직접 읽어 보고한다.
  const { data: frozen } = await adminClient
    .from("instructor_settlements")
    .select("instructor_id, status, profiles!instructor_id(name)")
    .eq("period_start", periodStart)
    .neq("status", "draft");
  for (const f of (frozen ?? []) as unknown as Array<{
    instructor_id: string;
    profiles: { name: string | null } | null;
  }>) {
    const label = f.profiles?.name ?? f.instructor_id.slice(0, 8);
    if (!skippedConfirmed.includes(label)) skippedConfirmed.push(label);
  }

  return {
    ok: true,
    created,
    skippedConfirmed,
    missingRule: [...missingByInstructor].map(([id, count]) => ({
      instructorName: names.get(id) ?? id.slice(0, 8),
      count,
    })),
    feeRateBp: params.feeRateBp,
  };
}

const SETTLEMENT_SELECT =
  "settlement_id, instructor_id, period_start, period_end, status, total_share_krw, " +
  "confirmed_at, paid_at, created_at, gross_krw, refund_krw, fee_krw, net_sales_krw, " +
  "fee_rate_bp, tax_type, tax_rate_bp, tax_krw, payout_krw, profiles!instructor_id(name)";

interface SettlementDbRow {
  settlement_id: string;
  instructor_id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_share_krw: number;
  confirmed_at: string | null;
  paid_at: string | null;
  created_at: string;
  gross_krw: number;
  refund_krw: number;
  fee_krw: number;
  net_sales_krw: number;
  fee_rate_bp: number;
  tax_type: string;
  tax_rate_bp: number;
  tax_krw: number;
  payout_krw: number;
  profiles: { name: string | null } | null;
}

function rowToSettlement(r: SettlementDbRow, itemCount: number): SettlementRow {
  return {
    settlementId: r.settlement_id,
    instructorId: r.instructor_id,
    instructorName: r.profiles?.name ?? null,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: r.status as SettlementStatus,
    totalShareKrw: r.total_share_krw,
    itemCount,
    confirmedAt: r.confirmed_at,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    grossKrw: r.gross_krw,
    refundKrw: r.refund_krw,
    feeKrw: r.fee_krw,
    netSalesKrw: r.net_sales_krw,
    feeRateBp: r.fee_rate_bp,
    taxType: r.tax_type as TaxType,
    taxRateBp: r.tax_rate_bp,
    taxKrw: r.tax_krw,
    payoutKrw: r.payout_krw,
  };
}

export async function listSettlements(opts?: {
  month?: string; // "YYYY-MM"
  instructorId?: string;
}): Promise<SettlementRow[]> {
  let q = adminClient
    .from("instructor_settlements")
    .select(`${SETTLEMENT_SELECT}, instructor_settlement_items(item_id)`)
    .order("period_start", { ascending: false })
    .limit(500);
  if (opts?.month) q = q.eq("period_start", `${opts.month}-01`);
  if (opts?.instructorId) q = q.eq("instructor_id", opts.instructorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as unknown as SettlementDbRow & {
      instructor_settlement_items: { item_id: string }[] | null;
    };
    return rowToSettlement(row, (row.instructor_settlement_items ?? []).length);
  });
}

const ITEM_SELECT =
  "item_id, payment_id, order_item_id, kind, share_kind, share_value, base_amount_krw, " +
  "fee_krw, settle_base_krw, share_amount_krw, note, created_at, " +
  "payments(created_at, subscription_plans(name), profiles!payments_user_id_fkey(name)), " +
  "order_items(title_snapshot, item_type, refunded_at, orders(paid_at, profiles!orders_user_id_fkey(name)))";

interface ItemDbRow {
  item_id: string;
  payment_id: string | null;
  order_item_id: string | null;
  kind: string;
  share_kind: string;
  share_value: number;
  base_amount_krw: number;
  fee_krw: number;
  settle_base_krw: number;
  share_amount_krw: number;
  note: string | null;
  payments: {
    created_at: string;
    subscription_plans: { name: string } | null;
    profiles: { name: string | null } | null;
  } | null;
  order_items: {
    title_snapshot: string | null;
    item_type: string;
    refunded_at: string | null;
    orders: {
      paid_at: string | null;
      profiles: { name: string | null } | null;
    } | null;
  } | null;
}

function rowToItem(i: ItemDbRow): SettlementItemRow {
  const { sourceKind, sourceId } = sourceOf(i);
  const isRefund = i.kind === "refund_adjustment";
  const saleAt =
    sourceKind === "payment"
      ? (i.payments?.created_at ?? null)
      : isRefund
        ? (i.order_items?.refunded_at ?? i.order_items?.orders?.paid_at ?? null)
        : (i.order_items?.orders?.paid_at ?? null);
  return {
    itemId: i.item_id,
    sourceKind,
    sourceId,
    kind: i.kind as "share" | "refund_adjustment",
    shareKind: i.share_kind as ShareKind,
    shareValue: i.share_value,
    baseAmountKrw: i.base_amount_krw,
    feeKrw: i.fee_krw,
    settleBaseKrw: i.settle_base_krw,
    shareAmountKrw: i.share_amount_krw,
    note: i.note,
    saleAt,
    label:
      sourceKind === "payment"
        ? (i.payments?.subscription_plans?.name ?? null)
        : (i.order_items?.title_snapshot ??
          (i.order_items?.item_type === "course_extension"
            ? "수강 연장"
            : null)),
    studentName:
      sourceKind === "payment"
        ? (i.payments?.profiles?.name ?? null)
        : (i.order_items?.orders?.profiles?.name ?? null),
  };
}

/**
 * 정산 상세. opts.instructorId 를 주면 그 강사 소유일 때만 반환한다(강사 본인 조회 IDOR 차단).
 */
export async function getSettlementDetail(
  settlementId: string,
  opts?: { instructorId?: string },
): Promise<{ settlement: SettlementRow; items: SettlementItemRow[] } | null> {
  let q = adminClient
    .from("instructor_settlements")
    .select(SETTLEMENT_SELECT)
    .eq("settlement_id", settlementId);
  if (opts?.instructorId) q = q.eq("instructor_id", opts.instructorId);
  const { data: s, error } = await q.maybeSingle();
  if (error) throw error;
  if (!s) return null;
  const { data: items, error: itemErr } = await adminClient
    .from("instructor_settlement_items")
    .select(ITEM_SELECT)
    .eq("settlement_id", settlementId)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (itemErr) throw itemErr;
  const mapped = ((items ?? []) as unknown as ItemDbRow[]).map(rowToItem);
  return {
    settlement: rowToSettlement(s as unknown as SettlementDbRow, mapped.length),
    items: mapped,
  };
}

/**
 * 저장된 정산서 없이 지금 값으로 계산한 결과(강사 본인 "집계 중" 실시간 조회용).
 * 정산 생성은 운영자가 월 단위로 수동 실행하므로, 아직 만들어지지 않은 달은 이걸로 보여준다.
 */
export async function computeLiveSettlement(
  month: string,
  instructorId: string,
): Promise<{ totals: SettlementTotals; items: SettlementItemRow[] } | null> {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const { fromIso, toIso, periodStart } = monthRangeKst(month);
  const [sources, params, keys] = await Promise.all([
    loadMonthSources(fromIso, toIso),
    getSettlementParams(),
    loadSettledKeys(periodStart),
  ]);
  const { byInstructor } = computeSettlement({
    ...sources,
    settled: keys.settled,
    sharedBy: keys.sharedBy,
    fromIso,
    toIso,
    feeRateBp: params.feeRateBp,
  });
  const items = byInstructor.get(instructorId) ?? [];
  const tax = taxProfileFor(params, instructorId);
  return {
    totals: totalsOf(items, params.feeRateBp, tax),
    items: items.map((i) => ({
      itemId: `${i.sourceKind}:${i.sourceId}:${i.kind}`,
      sourceKind: i.sourceKind,
      sourceId: i.sourceId,
      kind: i.kind,
      shareKind: i.shareKind,
      shareValue: i.shareValue,
      baseAmountKrw: i.baseAmountKrw,
      feeKrw: i.feeKrw,
      settleBaseKrw: i.settleBaseKrw,
      shareAmountKrw: i.shareAmountKrw,
      note: i.note,
      saleAt: i.saleAt,
      label: i.label,
      studentName: i.studentName,
    })),
  };
}

export async function transitionSettlement(
  settlementId: string,
  to: "confirmed" | "paid" | "draft",
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: s } = await adminClient
    .from("instructor_settlements")
    .select("status, instructor_id, period_start, total_share_krw, payout_krw")
    .eq("settlement_id", settlementId)
    .maybeSingle();
  if (!s) return { ok: false, error: "정산 없음" };
  const allowed: Record<string, string[]> = {
    draft: ["confirmed"],
    confirmed: ["paid", "draft"], // draft 되돌림 = 확정 취소(지급 전만)
    paid: [],
  };
  if (!allowed[s.status]?.includes(to))
    return { ok: false, error: `${s.status} → ${to} 전이 불가` };
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
    .from("instructor_settlements")
    .update(patch)
    .eq("settlement_id", settlementId);
  if (error) return { ok: false, error: error.message };

  // 강사 본인에게 알림 — 확정·지급은 강사가 기다리는 사건이다.
  if (to === "confirmed" || to === "paid") {
    const month = s.period_start.slice(0, 7);
    const amount = (to === "paid" ? s.payout_krw : s.total_share_krw) ?? 0;
    await createUserNotifications({
      recipientIds: [s.instructor_id],
      kind: to === "paid" ? "settlement_paid" : "settlement_confirmed",
      entityType: "settlement",
      entityId: settlementId,
      title:
        to === "paid"
          ? `${month} 정산 지급 완료`
          : `${month} 정산이 확정되었습니다`,
      body:
        to === "paid"
          ? `지급액 ₩${amount.toLocaleString("ko-KR")}`
          : `정산금액 ₩${amount.toLocaleString("ko-KR")}`,
      href: "/lecture/settlements",
    });
  }
  return { ok: true };
}
