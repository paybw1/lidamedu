// feat-8-031 — 강사 정산 계산 엔진(순수 함수). DB·서버 의존 없음 → 관리자 생성·강사 실시간 조회·단위 테스트가
// 같은 계산을 쓴다. 입력(원천·규칙·귀속·파라미터)은 settlement-sources.server.ts 가 모은다.
//
// 산식(원장 확정 2026-09-12): 수수료 = (결제 − 환불) × 수수료율 / 매출(정산 기준 총금액) = 결제 − 환불 − 수수료 /
//   정산금액 = 매출 × 정산비율(배분 규칙) / 세금액 = 정산금액 × 세율 / 정산 지급액 = 정산금액 − 세금액.
//   항목 단위로 나눠 저장하고(share 양수 · refund_adjustment 음수) 정산서 합계는 항목 합으로만 만든다.
//
// 강사 귀속: 상품(plan)에 강의가 묶여 있으면(plan_courses) 그 강의 시리즈의 담당 강사에게만 귀속하고,
//   비율은 그 강사의 배분 규칙(상품 > 과목 > 전체)에서 가져온다. 규칙이 없으면 missingRule 로 보고(정산 안 됨).
//   강의가 묶이지 않은 상품(학습 플랫폼 구독 등)은 종전대로 "규칙이 맞는 모든 강사"에게 결제 전액 기준.
//   묶음(여러 강의·여러 강사)은 강의 수 비율로 안분한다(강의에 정가가 없어 정가 비율은 불가).

export type ShareKind = "percent" | "fixed";
export type ShareTargetKind = "plan" | "subject" | "all";
export type SettlementItemKind = "share" | "refund_adjustment";
export type TaxType = "withholding" | "invoice" | "none";
export type SourceKind = "payment" | "order_item";

const BP = 10000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface EngineRule {
  rule_id: string;
  instructor_id: string;
  target_kind: ShareTargetKind;
  target_plan_id: string | null;
  target_subject_code: string | null;
  share_kind: ShareKind;
  share_value: number;
  effective_from: string; // YYYY-MM-DD
  created_at: string;
}

/** 정산 원천 1건 — 구독 직접 결제(payment) 또는 강의 플랫폼 주문 항목(order_item). */
export interface SourceSale {
  sourceKind: SourceKind;
  sourceId: string;
  planId: string | null;
  subjectCode: string | null;
  /** 실제 결제된 금액(주문 할인은 항목별로 안분된 값). */
  grossKrw: number;
  /** 월 귀속 기준 시각 — payments.created_at | orders.paid_at (ISO). */
  paidAt: string;
  refundedAt: string | null;
  refundKrw: number;
  /** 상품명 스냅샷(비고). */
  label: string | null;
  studentName: string | null;
}

export interface TaxProfile {
  taxType: TaxType;
  taxRateBp: number;
}

/** 강사 세금 유형 미등록 시 기본 — 개인 사업소득 원천징수 3.3%. */
export const DEFAULT_TAX_PROFILE: TaxProfile = {
  taxType: "withholding",
  taxRateBp: 330,
};

export interface EngineInput {
  /** 이번 달 결제(paidAt ∈ 월). */
  sales: SourceSale[];
  /** 이번 달 환불(refundedAt ∈ 월) — 결제는 과거일 수 있다. */
  refunds: SourceSale[];
  rules: EngineRule[];
  /** planId → 과목 코드 목록 (규칙 target=subject 매칭). */
  planSubjects: Map<string, string[]>;
  /** planId → (instructorId → 안분 비율 0~1). 없거나 비어 있으면 규칙 전용 귀속. */
  planInstructors: Map<string, Map<string, number>>;
  /** 이미 다른 정산(타월 전부 + 당월 확정·지급)에 잡힌 키 — `${instructorId}:${sourceKind}:${sourceId}:${kind}`. */
  settled: Set<string>;
  /** `${sourceKind}:${sourceId}` → 원 share 가 존재하는 강사 집합(환불 차감 대상 판단). */
  sharedBy: Map<string, Set<string>>;
  fromIso: string;
  toIso: string;
  feeRateBp: number;
}

export interface EngineItem {
  sourceKind: SourceKind;
  sourceId: string;
  ruleId: string;
  kind: SettlementItemKind;
  shareKind: ShareKind;
  shareValue: number;
  /** share: 귀속 결제액 / refund_adjustment: 귀속 환불액 (둘 다 양수). */
  baseAmountKrw: number;
  /** share: +수수료 / refund_adjustment: −수수료(환급). */
  feeKrw: number;
  /** share: base − fee / refund_adjustment: −(base − fee). */
  settleBaseKrw: number;
  /** share: + / refund_adjustment: −. */
  shareAmountKrw: number;
  note: string | null;
  saleAt: string;
  label: string | null;
  studentName: string | null;
}

export interface MissingRule {
  instructorId: string;
  sourceKind: SourceKind;
  sourceId: string;
  label: string | null;
}

