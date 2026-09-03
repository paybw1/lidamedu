// feat-11-010 — 수강기간 연장: 제안 해석 · 주문 생성 · 결제 후 적용 · 환불 원복.
// 요청서_0901 §3. 설계: docs/features/feat-11-010-course-extension.md
//
// ★만료일을 바꾸는 코드는 이 파일의 applyEnrollmentExtension 한 곳이다.
//   화면·주문 생성·결제 성공·환불이 전부 여기를 지난다(Layer 2 §8 뮤테이션 경로 동결).
// ★쓰기는 adminClient — orders/order_items/enrollments 에 쓰기 RLS 정책이 없다(서버 권위).

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  EXTENSION_DEFAULTS_FALLBACK,
  resolveExtensionOffer,
  type ExtensionDefaults,
  type ExtensionOffer,
  type PlanExtensionInput,
} from "~/features/lms/lib/extension-policy";
import { logEnrollmentAdminAction } from "~/features/lms/queries.server";

const DAY_MS = 86_400_000;

/** 자동 원복을 보류했다는 표시 — 이력 화면이 이 문구로 "수동 처리 필요" 를 가른다. */
const MANUAL_MARK = "관리자 수동 처리 필요";

export interface EnrollmentExtensionContext {
  enrollmentId: string;
  userId: string;
  planId: string | null;
  status: string;
  expiresAt: string;
  offer: ExtensionOffer;
}

/**
 * 여러 수강권의 연장 가능 여부를 한 번에 판정한다.
 * ★화면(버튼)과 서버(주문 생성)가 **이 함수**를 함께 쓴다 — 두 판정이 갈리면
 *   "버튼은 안 보이는데 URL 로는 되는" 구멍이 생긴다.
 */
export async function resolveExtensionContexts(input: {
  enrollments: Array<{
    enrollmentId: string;
    userId: string;
    planId: string | null;
    status: string;
    expiresAt: string;
  }>;
  defaults: ExtensionDefaults;
  now?: Date;
}): Promise<Map<string, EnrollmentExtensionContext>> {
  const out = new Map<string, EnrollmentExtensionContext>();
  if (input.enrollments.length === 0) return out;
  const now = input.now ?? new Date();

  const planIds = [
    ...new Set(input.enrollments.map((e) => e.planId).filter((v): v is string => !!v)),
  ];
  const planById = new Map<string, PlanExtensionInput>();
  if (planIds.length > 0) {
    const [plansRes, policiesRes] = await Promise.all([
      adminClient
        .from("subscription_plans")
        .select("plan_id, product_kind")
        .in("plan_id", planIds),
      adminClient
        .from("plan_policies")
        .select(
          "plan_id, duration_days, extension_allowed, extension_price_krw, extension_max_count, extension_days",
        )
        .in("plan_id", planIds),
    ]);
    const policyById = new Map(
      (policiesRes.data ?? []).map((p) => [p.plan_id, p] as const),
    );
    for (const plan of plansRes.data ?? []) {
      const p = policyById.get(plan.plan_id);
      planById.set(plan.plan_id, {
        productKind: plan.product_kind,
        extensionAllowed: p?.extension_allowed ?? null,
        extensionPriceKrw: p?.extension_price_krw ?? null,
        extensionMaxCount: p?.extension_max_count ?? null,
        extensionDays: p?.extension_days ?? null,
        durationDays: p?.duration_days ?? null,
      });
    }
  }

  // 사용한 연장 횟수 — 카운터 컬럼이 아니라 이력에서 센다(환불 원복과 자동으로 맞는다).
  const usedByEnrollment = new Map<string, number>();
  const { data: exts } = await adminClient
    .from("enrollment_extensions")
    .select("enrollment_id")
    .in("enrollment_id", input.enrollments.map((e) => e.enrollmentId))
    .eq("status", "applied");
  for (const e of exts ?? []) {
    usedByEnrollment.set(
      e.enrollment_id,
      (usedByEnrollment.get(e.enrollment_id) ?? 0) + 1,
    );
  }

  const missingPlan: PlanExtensionInput = {
    productKind: null,
    extensionAllowed: null,
    extensionPriceKrw: null,
    extensionMaxCount: null,
    extensionDays: null,
    durationDays: null,
  };
  for (const e of input.enrollments) {
    const plan = (e.planId ? planById.get(e.planId) : null) ?? missingPlan;
    out.set(e.enrollmentId, {
      ...e,
      offer: resolveExtensionOffer({
        now,
        plan,
        defaults: input.defaults,
        status: e.status,
        expiresAt: e.expiresAt,
        usedCount: usedByEnrollment.get(e.enrollmentId) ?? 0,
      }),
    });
  }
  return out;
}

