// feat-11-013 P7-b — DB → 환불 계산 입력값 어댑터.
//
// ★계산 자체는 `lib/refund-calc.ts`(순수 함수)가 한다. 이 파일은 **값을 모아 주기만** 한다.
//   두 곳에서 계산하지 않기 위해서다.
//
// ★스냅샷이 없는 주문은 **계산하지 않고 `manual` 로 돌려보낸다.** 없는 값을 0 으로 때우면
//   공제가 0 이 되어 전액환불로 계산되고, 그 손해는 학원이 본다. 실측 2026-09-15 기준
//   기존 주문 61건은 전부 스냅샷이 없다(P1 이후 신규 주문이 없다 — 강의 게이트가 닫혀 있다).

import adminClient from "~/core/lib/supa-admin-client.server";

import {
  computeRefund,
  REFUND_CALC_TYPES,
  type RefundCalcInput,
  type RefundCalcResult,
  type RefundCalcType,
} from "./lib/refund-calc";
import { kstDate, usedDaysOf } from "./lib/refund-usage";

/** 요청서 11-3 — 「수강 시작일부터 7일 이내」. */
const FREE_REFUND_DAYS = 7;

/** 한 주문항목의 계산 결과 + 그 근거가 된 실측값. */
export interface RefundItemCalc {
  refundItemId: string;
  orderItemId: string;
  label: string;
  /** 계산할 수 없는 경우의 사유. 있으면 `result` 는 null 이고 관리자가 직접 입력한다. */
  blockedReason: string | null;
  result: RefundCalcResult | null;
  /** 화면에 근거로 함께 띄운다 — 요청서 11-4·11-5 의 판정 재료. */
  evidence: {
    /** 이 결제분의 이용 시작일. */
    usageStartsAt: string | null;
    /** 이용 시작일을 수강권에서 빌려 왔는가(주문항목에 없을 때) — 재구매면 부정확할 수 있다. */
    usageStartFallback: boolean;
    /** 계산 기준일(= 환불 접수일). */
    basisAt: string;
    /** 승인된 일시정지로 제외한 일수. */
    pausedDays: number;
    /** 유료 영상을 본 고유 회차 수. */
    watchedLessons: number;
    /** 유료 자료를 이용한 고유 회차 수. */
    materialLessons: number;
    /** 회차에 연결되지 않은 공통 유료자료를 썼는가 — 최소 1회차로 센다(요청서 11-4). */
    commonMaterialUsed: boolean;
  };
}

function isCalcType(v: string | null): v is RefundCalcType {
  return v != null && (REFUND_CALC_TYPES as readonly string[]).includes(v);
}

/**
 * 환불건 하나의 항목별 자동계산.
 *
 * ★토스를 부르지 않는다. 금액을 저장하지도 않는다 — **계산해서 보여 주기만** 한다
 *   (요청서 §11 머리말: 「계산하거나 금액을 확정해도 토스 결제취소가 자동 실행되면 안 된다」).
 */
