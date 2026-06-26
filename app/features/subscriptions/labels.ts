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

export interface SubscriptionPlan {
  planId: string;
  code: string;
  name: string;
  description: string | null;
  priceKrw: number;
  durationDays: number;
  features: string[];
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