/** 한 건 판정 — 주문 생성 액션이 서버에서 다시 확인할 때 쓴다. */
export async function resolveExtensionForEnrollment(input: {
  enrollmentId: string;
  userId: string;
  defaults: ExtensionDefaults;
  now?: Date;
}): Promise<EnrollmentExtensionContext | null> {
  const { data: e } = await adminClient
    .from("enrollments")
    .select("enrollment_id, user_id, plan_id, status, expires_at")
    .eq("enrollment_id", input.enrollmentId)
    // ★enrollments 에는 deleted_at 이 없다 — 걸면 PostgREST 오류로 조용히 null 이 된다.
    //   해지 여부는 status='revoked' 가 나타내고, 그 판정은 정책 해석이 맡는다.
    .maybeSingle();
  // ★본인 수강권인지 확인 — enrollmentId 만 갈아 끼우는 접근을 여기서 막는다.
  if (!e || e.user_id !== input.userId) return null;
  const map = await resolveExtensionContexts({
    enrollments: [
      {
        enrollmentId: e.enrollment_id,
        userId: e.user_id,
        planId: e.plan_id,
        status: e.status,
        expiresAt: e.expires_at,
      },
    ],
    defaults: input.defaults,
    now: input.now,
  });
  return map.get(e.enrollment_id) ?? null;
}

/**
 * 연장 결제용 1-item 주문 생성. **수강기간은 아직 건드리지 않는다** —
 * 요청서 "PG 결제 성공 전에는 수강기간 변경 금지".
 */
export async function createExtensionOrder(input: {
  userId: string;
  ctx: EnrollmentExtensionContext;
}): Promise<{ orderId: string; orderItemId: string; amountKrw: number }> {
  const amountKrw = input.ctx.offer.policy.priceKrw;
  const { data: order, error } = await adminClient
    .from("orders")
    .insert({
      user_id: input.userId,
      status: "attempted", // ★PG 호출 전 — 결제시도. 결제 성공 시에만 paid 로 간다.
      total_krw: amountKrw,
      payment_method: "toss",
    })
    .select("order_id")
    .single();
  if (error) throw error;
  // ★표시명 스냅샷(P2) — 이게 없어서 학생 결제내역에 `course_extension` 이 그대로 찍혔다.
  //   강의명을 붙여 "무엇을 연장했는지"까지 남긴다.
  const { data: enr } = await adminClient
    .from("enrollments")
    .select(
      "course:courses!enrollments_course_id_fkey(edition_label, series:course_series!courses_series_id_fkey(title))",
    )
    .eq("enrollment_id", input.ctx.enrollmentId)
    .maybeSingle();
  const course = enr?.course as {
    edition_label: string;
    series: { title: string } | null;
  } | null;
  const courseLabel = course
    ? `${course.series?.title ?? ""} ${course.edition_label}`.trim()
    : "";
  const days = input.ctx.offer.policy.days;
  const titleSnapshot = `수강기간 연장${courseLabel ? ` — ${courseLabel}` : ""}${days ? ` ${days}일` : ""}`;

  const { data: item, error: itemErr } = await adminClient
    .from("order_items")
    .insert({
      order_id: order.order_id,
      // ★주문 유형을 따로 저장한다(요청서 "주문 유형은 수강기간 연장으로 별도 저장").
      item_type: "course_extension",
      plan_id: input.ctx.planId,
      enrollment_id: input.ctx.enrollmentId,
      unit_price_krw: amountKrw,
      title_snapshot: titleSnapshot,
    })
    .select("order_item_id")
    .single();
  if (itemErr) throw itemErr;
  return {
    orderId: order.order_id,
    orderItemId: item.order_item_id,
    amountKrw,
  };
}

/**
 * 결제 성공 시 실제 연장 적용. **멱등** — order_item_id UNIQUE 가 이중 연장을 막는다.
 * ★일수·만료일은 주문 시점 값이 아니라 **적용 시점에 다시 계산**한다.
 *   결제창에 머무는 동안 만료일이 바뀌었을 수 있고, 그때는 지금 값이 맞다.
 */