export interface SettlementTotals {
  grossKrw: number;
  refundKrw: number;
  feeKrw: number;
  netSalesKrw: number;
  shareKrw: number;
  feeRateBp: number;
  taxType: TaxType;
  taxRateBp: number;
  taxKrw: number;
  payoutKrw: number;
}

export const settledKey = (
  instructorId: string,
  sourceKind: SourceKind,
  sourceId: string,
  kind: SettlementItemKind,
): string => `${instructorId}:${sourceKind}:${sourceId}:${kind}`;

export const sourceKey = (sourceKind: SourceKind, sourceId: string): string =>
  `${sourceKind}:${sourceId}`;

export function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** 규칙 구체성 — plan(3) > subject(2) > all(1), 적용 시작일이 결제일보다 뒤면 0. */
function specificity(
  r: EngineRule,
  sale: SourceSale,
  saleDateKst: string,
  subjects: Set<string>,
): number {
  if (r.effective_from > saleDateKst) return 0;
  if (r.target_kind === "plan") return r.target_plan_id === sale.planId ? 3 : 0;
  if (r.target_kind === "subject")
    return r.target_subject_code && subjects.has(r.target_subject_code) ? 2 : 0;
  return 1;
}

/** 원천 1건 × 강사 — 가장 구체적인 규칙 1개(동급이면 effective_from 최신 → created_at 최신). */
export function pickRules(
  rules: EngineRule[],
  sale: SourceSale,
  planSubjects: Map<string, string[]>,
): Map<string, EngineRule> {
  const saleDateKst = kstDate(sale.paidAt);
  const subjects = new Set(
    sale.planId ? (planSubjects.get(sale.planId) ?? []) : [],
  );
  if (sale.subjectCode) subjects.add(sale.subjectCode);
  const best = new Map<string, EngineRule>();
  for (const r of rules) {
    const s = specificity(r, sale, saleDateKst, subjects);
    if (s === 0) continue;
    const cur = best.get(r.instructor_id);
    if (!cur) {
      best.set(r.instructor_id, r);
      continue;
    }
    const cs = specificity(cur, sale, saleDateKst, subjects);
    if (
      s > cs ||
      (s === cs &&
        (r.effective_from > cur.effective_from ||
          (r.effective_from === cur.effective_from &&
            r.created_at > cur.created_at)))
    ) {
      best.set(r.instructor_id, r);
    }
  }
  return best;
}

const feeOf = (krw: number, feeRateBp: number): number =>
  Math.round((krw * feeRateBp) / BP);

/** 배분액 — percent: 정산 기준액 × %. fixed: 건당 정액을 (귀속액 / 항목 결제액) 비례. */
function shareOf(
  rule: EngineRule,
  settleBaseKrw: number,
  attributedKrw: number,
  itemGrossKrw: number,
): number {
  if (rule.share_kind === "percent")
    return Math.round((settleBaseKrw * rule.share_value) / 100);
  if (itemGrossKrw <= 0) return rule.share_value;
  return Math.round((rule.share_value * attributedKrw) / itemGrossKrw);
}

/** 원천 1건의 강사별 귀속 — (강사, 규칙, 안분 비율) 목록 + 규칙 없는 담당 강사. */
function attribute(
  sale: SourceSale,
  input: EngineInput,
): {
  picks: { instructorId: string; rule: EngineRule; portion: number }[];
  missing: MissingRule[];
} {
  const picked = pickRules(input.rules, sale, input.planSubjects);
  const owners = sale.planId
    ? input.planInstructors.get(sale.planId)
    : undefined;
  const picks: { instructorId: string; rule: EngineRule; portion: number }[] =
    [];
  const missing: MissingRule[] = [];
  if (owners && owners.size > 0) {
    for (const [instructorId, portion] of owners) {
      const rule = picked.get(instructorId);
      if (!rule) {
        missing.push({
          instructorId,
          sourceKind: sale.sourceKind,
          sourceId: sale.sourceId,
          label: sale.label,
        });
        continue;
      }
      picks.push({ instructorId, rule, portion });
    }
    return { picks, missing };
  }
  for (const [instructorId, rule] of picked)
    picks.push({ instructorId, rule, portion: 1 });
  return { picks, missing };
}

export interface EngineResult {
  byInstructor: Map<string, EngineItem[]>;
  missingRule: MissingRule[];
}

