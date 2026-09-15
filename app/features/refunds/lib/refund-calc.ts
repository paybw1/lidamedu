// feat-11-013 P7 — 환불금액 자동계산 (요청서 §11). **순수 함수, DB 접근 0.**
//
// ★이 파일이 계산의 유일한 소유자다. 화면·RPC·테스트가 모두 여기를 통과한다.
//   요청서 §12 의 예시 A·B 가 **이 요청서에서 유일하게 정답이 주어진 부분**이라
//   refund-calc.test.ts 에 그대로 못 박았다. 식을 고칠 일이 있으면 그 두 테스트가 먼저 깨져야 한다.
//
// ★계산은 정수 원 단위로만 한다. 소수는 **최종 공제액에서 한 번만** 절사한다(요청서 11-15).
//   `floor(N/D) × d` 가 아니라 `floor(N/D × d)` 다 — 전자는 하루치에서 버린 잔돈이 d 배로
//   불어나 학생에게 불리하게 어긋난다.
//
// ★계산은 **결제 당시 스냅샷**만 먹는다(요청서 11-1 말미). 지금 상품표의 가격·회차를 읽으면
//   과거 주문의 환불 기준이 상품 수정에 따라 흔들린다.

/** 환불 계산유형 — `order_items.refund_calc_type` 의 CHECK 와 같은 집합. */
export const REFUND_CALC_TYPES = ["period", "single", "bundle", "custom"] as const;
export type RefundCalcType = (typeof REFUND_CALC_TYPES)[number];

export const REFUND_CALC_TYPE_LABELS: Record<RefundCalcType, string> = {
  period: "기간제",
  single: "단과",
  bundle: "단과 묶음",
  custom: "상품별 별도 환불규정",
};

/** 판정 — 요청서 11-2 의 「환불 가능 여부」. */
export type RefundVerdict =
  /** 전액환불 — 7일 이내·이용이력 없음(11-3). */
  | "full"
  /** 계산식에 따른 부분환불. */
  | "partial"
  /** 환불 불가 — 기간 1/2 경과 등. */
  | "blocked"
  /** 자동계산 대상이 아님 — 사람이 읽고 정해야 한다. */
  | "manual";

export interface RefundCalcInput {
  calcType: RefundCalcType;
  /** B — 쿠폰·포인트 차감 **전** 그 상품의 실제 판매금액. */
  baseKrw: number;
  /** N — 할인 전 정상가. null 이면 할인이 없는 상품으로 보고 B 를 쓴다. */
  listPriceKrw: number | null;
  /** C — 그 상품에 배분된 쿠폰 할인액. */
  couponKrw: number;
  /** Q — 그 상품에 배분된 사용 포인트. */
  pointKrw: number;
  /** 그 상품에 귀속되는 실제 PG 결제액 — 토스 취소 예정금액의 상한(11-11). */
  pgPaidKrw: number;
  /** D — 정가 수강기간(일). null = 기간 개념이 없는 상품(교재 등). */
  durationDays: number | null;
  /** d — 실제 이용일수(11-5). 수강 시작 전이면 0. */
  usedDays: number;
  /** T — 결제 당시 사전 고지된 전체 예정 회차. null = 회차 개념 없음. */
  plannedSessions: number | null;
  /** t — 유료 영상·자료를 이용한 **고유** 회차 수(11-4). */
  usedSessions: number;
  /** 수강 시작일부터 7일 이내인가(11-3). */
  withinFirstWeek: boolean;
  /** 유료 이용이력이 하나도 없는가(11-3). 하나라도 있으면 false. */
  noPaidUsage: boolean;
  /** 결제 당시 상품안내에 **별도 고지된** 환불규정이 있는가(11-2 최우선). */
  hasOwnPolicy: boolean;
}

export interface RefundCalcResult {
  verdict: RefundVerdict;
  /** 화면에 그대로 띄우는 판정 사유(11-2 의 표시 예시). */
  verdictReason: string;
  /** 적용된 계산유형 라벨. */
  calcTypeLabel: string;

