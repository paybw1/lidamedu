// feat-7-046 회원 CRM — 회원정보/회원이력 탭 데이터.
// staff 조회이므로 cross-user private 데이터는 adminClient(RLS 우회) 사용.
// (profiles RLS 는 staff 에게도 본인만 허용 → 타 회원 조회는 adminClient 필수.)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { getMyRefundRequestMap } from "~/features/orders/refund-requests.server";
import { getLessonProgressForUser } from "~/features/lms/watch.server";

// ── 회원정보 (프로필 기재사항 + 로그인 계정) ──────────────────────────────
export interface MemberProfile {
  profileId: string;
  name: string;
  nickname: string | null;
  memberNo: number | null;
  phoneE164: string | null;
  address: string | null;
  avatarUrl: string | null;
  role: Database["public"]["Enums"]["user_role"];
  marketingConsent: boolean;
  notifyChannels: string[];
  nextExamYear: number | null;
  nextExamRound: Database["public"]["Enums"]["exam_round"] | null;
  membershipTestGrade: string | null;
  createdAt: string;
  onboardedAt: string | null;
  accessApprovedAt: string | null;
  trialEndsAt: string | null;
  serviceDataConsentAt: string | null;
  analyticsConsentAt: string | null;
  // 로그인 계정(auth)
  email: string | null;
  emailConfirmedAt: string | null;
  providers: string[]; // ['kakao'] 등 연결된 로그인 수단
  lastSignInAt: string | null;
}

export async function getMemberProfile(
  profileId: string,
): Promise<MemberProfile | null> {
  const { data: p } = await adminClient
    .from("profiles")
    .select(
      "profile_id, name, nickname, member_no, phone_e164, address, avatar_url, role, marketing_consent, notify_channels, next_exam_year, next_exam_round, membership_test_grade, created_at, onboarded_at, access_approved_at, trial_ends_at, service_data_consent_at, analytics_consent_at",
    )
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!p) return null;

  // 이메일·로그인 수단·최근 로그인 — auth.users 에서.
  const { data: authRes } = await adminClient.auth.admin.getUserById(profileId);
  const authUser = authRes?.user ?? null;
  const providers = authUser
    ? Array.from(
        new Set(
          (authUser.identities ?? [])
            .map((i) => i.provider)
            .filter((v): v is string => !!v),
        ),
      )
    : [];

  return {
    profileId: p.profile_id,
    name: p.name,
    nickname: p.nickname,
    memberNo: p.member_no,
    phoneE164: p.phone_e164,
    address: p.address,
    avatarUrl: p.avatar_url,
    role: p.role,
    marketingConsent: p.marketing_consent,
    notifyChannels: p.notify_channels ?? [],
    nextExamYear: p.next_exam_year,
    nextExamRound: p.next_exam_round,
    membershipTestGrade: p.membership_test_grade,
    createdAt: p.created_at,
    onboardedAt: p.onboarded_at,
    accessApprovedAt: p.access_approved_at,
    trialEndsAt: p.trial_ends_at,
    serviceDataConsentAt: p.service_data_consent_at,
    analyticsConsentAt: p.analytics_consent_at,
    email: authUser?.email ?? null,
    emailConfirmedAt: authUser?.email_confirmed_at ?? null,
    providers,
    lastSignInAt: authUser?.last_sign_in_at ?? null,
  };
}

// ── 회원이력 · 접속 기록 ──────────────────────────────────────────────────
export interface AccessLogRow {
  createdAt: string;
  kind: string;
  client: string | null;
  browser: string | null;
  device: string | null;
  ip: string | null;
}

export async function listUserAccessLogs(
  profileId: string,
  limit = 40,
): Promise<AccessLogRow[]> {
  const { data } = await adminClient
    .from("user_access_logs")
    .select("created_at, kind, client, browser, device, ip")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    createdAt: r.created_at,
    kind: r.kind,
    client: r.client,
    browser: r.browser,
    device: r.device,
    ip: r.ip,
  }));
}

// ── 회원이력 · 다운로드(도서 PDF) ─────────────────────────────────────────
export interface DownloadRow {
  at: string;
  label: string;
}

