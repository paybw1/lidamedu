// 구독·결제 도메인 라벨 / 타입. 클라/서버 양쪽 import 안전.

export type SubscriptionStatus =
  | "pending"
  | "active"
  | "expired"
  | "cancelled";

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending: "대기",
  active: "활성",
  expired: "만료",
  cancelled: "취소",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "결제 진행",
  completed: "결제 완료",
  failed: "결제 실패",
  refunded: "환불",
};

// feat-8-028 — 상품 종류. subject=개별 과목, bundle=번들, membership=회원제(free/cohort).
export type ProductKind = "subject" | "bundle" | "membership";

export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = {
  subject: "개별 과목",
  bundle: "번들",
  membership: "회원제",
};

export interface SubscriptionPlan {
  planId: string;
  code: string;
  name: string;
  description: string | null;
  priceKrw: number;
  durationDays: number;
  features: string[];
  /** feat-8-028 — 부여 학습과목 slug 배열(개별/번들). 결제 시 열리는 과목. */
  subjectCodes: string[];
  productKind: ProductKind;
  displayOrder: number;
  isActive: boolean;
}

export interface UserSubscription {
  subscriptionId: string;
  userId: string;
  planId: string;
  planCode: string;
  planName: string;
  startedAt: string;
  expiresAt: string;
  status: SubscriptionStatus;
  paymentId: string | null;
}

export interface PaymentRow {
  paymentId: string;
  userId: string;
  planId: string;
  planCode: string;
  planName: string;
  amountKrw: number;
  status: PaymentStatus;
  tossOrderId: string;
  tossPaymentKey: string | null;
  failureReason: string | null;
  createdAt: string;
}

// ─── 할인 (feat-8-028 Stage D) ───

export type DiscountKind = "percent" | "fixed";
export type DiscountTargetKind = "all" | "subject" | "bundle" | "plan";

export const DISCOUNT_KIND_LABEL: Record<DiscountKind, string> = {
  percent: "% 할인",
  fixed: "정액 할인",
};
export const DISCOUNT_TARGET_LABEL: Record<DiscountTargetKind, string> = {
  all: "전체 상품",
  subject: "개별 과목",
  bundle: "번들",
  plan: "특정 상품",
};

export interface Discount {
  discountId: string;
  name: string;
  /** null = 자동 프로모션(코드 불필요). 값 = 쿠폰 코드. */
  code: string | null;
  kind: DiscountKind;
  value: number;
  targetKind: DiscountTargetKind;
  targetPlanCodes: string[];
  startsAt: string | null;
  endsAt: string | null;
  minAmountKrw: number | null;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number | null;
  isActive: boolean;
}

// 순수 헬퍼 — 클라(요금표 표시)·서버(결제 계산) 공용. now 는 호출자가 주입.
export function discountAppliesToPlan(
  d: Discount,
  plan: { productKind: ProductKind; code: string },
  basePriceKrw: number,
  nowMs: number,
): boolean {
  if (!d.isActive) return false;
  if (d.startsAt && new Date(d.startsAt).getTime() > nowMs) return false;
  if (d.endsAt && new Date(d.endsAt).getTime() < nowMs) return false;
  if (d.minAmountKrw != null && basePriceKrw < d.minAmountKrw) return false;
  if (d.maxUses != null && d.usedCount >= d.maxUses) return false;
  if (d.targetKind === "subject" && plan.productKind !== "subject") return false;
  if (d.targetKind === "bundle" && plan.productKind !== "bundle") return false;
  if (d.targetKind === "plan" && !d.targetPlanCodes.includes(plan.code))
    return false;
  return true;
}

export function effectivePriceKrw(basePriceKrw: number, d: Discount): number {
  const off =
    d.kind === "percent"
      ? Math.floor((basePriceKrw * d.value) / 100)
      : d.value;
  return Math.max(0, basePriceKrw - off);
}

// 자동(코드 없는) 프로모션 중 최대 할인 상품가.
export function bestAutomaticDiscount(
  plan: { productKind: ProductKind; code: string },
  basePriceKrw: number,
  discounts: Discount[],
  nowMs: number,
): Discount | null {
  let best: Discount | null = null;
  let bestPrice = basePriceKrw;
  for (const d of discounts) {
    if (d.code) continue; // 자동만
    if (!discountAppliesToPlan(d, plan, basePriceKrw, nowMs)) continue;
    const p = effectivePriceKrw(basePriceKrw, d);
    if (p < bestPrice) {
      bestPrice = p;
      best = d;
    }
  }
  return best;
}

export const FEATURE_LABEL: Record<string, string> = {
  // feat-8-008 영역 플래그 — 3-tier 게이팅 단위.
  area_subjects: "학습과목 — 조문·판례·문제 학습",
  area_study_aids: "학습보조 — 오답노트·하이라이트·암기",
  area_study_mgmt: "학습관리 — 대시보드·진도·합격 예측·과제",
  area_mock_exams: "모의고사 — 1·2차 모의고사",
  base_learning: "기본 학습 (조문·판례·문제)",
  passer_benchmarks: "합격자 평균 대비 비교",
  recommended_actions: "자동 추천 액션",
  passer_trend: "12주 학습 곡선 비교",
  passer_summaries: "합격자 수기 모음",
  weak_node_guide: "약점 단원 합격자 가이드",
  cohort_curriculum: "커리큘럼 / 과제",
  instructor_review: "강사 첨삭",
  one_on_one_consult: "1:1 상담",
};