export async function computeRefundForRefund(refundId: string): Promise<RefundItemCalc[]> {
  const { data: refund } = await adminClient
    .from("refunds")
    .select("refund_id, order_id, user_id, intake_at")
    .eq("refund_id", refundId)
    .maybeSingle();
  if (!refund) return [];

  const { data: items } = await adminClient
    .from("refund_items")
    .select(
      "refund_item_id, order_item_id, order_items!inner(order_item_id, item_type, title_snapshot, plan_id, enrollment_id, unit_price_krw, quantity, paid_amount_krw, coupon_alloc_krw, point_alloc_krw, list_price_snapshot_krw, duration_days_snapshot, planned_sessions_snapshot, refund_calc_type, refund_policy_snapshot, usage_starts_at)",
    )
    .eq("refund_id", refundId)
    .order("created_at");
  if (!items?.length) return [];

  const basisAt = refund.intake_at;
  const basisDate = kstDate(basisAt);
  const out: RefundItemCalc[] = [];

  for (const row of items) {
    const oi = row.order_items as unknown as {
      order_item_id: string;
      item_type: string;
      title_snapshot: string | null;
      plan_id: string | null;
      enrollment_id: string | null;
      unit_price_krw: number;
      quantity: number;
      paid_amount_krw: number | null;
      coupon_alloc_krw: number;
      point_alloc_krw: number;
      list_price_snapshot_krw: number | null;
      duration_days_snapshot: number | null;
      planned_sessions_snapshot: number | null;
      refund_calc_type: string | null;
      refund_policy_snapshot: unknown;
      usage_starts_at: string | null;
    };
    const label = oi.title_snapshot ?? (oi.item_type === "book" ? "교재" : "강의");
    const blank = {
      refundItemId: row.refund_item_id,
      orderItemId: row.order_item_id,
      label,
      result: null,
      evidence: {
        usageStartsAt: oi.usage_starts_at,
        usageStartFallback: false,
        basisAt,
        pausedDays: 0,
        watchedLessons: 0,
        materialLessons: 0,
        commonMaterialUsed: false,
      },
    };

    // 교재는 수강분 공제 대상이 아니다 — 반품 규정을 탄다(요청서 §9).
    if (oi.item_type === "book") {
      out.push({ ...blank, blockedReason: "교재는 수강분 공제 대상이 아닙니다 — 반품 규정에 따라 직접 입력해 주세요." });
      continue;
    }
    // ★결제 당시 스냅샷이 없으면 계산하지 않는다. 0 으로 때우면 학원이 손해를 본다.
    if (!isCalcType(oi.refund_calc_type)) {
      out.push({
        ...blank,
        blockedReason:
          "결제 당시 환불 기준 스냅샷이 없는 주문입니다(2026-09-14 이전). 금액을 직접 입력해 주세요.",
      });
      continue;
    }

    // ── 이용 시작일 ────────────────────────────────────────────────────────
    // 권위는 주문항목이다(요청서 11-12). 없으면 수강권에서 빌리되 그 사실을 남긴다 —
    // 재구매로 연장된 수강권이면 최초 구매일이 나와 이용일수가 부풀 수 있다.
    const enrollmentIds = await enrollmentIdsFor(oi, refund.user_id);
    let usageStartsAt = oi.usage_starts_at;
    let usageStartFallback = false;
    if (!usageStartsAt && enrollmentIds.length) {
      const { data: enr } = await adminClient
        .from("enrollments")
        .select("starts_at")
        .in("enrollment_id", enrollmentIds)
        .order("starts_at")
        .limit(1)
        .maybeSingle();
      if (enr?.starts_at) {
        usageStartsAt = enr.starts_at;
        usageStartFallback = true;
      }
    }
    if (!usageStartsAt) {
      out.push({
        ...blank,
        blockedReason: "이용 시작일을 찾을 수 없습니다(수강권 미지급). 금액을 직접 입력해 주세요.",
      });
      continue;
    }

    // ── 실제 이용일수 d (요청서 11-5) ──────────────────────────────────────
    // 접수일 − 시작일 + 1, 승인된 일시정지 제외. 시작 전이면 0.
    // 관리자가 늦게 처리해도 접수일 이후는 세지 않는다 — 기준일이 접수일이라 자동으로 그렇게 된다.
    const pauses = enrollmentIds.length ? await pausesFor(enrollmentIds) : [];
    const { usedDays, pausedDays } = usedDaysOf({
      usageStartDate: kstDate(usageStartsAt),
      basisDate,
      pauses,
    });

    // ── 이용 회차 t (요청서 11-4) ──────────────────────────────────────────
    const usage = enrollmentIds.length
      ? await usageFor(enrollmentIds, usageStartsAt, basisAt)
      : { watched: new Set<string>(), material: new Set<string>(), commonMaterial: false };
    const lessons = new Set<string>([...usage.watched, ...usage.material]);
    // 회차에 연결되지 않은 공통 유료자료는 **최소 1회차**로 센다(요청서 11-4).
    const usedSessions = lessons.size + (usage.commonMaterial && lessons.size === 0 ? 1 : 0);
    const noPaidUsage = usedSessions === 0;

    const gross = oi.unit_price_krw * (oi.quantity ?? 1);
    const pgPaid =
      oi.paid_amount_krw ??
      Math.max(0, gross - (oi.coupon_alloc_krw ?? 0) - (oi.point_alloc_krw ?? 0));

    const input: RefundCalcInput = {
      calcType: oi.refund_calc_type,
      baseKrw: gross,
      listPriceKrw: oi.list_price_snapshot_krw,
      couponKrw: oi.coupon_alloc_krw ?? 0,
      pointKrw: oi.point_alloc_krw ?? 0,
      pgPaidKrw: pgPaid,
      durationDays: oi.duration_days_snapshot,
      usedDays,
      plannedSessions: oi.planned_sessions_snapshot,
      usedSessions,
      withinFirstWeek: usedDays <= FREE_REFUND_DAYS,
      noPaidUsage,
      hasOwnPolicy: oi.refund_policy_snapshot != null,
    };

    out.push({
      refundItemId: row.refund_item_id,
      orderItemId: row.order_item_id,
      label,
      blockedReason: null,
      result: computeRefund(input),
      evidence: {
        usageStartsAt,
        usageStartFallback,
        basisAt,
        pausedDays,
        watchedLessons: usage.watched.size,
        materialLessons: usage.material.size,
        commonMaterialUsed: usage.commonMaterial,
      },
    });
  }
  return out;
}