export function computeSettlement(input: EngineInput): EngineResult {
  const byInstructor = new Map<string, EngineItem[]>();
  const missingRule: MissingRule[] = [];
  const push = (instructorId: string, item: EngineItem) => {
    if (!byInstructor.has(instructorId)) byInstructor.set(instructorId, []);
    byInstructor.get(instructorId)!.push(item);
  };

  // share — 이번 달 결제.
  for (const sale of input.sales) {
    if (sale.grossKrw <= 0) continue;
    const { picks, missing } = attribute(sale, input);
    missingRule.push(...missing);
    for (const { instructorId, rule, portion } of picks) {
      if (
        input.settled.has(
          settledKey(instructorId, sale.sourceKind, sale.sourceId, "share"),
        )
      )
        continue;
      const base = Math.round(sale.grossKrw * portion);
      const fee = feeOf(base, input.feeRateBp);
      const settleBase = base - fee;
      push(instructorId, {
        sourceKind: sale.sourceKind,
        sourceId: sale.sourceId,
        ruleId: rule.rule_id,
        kind: "share",
        shareKind: rule.share_kind,
        shareValue: rule.share_value,
        baseAmountKrw: base,
        feeKrw: fee,
        settleBaseKrw: settleBase,
        shareAmountKrw: shareOf(rule, settleBase, base, sale.grossKrw),
        note: portion < 1 ? `묶음 안분 ${Math.round(portion * 100)}%` : null,
        saleAt: sale.paidAt,
        label: sale.label,
        studentName: sale.studentName,
      });
    }
  }

  // refund_adjustment — 이번 달 환불. 원 share 가 (a) 과거·확정 정산에 있거나 (b) 당월 결제라 지금 함께
  // 생성되는 경우만 차감. 두 줄(share + 차감)로 남겨 순액이 아니라 근거가 보이게 한다.
  for (const sale of input.refunds) {
    if (!sale.refundedAt || sale.refundKrw <= 0) continue;
    const inThisMonth =
      sale.paidAt >= input.fromIso && sale.paidAt < input.toIso;
    const { picks } = attribute(sale, input);
    for (const { instructorId, rule, portion } of picks) {
      const hadShare =
        input.sharedBy
          .get(sourceKey(sale.sourceKind, sale.sourceId))
          ?.has(instructorId) ?? false;
      if (!hadShare && !inThisMonth) continue;
      if (
        input.settled.has(
          settledKey(
            instructorId,
            sale.sourceKind,
            sale.sourceId,
            "refund_adjustment",
          ),
        )
      )
        continue;
      const base = Math.round(sale.refundKrw * portion);
      const fee = feeOf(base, input.feeRateBp);
      const settleBase = base - fee;
      push(instructorId, {
        sourceKind: sale.sourceKind,
        sourceId: sale.sourceId,
        ruleId: rule.rule_id,
        kind: "refund_adjustment",
        shareKind: rule.share_kind,
        shareValue: rule.share_value,
        baseAmountKrw: base,
        feeKrw: -fee,
        settleBaseKrw: -settleBase,
        shareAmountKrw: -shareOf(rule, settleBase, base, sale.grossKrw),
        note: inThisMonth ? "당월 결제·환불" : "확정 정산분 환불 차감",
        saleAt: sale.refundedAt,
        label: sale.label,
        studentName: sale.studentName,
      });
    }
  }

  return { byInstructor, missingRule };
}

/** 항목 합 → 정산서 9칸. 모든 합계는 항목에서만 유도한다(재계산 가능·근거 보존). */
export function totalsOf(
  items: Pick<
    EngineItem,
    "kind" | "baseAmountKrw" | "feeKrw" | "settleBaseKrw" | "shareAmountKrw"
  >[],
  feeRateBp: number,
  tax: TaxProfile,
): SettlementTotals {
  let grossKrw = 0;
  let refundKrw = 0;
  let feeKrw = 0;
  let netSalesKrw = 0;
  let shareKrw = 0;
  for (const i of items) {
    if (i.kind === "share") grossKrw += i.baseAmountKrw;
    else refundKrw += i.baseAmountKrw;
    feeKrw += i.feeKrw;
    netSalesKrw += i.settleBaseKrw;
    shareKrw += i.shareAmountKrw;
  }
  const taxKrw = Math.round((shareKrw * tax.taxRateBp) / BP);
  return {
    grossKrw,
    refundKrw,
    feeKrw,
    netSalesKrw,
    shareKrw,
    feeRateBp,
    taxType: tax.taxType,
    taxRateBp: tax.taxRateBp,
    taxKrw,
    payoutKrw: shareKrw - taxKrw,
  };
}

/** 항목들의 정산비율 표시 — 전부 같은 정률이면 "30%", 섞이면 "규칙별". */
export function ratioLabelOf(
  items: Pick<EngineItem, "kind" | "shareKind" | "shareValue">[],
): string {
  const shares = items.filter((i) => i.kind === "share");
  if (shares.length === 0) return "—";
  const first = shares[0];
  const same = shares.every(
    (i) => i.shareKind === first.shareKind && i.shareValue === first.shareValue,
  );
  if (!same) return "규칙별";
  return first.shareKind === "percent"
    ? `${first.shareValue}%`
    : `₩${first.shareValue.toLocaleString("ko-KR")}/건`;
}

export const TAX_TYPE_LABEL: Record<TaxType, string> = {
  withholding: "개인(원천징수)",
  invoice: "사업자(세금계산서)",
  none: "없음",
};

export function bpToPercentText(bp: number): string {
  return `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : bp % 10 === 0 ? 1 : 2)}%`;
}