export async function applyEnrollmentExtension(input: {
  orderItemId: string;
  userId: string;
  enrollmentId: string;
  planId: string | null;
  amountKrw: number;
  defaults: ExtensionDefaults;
}): Promise<void> {
  const ctx = await resolveExtensionForEnrollment({
    enrollmentId: input.enrollmentId,
    userId: input.userId,
    defaults: input.defaults,
  });
  if (!ctx) {
    console.error("[extension] enrollment not found:", input.enrollmentId);
    return;
  }
  // 결제까지 끝난 건이라 정책이 그새 꺼졌더라도 되돌리지 않는다 —
  // 돈은 받았는데 연장이 안 되는 상태가 더 나쁘다. 횟수 초과만 로그로 남긴다.
  const days = ctx.offer.policy.days;
  const next = new Date(ctx.offer.nextExpiresAt);

  const { error: insErr } = await adminClient
    .from("enrollment_extensions")
    .insert({
      enrollment_id: input.enrollmentId,
      user_id: input.userId,
      plan_id: input.planId,
      order_item_id: input.orderItemId,
      days_added: days,
      prev_expires_at: ctx.expiresAt,
      next_expires_at: next.toISOString(),
      amount_krw: input.amountKrw,
    });
  if (insErr) {
    // 23505 = 이 결제로 이미 연장했다(웹훅·confirm 이중 호출). 정상 종료.
    if (insErr.code !== "23505") {
      console.error("[extension] history insert failed:", insErr.message);
    }
    return;
  }

  const { error: updErr } = await adminClient
    .from("enrollments")
    .update({ expires_at: next.toISOString(), status: "active" })
    .eq("enrollment_id", input.enrollmentId);
  if (updErr) {
    console.error("[extension] expires_at update failed:", updErr.message);
    return;
  }
  await logEnrollmentAdminAction({
    enrollmentId: input.enrollmentId,
    actorId: input.userId,
    action: "extend",
    before: { expires_at: ctx.expiresAt },
    after: { expires_at: next.toISOString(), via: "extension_order" },
    reason: `수강기간 연장 결제 (${days}일)`,
  });
}

/**
 * 환불 원복 — 그 결제로 더한 일수만 되돌린다(수강권 회수가 아니다).
 * ★이미 연장기간을 써 버린 경우(되돌리면 과거가 됨)는 자동으로 깎지 않고
 *   이력만 reverted 로 표시한 뒤 관리자 수동 처리로 넘긴다(요청서 §3 예외 항목).
 */
export async function revertEnrollmentExtension(
  orderItemId: string,
  reason: string,
): Promise<void> {
  const { data: ext } = await adminClient
    .from("enrollment_extensions")
    .select(
      "extension_id, enrollment_id, days_added, prev_expires_at, next_expires_at, status",
    )
    .eq("order_item_id", orderItemId)
    .maybeSingle();
  if (!ext || ext.status !== "applied") return;

  const { data: enr } = await adminClient
    .from("enrollments")
    .select("expires_at")
    .eq("enrollment_id", ext.enrollment_id)
    .maybeSingle();

  const now = Date.now();
  const prev = new Date(ext.prev_expires_at);
  // 되돌린 만료일이 이미 지났으면 = 연장기간을 실제로 쓴 것. 자동으로 깎지 않는다.
  const alreadyUsed = prev.getTime() <= now;
  let note: string;
  if (alreadyUsed) {
    note = `연장기간을 이미 사용 — 만료일 자동 원복 보류(${MANUAL_MARK})`;
  } else {
    // 그 사이 다른 연장이 더 붙었을 수 있으므로 **일수만 빼서** 계산한다.
    const current = enr?.expires_at ? new Date(enr.expires_at) : prev;
    const rolledBack = new Date(current.getTime() - ext.days_added * DAY_MS);
    const target = rolledBack.getTime() < prev.getTime() ? prev : rolledBack;
    const { error } = await adminClient
      .from("enrollments")
      .update({ expires_at: target.toISOString() })
      .eq("enrollment_id", ext.enrollment_id);
    if (error) {
      console.error("[extension] revert update failed:", error.message);
      return;
    }
    note = `연장 ${ext.days_added}일 원복`;
    await logEnrollmentAdminAction({
      enrollmentId: ext.enrollment_id,
      actorId: null,
      action: "extend",
      before: { expires_at: enr?.expires_at ?? null },
      after: { expires_at: target.toISOString(), via: "extension_refund" },
      reason: `환불 원복 — ${reason}`,
    });
  }

  await adminClient
    .from("enrollment_extensions")
    .update({
      status: "reverted",
      reverted_at: new Date().toISOString(),
      revert_reason: `${reason} / ${note}`,
    })
    .eq("extension_id", ext.extension_id);
}

/** 기본값 로드 실패 시에도 결제 경로가 죽지 않게 — 꺼진 기본값으로 떨어진다. */
export const EXTENSION_FALLBACK = EXTENSION_DEFAULTS_FALLBACK;

// ── 연장 이력 조회 (feat-11-010 C단계) ─────────────────────────────────────
// 요청서 §3 저장 항목: 회원명/회원번호 · 강의명 · 기존 종료일 · 연장일수 · 변경 종료일 ·
//   금액 · 결제일 · 결제번호 · 횟수 · 결제상태 · 환불상태.
// ★"횟수" 는 그 수강권의 몇 번째 연장인가 — 카운터가 아니라 이력 순번으로 센다.

