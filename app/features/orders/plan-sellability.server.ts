// feat-11-013 P3-b — 상품 판매 가능 판정의 **단일 권위**.
//
// ★결제 진입 4경로가 전부 이 함수를 부른다 — 장바구니(cart-resolve) · 단건 토스(create-order) ·
//   자동결제(billing-confirm) · 무통장 단건(orders/api/bank-transfer). 종전에는 중간 신청 불허(closed)
//   게이트가 cart-resolve 한 곳에만 있어, 카탈로그 「바로 구매」가 타는 create-order 와 무통장 API 에
//   planCode 를 직접 보내면 409 없이 주문·지급이 됐다(무통장은 판매 종료·오픈 전 게이트도 없었다).
// ★가격(유료 여부)은 여기서 보지 않는다 — 경로마다 문구가 다르고(결제/신청) 판매 가능 여부와는 축이 다르다.

import { isExpiredInstant } from "~/core/lib/kst";
import adminClient from "~/core/lib/supa-admin-client.server";
import { toMidEntryMode } from "~/features/lms/lib/course-format";
import { isMidEntryClosed } from "~/features/orders/lib/term-window";
import { isLectureProductKind } from "~/features/subscriptions/labels";

export interface SellablePlan {
  planId: string;
  name: string;
  productKind: string;
  availableFrom: string | null;
  availableUntil: string | null;
}

export type PlanSellability =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * ① 오픈일 미도래 → 400 ② 판매 종료일 경과 → 400
 * ③ 강의 상품: 중간 신청 불허(closed) + 개강 후 → 409
 * ④ 강의 상품: 연결 강의(plan_courses) 0건 → 409 (돈만 받고 아무것도 주지 않는 상태 방지)
 * 학습 구독 상품(subject/bundle/membership)은 ①②만 해당한다.
 */
export async function assertPlanSellable(
  plan: SellablePlan,
  options: { nowMs?: number } = {},
): Promise<PlanSellability> {
  const nowMs = options.nowMs ?? Date.now();
  if (plan.availableFrom && Date.parse(plan.availableFrom) > nowMs) {
    return { ok: false, error: "아직 오픈 전 상품입니다", status: 400 };
  }
  if (isExpiredInstant(plan.availableUntil, nowMs)) {
    return { ok: false, error: `《${plan.name}》 은 판매가 종료되었습니다`, status: 400 };
  }
  if (!isLectureProductKind(plan.productKind)) return { ok: true };

  // 중간 신청 불허 — 수강 시작일(00:00 KST) 이후 결제는 거절.
  const { data: termPolicy } = await adminClient
    .from("plan_policies")
    .select("starts_on, mid_entry_mode")
    .eq("plan_id", plan.planId)
    .maybeSingle();
  if (
    isMidEntryClosed({
      nowMs,
      startsOn: termPolicy?.starts_on ?? null,
      midEntryMode: toMidEntryMode(termPolicy?.mid_entry_mode),
    })
  ) {
    return {
      ok: false,
      error: `《${plan.name}》 은 개강 후 중간 신청을 받지 않습니다`,
      status: 409,
    };
  }

  // ★구성이 빈 강의 상품은 팔지 않는다 — 지급(fulfillCourseEnrollments)이 plan_courses 를 훑어
  //   수강권을 주므로, 연결된 강의가 0개면 돈만 받고 아무것도 주지 않는다(2026-09-14 리허설 실제 사례).
  const { count: courseCount } = await adminClient
    .from("plan_courses")
    .select("plan_id", { count: "exact", head: true })
    .eq("plan_id", plan.planId);
  if ((courseCount ?? 0) === 0) {
    return {
      ok: false,
      error: `《${plan.name}》 은 아직 수강 구성이 등록되지 않았습니다. 고객센터로 문의해 주세요.`,
      status: 409,
    };
  }
  return { ok: true };
}