  baseKrw: number;
  listPriceKrw: number;
  couponKrw: number;
  pointKrw: number;

  durationDays: number | null;
  usedDays: number;
  /** 수강기간 경과율 — d/D. 기간이 없으면 null. */
  elapsedRatio: number | null;
  plannedSessions: number | null;
  usedSessions: number;

  /** 이용일수 기준 공제액. 해당 없으면 null. */
  dayDeductionKrw: number | null;
  /** 회차 기준 공제액. 해당 없으면 null. */
  sessionDeductionKrw: number | null;
  /** 최종 적용 공제액. */
  appliedDeductionKrw: number;
  /** 어느 쪽이 적용됐는지 — 화면의 「적용사유」. */
  deductionBasis: "none" | "day" | "session";

  /** 환불 대상금액 = B − 공제 − C, 0 미만이면 0. */
  refundableKrw: number;
  /** 포인트 반환액 = MIN(Q, 환불 대상금액). */
  pointReturnKrw: number;
  /** 토스 취소 예정금액 = 환불 대상금액 − 포인트 반환액. PG 결제액을 넘지 않는다. */
  pgCancelPlanKrw: number;
  /** 최종 환불금액 = 포인트 반환액 + 토스 취소 예정금액. */
  finalRefundKrw: number;

  /** 요청서 11-13 「환불 계산식과 계산 결과」 — 화면에 줄 단위로 띄운다. */
  formula: string[];
}

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 음수를 0 으로 자르고 정수로 만든다(11-15). */
function clamp0(n: number): number {
  return n <= 0 ? 0 : Math.floor(n);
}

/**
 * 기간·회차 공제액 — **나눗셈 결과를 곱한 뒤 한 번만 절사**한다(11-15).
 * 분모가 0·null 이면 그 기준은 적용하지 않는다(null 반환).
 */
function deduction(listPrice: number, denominator: number | null, used: number): number | null {
  if (denominator == null || denominator <= 0) return null;
  if (used <= 0) return 0;
  return Math.floor((listPrice * used) / denominator);
}

/**
 * 환불금액 자동계산.
 *
 * 판정 순서는 요청서 11-2 의 우선순위를 그대로 따른다 —
 *  ① 상품별 별도 환불규정 → ② 7일 이내·이용이력 없음 전액환불
 *  → ③ 정가 수강기간 1/2 경과(기간제) → ④ 계산식 적용.
 *
 * ★③(1/2 경과)은 요청서에서 **11-6 기간제 계산식 아래**에 적혀 있어 기간제에만 적용한다.
 *   단과에도 걸어야 하는지는 원장 확인 사항으로 남겼다(설계문서 D16).
 */
