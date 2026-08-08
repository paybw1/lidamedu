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
// feat-11 — course=영상 강의, tpass=기간권(T-PASS). 학습 플랫폼 상품(위 3종)과 별개로
//   강의 플랫폼(/lecture)에서 판매·수강권(enrollments)으로 지급된다.
export type ProductKind =
  | "subject"
  | "bundle"
  | "membership"
  | "course"
  | "tpass";

export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = {
  subject: "개별 과목",
  bundle: "번들",
  membership: "회원제",
  course: "강의",
  tpass: "T-PASS",
};

// 강의 플랫폼(/lecture) 카탈로그에 노출되는 상품 종류.
export const LECTURE_PRODUCT_KINDS: ReadonlyArray<ProductKind> = [
  "course",
  "tpass",
];

// feat-8-028 / A-3 — 판매 단계(5단계). sale_status 가 단일 소유자.
//   is_active 는 저장 시 (sale_status==='on_sale') 로 자동 미러 → 기존 소비처 무변경.
export type SaleStatus =
  | "scheduled" // 판매예정 — 준비됐으나 아직 미노출(오픈일 전)
  | "on_sale" // 판매중 — 노출·구매 가능
  | "paused" // 일시중지 — 일시적으로 판매 보류
  | "ended" // 판매종료 — 더 이상 판매 안 함(기존 수강권 유지)
  | "hidden"; // 숨김 — 카탈로그·요금표에서 감춤

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  scheduled: "판매예정",
  on_sale: "판매중",
  paused: "일시중지",
  ended: "판매종료",
  hidden: "숨김",
};

export const SALE_STATUS_ORDER: ReadonlyArray<SaleStatus> = [
  "on_sale",
  "scheduled",
  "paused",
  "ended",
  "hidden",
];

export interface SubscriptionPlan {
  planId: string;
  code: string;
  name: string;
  description: string | null;
  priceKrw: number;
  /** 정상가(원). null 이거나 판매가 이하이면 할인 표시를 하지 않는다(취소선·할인율 생략). */
  listPriceKrw: number | null;
  durationDays: number;
  features: string[];
  /** feat-8-028 — 부여 학습과목 slug 배열(개별/번들). 결제 시 열리는 과목. */
  subjectCodes: string[];
  productKind: ProductKind;
  /** 오픈일 — 이 시각 전이면 "오픈 예정"(구매 불가). null = 즉시 판매. */
  availableFrom: string | null;
  displayOrder: number;
  isActive: boolean;
  /** 판매 단계(5). is_active 는 이 값의 파생(on_sale ↔ true). */
  saleStatus: SaleStatus;
  /** 강의 카탈로그 분류(course/tpass 상품). null=미분류. */
  lectureCategory: "round1" | "round2" | "package" | "onsite" | null;
  // feat-11-008 P3 — 강의 카테고리 테이블 연결(카탈로그 탭·검색 SSOT). 구 enum 은 통계 축 호환.
  categoryId: string | null;
  // feat-11-008 P5 — 상세페이지 섹션별 HTML(키=DETAIL_SECTIONS).
  detailSections: import("~/features/lms/lib/detail-sections").DetailSections;
  /** 수강신청 상세(/lecture/catalog/:code) 본문 — 히어로 배너와 동일하게 이미지 또는 HTML. */
  detailImageUrl: string | null;
  detailHtml: string | null;
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
  // feat-11 장바구니 주문 결제는 단일 plan 이 없어 null(지급은 주문 기준).
  planId: string | null;
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
  /** 혜택 지속 종료일 — 가입 창에 시작해 지속 중인 구독이 갱신에도 할인받는 마지막 시점. */
  renewalUntil: string | null;
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

// 갱신 시 할인 지속 판정 — 가입 창(ends_at) 대신 혜택 지속 종료일(renewal_until)까지 유효.
//   구독이 원래 이 할인을 받았고(호출부에서 확인) 지속 중일 때만 사용한다.
//   renewal_until 이 없으면 지속 없음 → ends_at(가입 창)까지만.
export function discountAppliesAtRenewal(
  d: Discount,
  plan: { productKind: ProductKind; code: string },
  basePriceKrw: number,
  nowMs: number,
): boolean {
  if (!d.isActive) return false;
  if (d.startsAt && new Date(d.startsAt).getTime() > nowMs) return false;
  const benefitEnd = d.renewalUntil ?? d.endsAt;
  if (benefitEnd && new Date(benefitEnd).getTime() < nowMs) return false;
  if (d.minAmountKrw != null && basePriceKrw < d.minAmountKrw) return false;
  // maxUses(전체 사용 한도)는 갱신 지속 대상엔 적용하지 않음 — 이미 자격을 얻은 구독.
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

// 오픈 예정 라벨 — KST 기준 "N월 오픈"(서버 UTC/클라 TZ 무관하게 한국 월 표기).
export function openMonthLabel(availableFromIso: string): string {
  const kst = new Date(new Date(availableFromIso).getTime() + 9 * 3600 * 1000);
  return `${kst.getUTCMonth() + 1}월 오픈`;
}

// KST 날짜 라벨 — "2026. 7. 3." (서버 UTC/클라 TZ 무관하게 한국 날짜 표기).
export function kstDateLabel(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}.`;
}

// 할인 기간 안내 — 가입 창(startsAt~endsAt에 구독 시작해야 적용)과
// 혜택 지속 종료일(renewalUntil까지 갱신에도 할인가 유지)을 학생에게 표기.
export function discountPeriodLabel(d: Discount): string | null {
  const window =
    d.startsAt && d.endsAt
      ? `${kstDateLabel(d.startsAt)} ~ ${kstDateLabel(d.endsAt)} 구독 시 적용`
      : d.endsAt
        ? `${kstDateLabel(d.endsAt)}까지 구독 시 적용`
        : null;
  const renewal = d.renewalUntil
    ? `${kstDateLabel(d.renewalUntil)}까지 할인가로 갱신`
    : null;
  if (!window && !renewal) return null;
  return [window, renewal].filter(Boolean).join(" · ");
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
  area_study_aids: "학습노트 — 오답노트·하이라이트·암기",
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
