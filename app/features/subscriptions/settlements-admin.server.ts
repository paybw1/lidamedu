// feat-8-029 Stage 2 — 강사 배분 기준 쿼리. 호출부 manager+ 검증 필수, adminClient(RLS 우회).
// 규칙 적용: 결제 1건 × 강사별 — plan > subject > all 순으로 가장 구체적인 활성 규칙 1개.
// 동급이면 effective_from 최신. 수정은 "새 규칙 등록 + 기존 비활성" (정산 항목이 rule_id 를
// 참조하므로 규칙 값 in-place 변경은 지급 근거를 훼손 — 값 변경 대신 세대 교체).

import adminClient from "~/core/lib/supa-admin-client.server";

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
  if (input.shareKind === "percent" && (input.shareValue < 1 || input.shareValue > 100)) {
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
  if (error || !data) return { ok: false, error: error?.message ?? "insert 실패" };
  return { ok: true, ruleId: data.rule_id };
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

export type SettlementStatus = "draft" | "confirmed" | "paid";

export interface SettlementRow {
  settlementId: string;
  instructorId: string;
  instructorName: string | null;
  periodStart: string;
  periodEnd: string;
  status: SettlementStatus;
  totalShareKrw: number;
  itemCount: number;
  confirmedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface SettlementItemRow {
  itemId: string;
  paymentId: string;
  kind: "share" | "refund_adjustment";
  shareKind: ShareKind;
  shareValue: number;
  baseAmountKrw: number;
  shareAmountKrw: number;
  note: string | null;
  paymentCreatedAt: string | null;
  planName: string | null;
  userName: string | null;
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

interface PaymentForSettle {
  payment_id: string;
  plan_id: string;
  amount_krw: number;
  status: string;
  subject_code: string | null;
  refunded_at: string | null;
  refund_amount_krw: number | null;
  created_at: string;
}

interface RuleForSettle {
  rule_id: string;
  instructor_id: string;
  target_kind: ShareTargetKind;
  target_plan_id: string | null;
  target_subject_code: string | null;
  share_kind: ShareKind;
  share_value: number;
  effective_from: string;
  created_at: string;
}

/** 결제 1건 × 강사 — 가장 구체적인 규칙(plan > subject > all, 동급이면 effective_from 최신). */
function pickRule(
  rules: RuleForSettle[],
  payment: PaymentForSettle,
  planSubjects: Map<string, string[]>,
): Map<string, RuleForSettle> {
  const payDateKst = new Date(new Date(payment.created_at).getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
  const subjects = new Set(planSubjects.get(payment.plan_id) ?? []);
  if (payment.subject_code) subjects.add(payment.subject_code);
  const specificity = (r: RuleForSettle): number => {
    if (r.effective_from > payDateKst) return 0;
    if (r.target_kind === "plan")
      return r.target_plan_id === payment.plan_id ? 3 : 0;
    if (r.target_kind === "subject")
      return r.target_subject_code && subjects.has(r.target_subject_code) ? 2 : 0;
    return 1; // all
  };
  const best = new Map<string, RuleForSettle>();
  for (const r of rules) {
    const s = specificity(r);
    if (s === 0) continue;
    const cur = best.get(r.instructor_id);
    if (!cur) {
      best.set(r.instructor_id, r);
      continue;
    }
    const cs = specificity(cur);
    if (
      s > cs ||
      (s === cs &&
        (r.effective_from > cur.effective_from ||
          (r.effective_from === cur.effective_from && r.created_at > cur.created_at)))
    ) {
      best.set(r.instructor_id, r);
    }
  }
  return best;
}

function shareOf(rule: RuleForSettle, baseKrw: number, paymentKrw: number): number {
  if (rule.share_kind === "percent")
    return Math.round((baseKrw * rule.share_value) / 100);
  // fixed — 결제 전액이면 정액 그대로, 부분(환불 차감)이면 비례.
  return Math.round((rule.share_value * baseKrw) / paymentKrw);
}

export interface GenerateResult {
  ok: boolean;
  created: { instructorName: string | null; total: number; items: number }[];
  skippedConfirmed: string[]; // 이미 확정·지급된 정산의 강사명
  error?: string;
}

/**
 * month("YYYY-MM") 정산 생성 — 강사별 draft upsert.
 *   share: 해당 월 결제(completed·refunded)에 규칙 적용. 이미 타 정산에 잡힌 결제는 제외.
 *   refund_adjustment: 해당 월 환불 중, 원 share 항목이 "확정·지급된" 정산에 있는 건을 음수 차감.
 *     (같은 draft 안의 share 는 draft 재생성 시 순액 반영이 아니라 share+조정 두 줄로 명시.)
 * 기존 draft 는 삭제 후 재생성. confirmed/paid 는 건드리지 않음.
 */
export async function generateSettlements(
  month: string,
  createdBy: string,
): Promise<GenerateResult> {
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, created: [], skippedConfirmed: [], error: "month 형식 YYYY-MM" };
  const { fromIso, toIso, periodStart, periodEnd } = monthRangeKst(month);

  // 1) 대상 결제 — 월 내 결제 + 월 내 환불(과거 결제 포함).
  const [payRes, refRes, ruleRes, planRes] = await Promise.all([
    adminClient
      .from("payments")
      .select("payment_id, plan_id, amount_krw, status, subject_code, refunded_at, refund_amount_krw, created_at")
      .in("status", ["completed", "refunded"])
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .limit(5000),
    adminClient
      .from("payments")
      .select("payment_id, plan_id, amount_krw, status, subject_code, refunded_at, refund_amount_krw, created_at")
      .not("refunded_at", "is", null)
      .gte("refunded_at", fromIso)
      .lt("refunded_at", toIso)
      .limit(5000),
    adminClient
      .from("instructor_share_rules")
      .select("rule_id, instructor_id, target_kind, target_plan_id, target_subject_code, share_kind, share_value, effective_from, created_at, is_active")
      .eq("is_active", true)
      .limit(1000),
    adminClient.from("subscription_plans").select("plan_id, subject_codes").limit(200),
  ]);
  for (const r of [payRes, refRes, ruleRes, planRes]) {
    if (r.error) return { ok: false, created: [], skippedConfirmed: [], error: r.error.message };
  }
  const payments = (payRes.data ?? []) as PaymentForSettle[];
  const refunds = (refRes.data ?? []) as PaymentForSettle[];
  const rules = (ruleRes.data ?? []) as (RuleForSettle & { is_active: boolean })[];
  const planSubjects = new Map<string, string[]>(
    (planRes.data ?? []).map((p) => [p.plan_id, (p.subject_codes ?? []) as string[]]),
  );

  // 2) 이미 정산에 잡힌 (instructor, payment, kind) — 전 기간 조회로 이중 계상 방지.
  const { data: prevItems, error: prevErr } = await adminClient
    .from("instructor_settlement_items")
    .select("payment_id, kind, instructor_settlements!inner(instructor_id, status, period_start)")
    .limit(100000);
  if (prevErr) return { ok: false, created: [], skippedConfirmed: [], error: prevErr.message };
  const settled = new Set<string>(); // `${instructorId}:${paymentId}:${kind}` — 이번 달 밖(또는 확정) 정산에 이미 존재
  for (const it of prevItems ?? []) {
    const s = it.instructor_settlements;
    // 이번 달 draft 는 재생성 대상이라 제외하고, 그 외(타 기간 전부 + 이번 달 확정·지급)는 이중 계상 방지.
    if (s.period_start === periodStart && s.status === "draft") continue;
    settled.add(`${s.instructor_id}:${it.payment_id}:${it.kind}`);
  }
  // 원 share 가 어느 강사 정산에든 존재하는 결제 — 환불 차감 대상 판단용.
  const sharedBy = new Map<string, Set<string>>(); // paymentId → instructorIds (share 존재, draft 이번달 제외)
  for (const it of prevItems ?? []) {
    const s = it.instructor_settlements;
    if (it.kind !== "share") continue;
    if (s.period_start === periodStart && s.status === "draft") continue;
    if (!sharedBy.has(it.payment_id)) sharedBy.set(it.payment_id, new Set());
    sharedBy.get(it.payment_id)!.add(s.instructor_id);
  }

  // 3) 항목 계산 — 강사별.
  type NewItem = {
    payment_id: string;
    rule_id: string | null;
    kind: "share" | "refund_adjustment";
    share_kind: ShareKind;
    share_value: number;
    base_amount_krw: number;
    share_amount_krw: number;
    note: string | null;
  };
  const byInstructor = new Map<string, NewItem[]>();
  const push = (instructorId: string, item: NewItem) => {
    if (!byInstructor.has(instructorId)) byInstructor.set(instructorId, []);
    byInstructor.get(instructorId)!.push(item);
  };

  // 3a) share — 이번 달 결제.
  for (const p of payments) {
    const picked = pickRule(rules, p, planSubjects);
    for (const [instructorId, rule] of picked) {
      if (settled.has(`${instructorId}:${p.payment_id}:share`)) continue;
      push(instructorId, {
        payment_id: p.payment_id,
        rule_id: rule.rule_id,
        kind: "share",
        share_kind: rule.share_kind,
        share_value: rule.share_value,
        base_amount_krw: p.amount_krw,
        share_amount_krw: shareOf(rule, p.amount_krw, p.amount_krw),
        note: null,
      });
    }
  }
  // 3b) refund_adjustment — 이번 달 환불.
  for (const p of refunds) {
    const refundKrw = p.refund_amount_krw ?? p.amount_krw;
    if (refundKrw <= 0) continue;
    const inThisMonth = p.created_at >= fromIso && p.created_at < toIso;
    const picked = pickRule(rules, p, planSubjects);
    for (const [instructorId, rule] of picked) {
      // 원 share 가 (a) 과거·확정 정산에 있거나 (b) 이번 달 결제라 지금 함께 생성되는 경우만 차감.
      const hadShare =
        sharedBy.get(p.payment_id)?.has(instructorId) ?? false;
      if (!hadShare && !inThisMonth) continue;
      if (settled.has(`${instructorId}:${p.payment_id}:refund_adjustment`)) continue;
      push(instructorId, {
        payment_id: p.payment_id,
        rule_id: rule.rule_id,
        kind: "refund_adjustment",
        share_kind: rule.share_kind,
        share_value: rule.share_value,
        base_amount_krw: refundKrw,
        share_amount_krw: -shareOf(rule, refundKrw, p.amount_krw),
        note: inThisMonth ? "당월 결제·환불" : "확정 정산분 환불 차감",
      });
    }
  }

  // 4) 강사별 정산 upsert — draft 재생성, confirmed/paid 스킵.
  const created: GenerateResult["created"] = [];
  const skippedConfirmed: string[] = [];
  const { data: instructorProfiles } = await adminClient
    .from("profiles")
    .select("profile_id, name")
    .in("profile_id", [...byInstructor.keys()].length ? [...byInstructor.keys()] : ["00000000-0000-0000-0000-000000000000"]);
  const nameOf = new Map((instructorProfiles ?? []).map((p) => [p.profile_id, p.name]));

  for (const [instructorId, items] of byInstructor) {
    const total = items.reduce((a, i) => a + i.share_amount_krw, 0);
    const { data: existing } = await adminClient
      .from("instructor_settlements")
      .select("settlement_id, status")
      .eq("instructor_id", instructorId)
      .eq("period_start", periodStart)
      .maybeSingle();
    if (existing && existing.status !== "draft") {
      skippedConfirmed.push(nameOf.get(instructorId) ?? instructorId.slice(0, 8));
      continue;
    }
    let settlementId: string;
    if (existing) {
      settlementId = existing.settlement_id;
      await adminClient
        .from("instructor_settlement_items")
        .delete()
        .eq("settlement_id", settlementId);
      await adminClient
        .from("instructor_settlements")
        .update({ total_share_krw: total })
        .eq("settlement_id", settlementId);
    } else {
      const { data: ins, error: insErr } = await adminClient
        .from("instructor_settlements")
        .insert({
          instructor_id: instructorId,
          period_start: periodStart,
          period_end: periodEnd,
          status: "draft",
          total_share_krw: total,
          created_by: createdBy,
        })
        .select("settlement_id")
        .single();
      if (insErr || !ins)
        return { ok: false, created, skippedConfirmed, error: insErr?.message ?? "정산 insert 실패" };
      settlementId = ins.settlement_id;
    }
    const { error: itemErr } = await adminClient
      .from("instructor_settlement_items")
      .insert(items.map((i) => ({ ...i, settlement_id: settlementId })));
    if (itemErr)
      return { ok: false, created, skippedConfirmed, error: itemErr.message };
    created.push({
      instructorName: nameOf.get(instructorId) ?? null,
      total,
      items: items.length,
    });
  }
  return { ok: true, created, skippedConfirmed };
}

export async function listSettlements(opts?: {
  month?: string; // "YYYY-MM"
}): Promise<SettlementRow[]> {
  let q = adminClient
    .from("instructor_settlements")
    .select(
      "settlement_id, instructor_id, period_start, period_end, status, total_share_krw, confirmed_at, paid_at, created_at, profiles!instructor_id(name), instructor_settlement_items(item_id)",
    )
    .order("period_start", { ascending: false })
    .limit(500);
  if (opts?.month) q = q.eq("period_start", `${opts.month}-01`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    settlementId: r.settlement_id,
    instructorId: r.instructor_id,
    instructorName: r.profiles?.name ?? null,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: r.status as SettlementStatus,
    totalShareKrw: r.total_share_krw,
    itemCount: (r.instructor_settlement_items ?? []).length,
    confirmedAt: r.confirmed_at,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  }));
}

export async function getSettlementDetail(settlementId: string): Promise<{
  settlement: SettlementRow;
  items: SettlementItemRow[];
} | null> {
  const { data: s, error } = await adminClient
    .from("instructor_settlements")
    .select(
      "settlement_id, instructor_id, period_start, period_end, status, total_share_krw, confirmed_at, paid_at, created_at, profiles!instructor_id(name)",
    )
    .eq("settlement_id", settlementId)
    .maybeSingle();
  if (error) throw error;
  if (!s) return null;
  const { data: items, error: itemErr } = await adminClient
    .from("instructor_settlement_items")
    .select(
      "item_id, payment_id, kind, share_kind, share_value, base_amount_krw, share_amount_krw, note, payments(created_at, subscription_plans(name), profiles(name))",
    )
    .eq("settlement_id", settlementId)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (itemErr) throw itemErr;
  return {
    settlement: {
      settlementId: s.settlement_id,
      instructorId: s.instructor_id,
      instructorName: s.profiles?.name ?? null,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      status: s.status as SettlementStatus,
      totalShareKrw: s.total_share_krw,
      itemCount: (items ?? []).length,
      confirmedAt: s.confirmed_at,
      paidAt: s.paid_at,
      createdAt: s.created_at,
    },
    items: (items ?? []).map((i) => ({
      itemId: i.item_id,
      paymentId: i.payment_id,
      kind: i.kind as "share" | "refund_adjustment",
      shareKind: i.share_kind as ShareKind,
      shareValue: i.share_value,
      baseAmountKrw: i.base_amount_krw,
      shareAmountKrw: i.share_amount_krw,
      note: i.note,
      paymentCreatedAt: i.payments?.created_at ?? null,
      planName: i.payments?.subscription_plans?.name ?? null,
      userName: i.payments?.profiles?.name ?? null,
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
    .select("status")
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
  return { ok: true };
}