export interface ExtensionHistoryRow {
  extensionId: string;
  enrollmentId: string;
  memberName: string | null;
  memberNo: number | null;
  courseLabel: string;
  prevExpiresAt: string;
  nextExpiresAt: string;
  daysAdded: number;
  amountKrw: number;
  paidAt: string | null;
  paymentRef: string | null;
  paymentStatus: string | null;
  refundedAt: string | null;
  seq: number;
  status: string;
  revertReason: string | null;
  note: string | null;
  /** 환불했지만 이미 쓴 기간이라 만료일을 못 되돌린 건 — 사람이 처리해야 한다. */
  needsManual: boolean;
}

export async function listExtensionHistory(
  limit = 200,
): Promise<ExtensionHistoryRow[]> {
  const { data, error } = await adminClient
    .from("enrollment_extensions")
    .select(
      "extension_id, enrollment_id, user_id, order_item_id, days_added, prev_expires_at, next_expires_at, amount_krw, status, reverted_at, revert_reason, note, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const enrollmentIds = [...new Set(rows.map((r) => r.enrollment_id))];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const orderItemIds = rows
    .map((r) => r.order_item_id)
    .filter((v): v is string => !!v);

  const [enrRes, profRes, itemRes] = await Promise.all([
    adminClient
      .from("enrollments")
      .select(
        "enrollment_id, course:courses!enrollments_course_id_fkey(edition_label, series:course_series!courses_series_id_fkey(title))",
      )
      .in("enrollment_id", enrollmentIds),
    adminClient
      .from("profiles")
      .select("profile_id, name, member_no")
      .in("profile_id", userIds),
    orderItemIds.length
      ? adminClient
          .from("order_items")
          .select("order_item_id, order_id, refunded_at")
          .in("order_item_id", orderItemIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const orderIds = [...new Set((itemRes.data ?? []).map((i) => i.order_id))];
  const payRes = orderIds.length
    ? await adminClient
        .from("payments")
        .select("order_id, toss_order_id, status, created_at, refunded_at")
        .in("order_id", orderIds)
    : { data: [] as never[] };

  const labelByEnrollment = new Map(
    (enrRes.data ?? []).map((e) => {
      const c = e.course as {
        edition_label: string;
        series: { title: string } | null;
      } | null;
      return [
        e.enrollment_id,
        c ? `${c.series?.title ?? ""} ${c.edition_label}`.trim() : "강의",
      ] as const;
    }),
  );
  const profById = new Map((profRes.data ?? []).map((p) => [p.profile_id, p]));
  const itemById = new Map(
    (itemRes.data ?? []).map((i) => [i.order_item_id, i] as const),
  );
  const payByOrder = new Map(
    (payRes.data ?? []).map((p) => [p.order_id, p] as const),
  );

  // 수강권별 순번(오래된 것이 1번) — 요청서의 "횟수".
  const seqByExtension = new Map<string, number>();
  const counter = new Map<string, number>();
  for (const r of [...rows].reverse()) {
    const n = (counter.get(r.enrollment_id) ?? 0) + 1;
    counter.set(r.enrollment_id, n);
    seqByExtension.set(r.extension_id, n);
  }

  return rows.map((r) => {
    const item = r.order_item_id ? itemById.get(r.order_item_id) : null;
    const pay = item?.order_id ? payByOrder.get(item.order_id) : null;
    const prof = profById.get(r.user_id);
    return {
      extensionId: r.extension_id,
      enrollmentId: r.enrollment_id,
      memberName: prof?.name ?? null,
      memberNo: prof?.member_no ?? null,
      courseLabel: labelByEnrollment.get(r.enrollment_id) ?? "강의",
      prevExpiresAt: r.prev_expires_at,
      nextExpiresAt: r.next_expires_at,
      daysAdded: r.days_added,
      amountKrw: r.amount_krw,
      paidAt: pay?.created_at ?? r.created_at,
      paymentRef: pay?.toss_order_id ?? null,
      paymentStatus: pay?.status ?? null,
      refundedAt: pay?.refunded_at ?? item?.refunded_at ?? null,
      seq: seqByExtension.get(r.extension_id) ?? 1,
      status: r.status,
      revertReason: r.revert_reason,
      note: r.note,
      needsManual:
        r.status === "reverted" && (r.revert_reason ?? "").includes(MANUAL_MARK),
    };
  });
}

/** 수동 처리 완료 메모 — 만료일 조정 자체는 영상 수강권 화면의 기간 설정이 담당한다. */
export async function markExtensionHandled(
  extensionId: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await adminClient
    .from("enrollment_extensions")
    .update({ note })
    .eq("extension_id", extensionId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