/**
 * 이 주문항목이 연 수강권들.
 *
 * ★`enrollments.order_item_id` 로 찾지 않는다 — 재구매가 그 칸을 덮어써서 1차 주문항목은
 *   링크를 잃는다. 상품이 연 강의(plan_courses)로 찾는 편이 시점에 흔들리지 않는다.
 *   수강기간 연장 주문은 `order_items.enrollment_id` 가 직접 가리킨다.
 */
async function enrollmentIdsFor(
  oi: { item_type: string; plan_id: string | null; enrollment_id: string | null },
  userId: string,
): Promise<string[]> {
  if (oi.enrollment_id) return [oi.enrollment_id];
  if (!oi.plan_id) return [];
  const { data: links } = await adminClient
    .from("plan_courses")
    .select("course_id")
    .eq("plan_id", oi.plan_id);
  const courseIds = (links ?? []).map((l) => l.course_id);
  if (!courseIds.length) return [];
  const { data: enrs } = await adminClient
    .from("enrollments")
    .select("enrollment_id")
    .eq("user_id", userId)
    .in("course_id", courseIds);
  return (enrs ?? []).map((e) => e.enrollment_id);
}

async function pausesFor(enrollmentIds: string[]) {
  const { data } = await adminClient
    .from("enrollment_pauses")
    .select("starts_on, ends_on, resumed_at")
    .in("enrollment_id", enrollmentIds);
  return data ?? [];
}

/**
 * 유료 이용이력 — 영상·자료를 **고유 회차**로 센다(요청서 11-4).
 *
 * ★무료 맛보기·무료자료는 `enrollment_id` 가 null 로 남으므로 수강권으로 거르면 자동 제외된다.
 *   `course_lessons.is_preview` 플래그로 거르면 안 된다 — 관리자가 나중에 토글할 수 있어
 *   과거 시청이 오분류된다. 수강권 링크는 그 시점의 스냅샷이다.
 */
async function usageFor(enrollmentIds: string[], fromIso: string, toIso: string) {
  const [{ data: watch }, { data: materials }] = await Promise.all([
    adminClient
      .from("watch_events")
      .select("lesson_id")
      .in("enrollment_id", enrollmentIds)
      .gte("reported_at", fromIso)
      .lte("reported_at", toIso)
      .limit(20000),
    adminClient
      .from("material_access_logs")
      .select("lesson_id")
      .in("enrollment_id", enrollmentIds)
      .gte("accessed_at", fromIso)
      .lte("accessed_at", toIso)
      .limit(20000),
  ]);
  const watched = new Set<string>((watch ?? []).map((w) => w.lesson_id));
  const material = new Set<string>();
  let commonMaterial = false;
  for (const m of materials ?? []) {
    if (m.lesson_id) material.add(m.lesson_id);
    else commonMaterial = true;
  }
  return { watched, material, commonMaterial };
}