export function computeRefund(input: RefundCalcInput): RefundCalcResult {
  const base = Math.max(0, Math.floor(input.baseKrw));
  const listPrice = Math.max(0, Math.floor(input.listPriceKrw ?? input.baseKrw));
  const coupon = Math.max(0, Math.floor(input.couponKrw));
  const point = Math.max(0, Math.floor(input.pointKrw));
  const pgPaid = Math.max(0, Math.floor(input.pgPaidKrw));
  const usedDays = Math.max(0, Math.floor(input.usedDays));
  const usedSessions = Math.max(0, Math.floor(input.usedSessions));
  const durationDays =
    input.durationDays != null && input.durationDays > 0 ? Math.floor(input.durationDays) : null;
  const plannedSessions =
    input.plannedSessions != null && input.plannedSessions > 0
      ? Math.floor(input.plannedSessions)
      : null;
  const elapsedRatio = durationDays ? usedDays / durationDays : null;

  const shell = {
    calcTypeLabel: REFUND_CALC_TYPE_LABELS[input.calcType],
    baseKrw: base,
    listPriceKrw: listPrice,
    couponKrw: coupon,
    pointKrw: point,
    durationDays,
    usedDays,
    elapsedRatio,
    plannedSessions,
    usedSessions,
  };

  /** 환불 대상금액을 포인트/PG 로 나눠 담는다(11-11). 세 경로가 공유한다. */
  function settle(refundable: number, formula: string[]) {
    const pointReturn = Math.min(point, refundable);
    const pgPlanRaw = refundable - pointReturn;
    // ★토스 취소 예정금액은 실제 PG 결제금액을 넘을 수 없다(11-3·11-11).
    //   넘으면 그만큼은 돌려줄 수단이 없으므로 최종 환불금액도 함께 줄어든다.
    const pgPlan = Math.min(pgPlanRaw, pgPaid);
    const lines = [...formula];
    if (point > 0) {
      lines.push(
        `포인트 반환액 = MIN(사용 포인트 ${won(point)}, 환불 대상금액 ${won(refundable)}) = ${won(pointReturn)}`,
      );
    }
    lines.push(`토스 취소 예정금액 = ${won(refundable)} − ${won(pointReturn)} = ${won(pgPlanRaw)}`);
    if (pgPlan !== pgPlanRaw) {
      lines.push(
        `★실제 PG 결제금액 ${won(pgPaid)}을 넘을 수 없어 취소 예정금액을 ${won(pgPlan)}으로 줄였다`,
      );
    }
    return {
      refundableKrw: refundable,
      pointReturnKrw: pointReturn,
      pgCancelPlanKrw: pgPlan,
      finalRefundKrw: pointReturn + pgPlan,
      formula: lines,
    };
  }

  // ── ① 상품별 별도 환불규정 — 자동계산이 흉내 낼 수 없다(11-2 최우선) ──────────
  if (input.hasOwnPolicy || input.calcType === "custom") {
    return {
      ...shell,
      verdict: "manual",
      verdictReason:
        "상품별 별도 환불규정 적용 — 결제 당시 고지된 규정을 읽고 금액을 직접 입력해 주세요.",
      dayDeductionKrw: null,
      sessionDeductionKrw: null,
      appliedDeductionKrw: 0,
      deductionBasis: "none",
      refundableKrw: 0,
      pointReturnKrw: 0,
      pgCancelPlanKrw: 0,
      finalRefundKrw: 0,
      formula: ["자동계산 대상이 아닙니다 — 결제 당시 상품안내의 별도 환불규정을 적용합니다."],
    };
  }

  // ── ② 7일 이내 + 유료 이용이력 없음 → 전액환불(11-3) ────────────────────────
  if (input.withinFirstWeek && input.noPaidUsage) {
    const refundable = clamp0(base - coupon);
    const settled = settle(refundable, [
      `환불 대상금액 = 결제기준금액 ${won(base)} − 쿠폰 사용금액 ${won(coupon)} = ${won(refundable)}`,
    ]);
    return {
      ...shell,
      verdict: "full",
      verdictReason: "전액환불 가능 — 수강 시작 후 7일 이내·유료 이용이력 없음",
      dayDeductionKrw: null,
      sessionDeductionKrw: null,
      appliedDeductionKrw: 0,
      deductionBasis: "none",
      ...settled,
    };
  }

  // ── ③ 정가 수강기간의 1/2 이상 경과 → 환불 불가(11-6, 기간제) ───────────────
  if (input.calcType === "period" && durationDays != null && usedDays * 2 >= durationDays) {
    return {
      ...shell,
      verdict: "blocked",
      verdictReason: `환불 불가 — 정가 수강기간의 1/2 이상 경과(${usedDays}일 / ${durationDays}일)`,
      dayDeductionKrw: null,
      sessionDeductionKrw: null,
      appliedDeductionKrw: 0,
      deductionBasis: "none",
      refundableKrw: 0,
      pointReturnKrw: 0,
      pgCancelPlanKrw: 0,
      finalRefundKrw: 0,
      formula: [
        `실제 이용일수 ${usedDays}일 × 2 ≥ 정가 수강기간 ${durationDays}일 → 금액 계산 대신 환불 불가`,
      ],
    };
  }

  // ── ④ 계산식 적용(11-6 기간제 / 11-7 단과·단과묶음) ────────────────────────
  const dayDeduction = deduction(listPrice, durationDays, usedDays);
  // 기간제는 회차 기준을 보지 않는다(11-6 에 식이 없다).
  const sessionDeduction =
    input.calcType === "period" ? null : deduction(listPrice, plannedSessions, usedSessions);

  const candidates: Array<{ basis: "day" | "session"; krw: number }> = [];
  if (dayDeduction != null) candidates.push({ basis: "day", krw: dayDeduction });
  if (sessionDeduction != null) candidates.push({ basis: "session", krw: sessionDeduction });

  // ★★분모가 하나도 없으면 **계산한 척하면 안 된다.** 정가 수강기간(D)도 전체 예정 회차(T)도
  //   없으면 공제가 0 이 되어 조용히 전액환불이 나오고, 사유에는 「기간제 계산식 적용」이 찍혀
  //   관리자가 눈치챌 단서가 없다. 그 손해는 학원이 본다 — 사람이 정하도록 돌려보낸다.
  if (candidates.length === 0) {
    return {
      ...shell,
      verdict: "manual",
      verdictReason:
        "결제 당시 정가 수강기간·전체 예정 회차가 모두 없어 공제를 계산할 수 없습니다 — 금액을 직접 입력해 주세요.",
      dayDeductionKrw: null,
      sessionDeductionKrw: null,
      appliedDeductionKrw: 0,
      deductionBasis: "none",
      refundableKrw: 0,
      pointReturnKrw: 0,
      pgCancelPlanKrw: 0,
      finalRefundKrw: 0,
      formula: [
        "정가 수강기간(D)·전체 예정 회차(T) 스냅샷이 모두 비어 있어 공제 분모가 없습니다.",
      ],
    };
  }

  const best = candidates.reduce<{ basis: "day" | "session"; krw: number } | null>(
    (acc, c) => (acc == null || c.krw > acc.krw ? c : acc),
    null,
  );
  const applied = best?.krw ?? 0;
  const basis = best?.basis ?? "none";

  const refundable = clamp0(base - applied - coupon);
  const formula: string[] = [];
  if (dayDeduction != null && durationDays != null) {
    formula.push(
      `이용일수 기준 공제액 = 정상가 ${won(listPrice)} ÷ ${durationDays}일 × ${usedDays}일 = ${won(dayDeduction)}`,
    );
  }
  if (sessionDeduction != null && plannedSessions != null) {
    formula.push(
      `회차 기준 공제액 = 정상가 ${won(listPrice)} ÷ ${plannedSessions}회 × ${usedSessions}회 = ${won(sessionDeduction)}`,
    );
  }
  if (candidates.length > 1) {
    formula.push(
      `최종 적용 공제액 = MAX(${candidates.map((c) => won(c.krw)).join(", ")}) = ${won(applied)}` +
        ` (${basis === "session" ? "회차" : "이용일수"} 기준이 더 큼)`,
    );
  }
  formula.push(
    `환불 대상금액 = 결제기준금액 ${won(base)} − 공제액 ${won(applied)} − 쿠폰 사용금액 ${won(coupon)} = ${won(refundable)}`,
  );

  const settled = settle(refundable, formula);
  return {
    ...shell,
    verdict: refundable > 0 ? "partial" : "blocked",
    verdictReason:
      refundable > 0
        ? `${REFUND_CALC_TYPE_LABELS[input.calcType]} 계산식 적용`
        : "환불 불가 — 공제액과 쿠폰 사용금액이 결제기준금액 이상",
    dayDeductionKrw: dayDeduction,
    sessionDeductionKrw: sessionDeduction,
    appliedDeductionKrw: applied,
    deductionBasis: basis,
    ...settled,
  };
}