export async function listUserBookDownloads(
  profileId: string,
  limit = 40,
): Promise<DownloadRow[]> {
  const { data } = await adminClient
    .from("book_downloads")
    .select("created_at, books(title)")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    at: r.created_at,
    label:
      (r.books as { title: string } | null)?.title ?? "(도서)",
  }));
}

// ── 회원정보 안전 편집 저장 ───────────────────────────────────────────────
export interface UpdateMemberProfileInput {
  name: string;
  nickname: string | null;
  phoneE164: string | null;
  address: string | null;
  marketingConsent: boolean;
}

export async function updateMemberProfile(
  _client: SupabaseClient<Database>,
  profileId: string,
  input: UpdateMemberProfileInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient
    .from("profiles")
    .update({
      name: input.name,
      nickname: input.nickname,
      phone_e164: input.phoneE164,
      address: input.address,
      marketing_consent: input.marketingConsent,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── 주문 (강의 plan + 도서 book 통합, feat-11-004) ─────────────────────────
// my-orders.tsx 로더와 동일 형상 — 단, adminClient 로 대상 회원 스코프.
export interface MemberOrderItem {
  orderItemId: string;
  label: string;
  itemType: string;
  quantity: number;
  unitPriceKrw: number;
  refundedAt: string | null;
  shipment: {
    status: string;
    courier: string | null;
    trackingNo: string | null;
  } | null;
  refundStatus: string | null;
}
export interface MemberOrder {
  orderId: string;
  orderNo: string;
  status: string;
  totalKrw: number;
  paymentMethod: string | null;
  createdAt: string;
  items: MemberOrderItem[];
}

export async function listMemberOrders(
  profileId: string,
): Promise<MemberOrder[]> {
  const { data: orders } = await adminClient
    .from("orders")
    .select("order_id, status, total_krw, payment_method, created_at")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(100);
  const orderIds = (orders ?? []).map((o) => o.order_id);
  if (orderIds.length === 0) return [];

  const itemsByOrder = new Map<string, MemberOrderItem[]>();
  const { data: items } = await adminClient
    .from("order_items")
    .select(
      "order_item_id, order_id, item_type, quantity, unit_price_krw, refunded_at, plan:subscription_plans!order_items_plan_id_fkey(name), book:books!order_items_book_fk(title), shipment:shipments!shipments_order_item_id_fkey(status, courier, tracking_no)",
    )
    .in("order_id", orderIds);
  for (const it of items ?? []) {
    const plan = it.plan as { name: string } | null;
    const book = it.book as { title: string } | null;
    const shipmentRaw = it.shipment as
      | { status: string; courier: string | null; tracking_no: string | null }
      | Array<{
          status: string;
          courier: string | null;
          tracking_no: string | null;
        }>
      | null;
    const shipment = Array.isArray(shipmentRaw)
      ? (shipmentRaw[0] ?? null)
      : shipmentRaw;
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push({
      orderItemId: it.order_item_id,
      label: plan?.name ?? book?.title ?? "(항목)",
      itemType: it.item_type,
      quantity: it.quantity,
      unitPriceKrw: it.unit_price_krw,
      refundedAt: it.refunded_at,
      shipment: shipment
        ? {
            status: shipment.status,
            courier: shipment.courier,
            trackingNo: shipment.tracking_no,
          }
        : null,
      refundStatus: null,
    });
    itemsByOrder.set(it.order_id, arr);
  }

  const allItemIds = [...itemsByOrder.values()]
    .flat()
    .map((it) => it.orderItemId);
  const refundMap = await getMyRefundRequestMap(
    adminClient,
    profileId,
    allItemIds,
  );

  return (orders ?? []).map((o) => ({
    orderId: o.order_id,
    orderNo: o.order_id.slice(0, 8).toUpperCase(),
    status: o.status,
    totalKrw: o.total_krw,
    paymentMethod: o.payment_method,
    createdAt: o.created_at,
    items: (itemsByOrder.get(o.order_id) ?? []).map((it) => ({
      ...it,
      refundStatus: refundMap.get(it.orderItemId) ?? null,
    })),
  }));
}

// ── 쿠폰 (구독 System A: user_coupons / 강의 System B: coupon_grants·redemptions) ──
function fmtDiscount(type: string, value: number): string {
  return type === "percent"
    ? `${value}%`
    : `₩${value.toLocaleString("ko-KR")}`;
}

export interface MemberCoupons {
  subscription: Array<{
    id: string;
    name: string;
    code: string | null;
    valueLabel: string;
    issuedAt: string;
    expiresAt: string | null;
    usedAt: string | null;
  }>;
  lectureGrants: Array<{
    id: string;
    name: string;
    code: string;
    valueLabel: string;
    grantedAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
  }>;
  lectureRedemptions: Array<{
    name: string;
    code: string;
    discountKrw: number;
    redeemedAt: string;
  }>;
}

export async function listMemberCoupons(
  profileId: string,
): Promise<MemberCoupons> {
  const [subRes, grantRes, redRes] = await Promise.all([
    adminClient
      .from("user_coupons")
      .select(
        "user_coupon_id, issued_at, expires_at, used_at, discount:discounts!user_coupons_discount_id_fkey(name, code, kind, value)",
      )
      .eq("user_id", profileId)
      .order("issued_at", { ascending: false }),
    adminClient
      .from("coupon_grants")
      .select(
        "grant_id, granted_at, expires_at, revoked_at, coupons(name, code, discount_type, discount_value)",
      )
      .eq("user_id", profileId)
      .order("granted_at", { ascending: false }),
    adminClient
      .from("coupon_redemptions")
      .select("redeemed_at, discount_krw, coupons(name, code)")
      .eq("user_id", profileId)
      .order("redeemed_at", { ascending: false }),
  ]);

  const subscription = (subRes.data ?? []).map((c) => {
    const d = c.discount as {
      name: string;
      code: string | null;
      kind: string;
      value: number;
    } | null;
    return {
      id: c.user_coupon_id,
      name: d?.name ?? "쿠폰",
      code: d?.code ?? null,
      valueLabel: d ? fmtDiscount(d.kind, d.value) : "",
      issuedAt: c.issued_at,
      expiresAt: c.expires_at,
      usedAt: c.used_at,
    };
  });

  const lectureGrants = (grantRes.data ?? []).map((g) => {
    const c = g.coupons as {
      name: string;
      code: string;
      discount_type: string;
      discount_value: number;
    } | null;
    return {
      id: g.grant_id,
      name: c?.name ?? "쿠폰",
      code: c?.code ?? "",
      valueLabel: c ? fmtDiscount(c.discount_type, c.discount_value) : "",
      grantedAt: g.granted_at,
      expiresAt: g.expires_at,
      revokedAt: g.revoked_at,
    };
  });

  const lectureRedemptions = (redRes.data ?? []).map((r) => {
    const c = r.coupons as { name: string; code: string } | null;
    return {
      name: c?.name ?? "쿠폰",
      code: c?.code ?? "",
      discountKrw: r.discount_krw,
      redeemedAt: r.redeemed_at,
    };
  });

  return { subscription, lectureGrants, lectureRedemptions };
}

// ── 수강정보 (수강 과정 + 회차별 진도 + 개별완료처리) ─────────────────────
export interface MemberEnrollmentLesson {
  lessonId: string;
  lessonNo: number;
  title: string;
  watchedSeconds: number;
  durationSeconds: number;
  progressRatio: number;
  completed: boolean; // 시청 파생 완강 OR 수동 완료
  manualComplete: boolean; // lesson_completions override 존재
}
export interface MemberEnrollmentCourse {
  enrollmentId: string;
  courseId: string;
  courseLabel: string;
  status: string;
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lessons: MemberEnrollmentLesson[];
  completedCount: number;
  totalCount: number;
  progressPct: number;
}

export async function getMemberEnrollments(
  profileId: string,
): Promise<MemberEnrollmentCourse[]> {
  const { data: enrolls } = await adminClient
    .from("enrollments")
    .select(
      "enrollment_id, course_id, status, starts_at, expires_at, revoked_at, created_at",
    )
    .eq("user_id", profileId)
    .order("created_at", { ascending: false });
  const rows = enrolls ?? [];
  if (rows.length === 0) return [];

  // 강의당 대표 enrollment 1개(비취소 우선, 최신 먼저 순회).
  const byCourse = new Map<string, (typeof rows)[number]>();
  for (const e of rows) {
    const prev = byCourse.get(e.course_id);
    if (!prev) {
      byCourse.set(e.course_id, e);
    } else if (prev.revoked_at && !e.revoked_at) {
      byCourse.set(e.course_id, e);
    }
  }
  const courseIds = [...byCourse.keys()];

  const { data: courses } = await adminClient
    .from("courses")
    .select(
      "course_id, edition_label, series:course_series!courses_series_id_fkey(title)",
    )
    .in("course_id", courseIds);
  const courseLabel = new Map<string, string>();
  for (const c of courses ?? []) {
    const title = (c.series as { title: string } | null)?.title ?? "";
    courseLabel.set(
      c.course_id,
      `${title} ${c.edition_label}`.trim() || c.course_id,
    );
  }

  const { data: lessons } = await adminClient
    .from("course_lessons")
    .select("lesson_id, course_id, lesson_no, title")
    .in("course_id", courseIds)
    .is("deleted_at", null)
    .order("sort_order")
    .order("lesson_no");
  const lessonRows = lessons ?? [];
  const lessonIds = lessonRows.map((l) => l.lesson_id);

  const progress = lessonIds.length
    ? await getLessonProgressForUser(profileId, lessonIds)
    : new Map();

  // 어느 회차가 수동 완료인지(배지·토글 표시용).
  const manual = new Set<string>();
  for (let i = 0; i < lessonIds.length; i += 150) {
    const { data: mc } = await adminClient
      .from("lesson_completions")
      .select("lesson_id")
      .eq("user_id", profileId)
      .in("lesson_id", lessonIds.slice(i, i + 150));
    for (const r of mc ?? []) manual.add(r.lesson_id);
  }

  const lessonsByCourse = new Map<string, MemberEnrollmentLesson[]>();
  for (const l of lessonRows) {
    const p = progress.get(l.lesson_id);
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push({
      lessonId: l.lesson_id,
      lessonNo: l.lesson_no,
      title: l.title,
      watchedSeconds: p?.watchedSeconds ?? 0,
      durationSeconds: p?.durationSeconds ?? 0,
      progressRatio: p?.progressRatio ?? 0,
      completed: p?.completed ?? manual.has(l.lesson_id),
      manualComplete: manual.has(l.lesson_id),
    });
    lessonsByCourse.set(l.course_id, arr);
  }

  const out: MemberEnrollmentCourse[] = [];
  for (const cid of courseIds) {
    const e = byCourse.get(cid);
    if (!e) continue;
    const ls = lessonsByCourse.get(cid) ?? [];
    const completedCount = ls.filter((x) => x.completed).length;
    out.push({
      enrollmentId: e.enrollment_id,
      courseId: cid,
      courseLabel: courseLabel.get(cid) ?? cid,
      status: e.status,
      startsAt: e.starts_at,
      expiresAt: e.expires_at,
      revokedAt: e.revoked_at,
      lessons: ls,
      completedCount,
      totalCount: ls.length,
      progressPct: ls.length
        ? Math.round((completedCount / ls.length) * 100)
        : 0,
    });
  }
  return out;
}

export async function markLessonComplete(input: {
  userId: string;
  lessonId: string;
  completedBy: string;
  note?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient.from("lesson_completions").upsert(
    {
      lesson_id: input.lessonId,
      user_id: input.userId,
      completed_by: input.completedBy,
      completed_at: new Date().toISOString(),
      note: input.note ?? null,
    },
    { onConflict: "lesson_id,user_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unmarkLessonComplete(input: {
  userId: string;
  lessonId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient
    .from("lesson_completions")
    .delete()
    .eq("user_id", input.userId)
    .eq("lesson_id", input.lessonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
