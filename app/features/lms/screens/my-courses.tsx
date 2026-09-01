// /lecture — 내 강의실(수강현황) (feat-11-004 4c, 구 /me/courses).
// 수강권 목록(기간·배수 사용/잔여·진도율·완강) + 일시정지 신청(정책 범위 서버 검증) + 등록 기기 셀프 초기화.

import { useEffect, useState } from "react";
import {
  CalendarPlusIcon,
  ClapperboardIcon,
  MonitorSmartphoneIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  SparklesIcon,
  StarIcon,
} from "lucide-react";
import { Link, data, redirect, useFetcher, useNavigate } from "react-router";
import { toast } from "sonner";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import adminClient from "~/core/lib/supa-admin-client.server";
import { resetDevice } from "~/features/lms/devices.server";
import { useCart } from "~/features/lms/lib/cart";
import { getWatchBalances } from "~/features/lms/queries.server";
import {
  getCourseExtensionDefaults,
  getReviewRewardPoints,
} from "~/core/lib/app-settings.server";
import { resolveExtensionContexts } from "~/features/lms/extension.server";
import { EXTENSION_DEFAULTS_FALLBACK } from "~/features/lms/lib/extension-policy";
import { getMyPlanReviews } from "~/features/lms/reviews.server";
import {
  REVIEWS_ENABLED,
  REVIEW_REWARD_MIN_CHARS,
} from "~/features/lms/reviews-config";
import { getLessonProgressForUser } from "~/features/lms/watch.server";

import type { Route } from "./+types/my-courses";

export const meta: Route.MetaFunction = () => [
  { title: "내 강의 | 리담변리사학원" },
];

const STATUS_LABEL: Record<string, string> = {
  active: "수강중",
  paused: "일시정지",
  expired: "만료",
  revoked: "종료",
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const { data: enrollments } = await client
    .from("enrollments")
    .select(
      "enrollment_id, course_id, plan_id, starts_at, expires_at, status, multiplier_snapshot, course:courses!enrollments_course_id_fkey(edition_label, series:course_series!courses_series_id_fkey(title))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list = enrollments ?? [];
  const balances = await getWatchBalances(list.map((e) => e.enrollment_id));

  // 진도율 — course 별 published 회차의 구간 union 병합
  const courseIds = [...new Set(list.map((e) => e.course_id))];
  const lessonsByCourse = new Map<string, string[]>();
  if (courseIds.length > 0) {
    const { data: lessons } = await adminClient
      .from("course_lessons")
      .select("lesson_id, course_id")
      .in("course_id", courseIds)
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("sort_order")
      .order("lesson_no");
    for (const l of lessons ?? []) {
      const arr = lessonsByCourse.get(l.course_id) ?? [];
      arr.push(l.lesson_id);
      lessonsByCourse.set(l.course_id, arr);
    }
  }
  const allLessonIds = [...lessonsByCourse.values()].flat();
  const progress = await getLessonProgressForUser(user.id, allLessonIds);

  // 일시정지 정책·사용 이력 + ① 연장 정책
  const planIds = [...new Set(list.map((e) => e.plan_id).filter(Boolean))] as string[];
  const policyByPlan = new Map<
    string,
    {
      pauseAllowed: boolean;
      totalDays: number;
      maxCount: number;
      minDays: number;
      maxDays: number;
      extensionAllowed: boolean;
      extensionPlanIds: string[];
    }
  >();
  if (planIds.length > 0) {
    const { data: policies } = await adminClient
      .from("plan_policies")
      .select(
        "plan_id, pause_allowed, pause_total_days, pause_max_count, pause_min_days, pause_max_days, extension_allowed, extension_plan_ids",
      )
      .in("plan_id", planIds);
    for (const p of policies ?? []) {
      policyByPlan.set(p.plan_id, {
        pauseAllowed: p.pause_allowed,
        totalDays: p.pause_total_days,
        maxCount: p.pause_max_count,
        minDays: p.pause_min_days,
        maxDays: p.pause_max_days,
        // feat-11-010 로 NULL 허용이 됐다 — 기존 "연장 상품" 게이트는 명시 true 일 때만.
        //   기본값 해석이 필요한 새 유료 연장은 별도 경로가 담당한다.
        extensionAllowed: p.extension_allowed === true,
        extensionPlanIds: Array.isArray(p.extension_plan_ids)
          ? (p.extension_plan_ids as string[])
          : [],
      });
    }
  }
  // ① 연장 상품 해석 — extension_plan_ids 중 판매중(on_sale) 상품만 구매 진입점으로.
  const extPlanIds = [
    ...new Set(
      [...policyByPlan.values()].flatMap((p) => p.extensionPlanIds),
    ),
  ];
  const extPlanById = new Map<
    string,
    { code: string; name: string; priceKrw: number }
  >();
  if (extPlanIds.length > 0) {
    const { data: extPlans } = await adminClient
      .from("subscription_plans")
      .select("plan_id, code, name, price_krw, sale_status")
      .in("plan_id", extPlanIds)
      .eq("sale_status", "on_sale");
    for (const p of extPlans ?? []) {
      extPlanById.set(p.plan_id, {
        code: p.code,
        name: p.name,
        priceKrw: p.price_krw,
      });
    }
  }
  // feat-11-010 — 유료 수강기간 연장 제안(요청서_0901 §3).
  //   ★버튼 노출과 서버 재검증이 같은 함수를 쓴다(resolveExtensionContexts).
  const extensionDefaults = await getCourseExtensionDefaults(client).catch(
    () => EXTENSION_DEFAULTS_FALLBACK,
  );
  const extensionCtx = await resolveExtensionContexts({
    enrollments: list.map((e) => ({
      enrollmentId: e.enrollment_id,
      userId: user.id,
      planId: e.plan_id ?? null,
      status: e.status,
      expiresAt: e.expires_at,
    })),
    defaults: extensionDefaults,
  }).catch(() => new Map());

  // 수강 후기 CTA 상태 — 강의(plan)별 내 리뷰(있으면 수정, 없으면 작성 유도).
  const myReviews = await getMyPlanReviews(client, user.id, planIds);
  // 후기 보상 포인트(운영관리 설정값) — 작성 안내 문구용.
  const reviewRewardPoints = await getReviewRewardPoints(client);

  const { data: pauses } = await client
    .from("enrollment_pauses")
    .select("enrollment_id, days")
    .in("enrollment_id", list.map((e) => e.enrollment_id));
  const pauseAgg = new Map<string, { usedDays: number; count: number }>();
  for (const p of pauses ?? []) {
    const agg = pauseAgg.get(p.enrollment_id) ?? { usedDays: 0, count: 0 };
    agg.usedDays += p.days;
    agg.count += 1;
    pauseAgg.set(p.enrollment_id, agg);
  }

  // 등록 기기
  const { data: devices } = await client
    .from("user_devices")
    .select("device_id, kind, device_name, registered_at, last_seen_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("registered_at");

  return {
    courses: list.map((e) => {
      const course = e.course as {
        edition_label: string;
        series: { title: string } | null;
      } | null;
      const lessonIds = lessonsByCourse.get(e.course_id) ?? [];
      let done = 0;
      let ratioSum = 0;
      for (const lid of lessonIds) {
        const p = progress.get(lid);
        if (!p) continue;
        ratioSum += p.progressRatio;
        if (p.completed) done++;
      }
      const bal = balances.get(e.enrollment_id) ?? null;
      const policy = e.plan_id ? (policyByPlan.get(e.plan_id) ?? null) : null;
      const usedPause = pauseAgg.get(e.enrollment_id) ?? { usedDays: 0, count: 0 };
      const myReview = e.plan_id ? (myReviews.get(e.plan_id) ?? null) : null;
      return {
        enrollmentId: e.enrollment_id,
        planId: e.plan_id ?? null,
        review: myReview,
        label: course ? `${course.series?.title ?? ""} ${course.edition_label}`.trim() : "강의",
        firstLessonId: lessonIds[0] ?? null,
        startsAt: e.starts_at,
        expiresAt: e.expires_at,
        status: e.status,
        lessonCount: lessonIds.length,
        completedCount: done,
        progressPct: lessonIds.length > 0 ? Math.round((ratioSum / lessonIds.length) * 100) : 0,
        allowedSeconds: bal?.allowedSeconds ?? null,
        usedSeconds: bal?.usedSeconds ?? 0,
        remainingSeconds: bal?.remainingSeconds ?? null,
        pause: policy?.pauseAllowed
          ? {
              remainingDays: Math.max(0, policy.totalDays - usedPause.usedDays),
              remainingCount: Math.max(0, policy.maxCount - usedPause.count),
              minDays: policy.minDays,
              maxDays: policy.maxDays,
            }
          : null,
        // feat-11-010 — 유료 연장(정책 기반). 가능할 때만 버튼을 준다.
        paidExtension: (() => {
          const ctx = extensionCtx.get(e.enrollment_id);
          if (!ctx?.offer.ok) return null;
          return {
            priceKrw: ctx.offer.policy.priceKrw,
            days: ctx.offer.policy.days,
            remainingCount: ctx.offer.remainingCount,
            expired: ctx.offer.expired,
            graceUntil: ctx.offer.graceUntil,
            nextExpiresAt: ctx.offer.nextExpiresAt,
          };
        })(),
        // ① 연장 상품 진입점 — 정책 허용 + 판매중 연장 상품이 있을 때만.
        extensionProducts:
          policy?.extensionAllowed && e.status !== "revoked"
            ? policy.extensionPlanIds
                .map((pid) => extPlanById.get(pid))
                .filter((x): x is { code: string; name: string; priceKrw: number } => !!x)
            : [],
      };
    }),
    devices: (devices ?? []).map((d) => ({
      deviceId: d.device_id,
      kind: d.kind,
      deviceName: d.device_name,
      registeredAt: d.registered_at,
      lastSeenAt: d.last_seen_at,
    })),
    reviewRewardPoints,
    tossClientKey: process.env.TOSS_CLIENT_KEY ?? null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "pause_request") {
    const enrollmentId = String(fd.get("enrollmentId") ?? "");
    const days = Math.trunc(Number(fd.get("days") ?? 0));
    // 소유·상태 검증
    const { data: enr } = await adminClient
      .from("enrollments")
      .select("enrollment_id, user_id, status, expires_at, plan_id")
      .eq("enrollment_id", enrollmentId)
      .maybeSingle();
    if (!enr || enr.user_id !== user.id) return data({ error: "수강권을 찾을 수 없습니다." }, { status: 404 });
    if (enr.status !== "active") return data({ error: "수강중 상태에서만 신청할 수 있습니다." }, { status: 400 });
    if (!enr.plan_id) return data({ error: "이 수강권은 일시정지 대상이 아닙니다." }, { status: 400 });
    // 정책 검증 (서버 권위)
    const { data: policy } = await adminClient
      .from("plan_policies")
      .select("pause_allowed, pause_total_days, pause_max_count, pause_min_days, pause_max_days")
      .eq("plan_id", enr.plan_id)
      .maybeSingle();
    if (!policy?.pause_allowed) return data({ error: "이 상품은 일시정지를 지원하지 않습니다." }, { status: 400 });
    if (days < policy.pause_min_days || days > policy.pause_max_days) {
      return data(
        { error: `정지 기간은 ${policy.pause_min_days}~${policy.pause_max_days}일 사이여야 합니다.` },
        { status: 400 },
      );
    }
    const { data: pauses } = await adminClient
      .from("enrollment_pauses")
      .select("days")
      .eq("enrollment_id", enrollmentId);
    const usedDays = (pauses ?? []).reduce((s, p) => s + p.days, 0);
    const usedCount = (pauses ?? []).length;
    if (usedCount >= policy.pause_max_count) {
      return data({ error: `일시정지 가능 횟수(${policy.pause_max_count}회)를 모두 사용했습니다.` }, { status: 400 });
    }
    if (usedDays + days > policy.pause_total_days) {
      return data(
        { error: `남은 정지 가능 일수는 ${Math.max(0, policy.pause_total_days - usedDays)}일입니다.` },
        { status: 400 },
      );
    }
    // 적용 — expires_at += days, status=paused
    const startsOn = new Date();
    const endsOn = new Date(Date.now() + days * 86400_000);
    const { error: pErr } = await adminClient.from("enrollment_pauses").insert({
      enrollment_id: enrollmentId,
      requested_by: user.id,
      starts_on: startsOn.toISOString().slice(0, 10),
      ends_on: endsOn.toISOString().slice(0, 10),
      days,
    });
    if (pErr) return data({ error: pErr.message }, { status: 400 });
    const nextExpires = new Date(Date.parse(enr.expires_at) + days * 86400_000).toISOString();
    const { error } = await adminClient
      .from("enrollments")
      .update({ status: "paused", expires_at: nextExpires })
      .eq("enrollment_id", enrollmentId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const, paused: days });
  }

  if (intent === "device_reset") {
    const deviceId = String(fd.get("deviceId") ?? "");
    if (!deviceId) return data({ error: "잘못된 요청" }, { status: 400 });
    const result = await resetDevice({
      deviceId,
      actorId: user.id,
      actorIsStaff: false, // 셀프 — 월 1회 제한 적용
      reason: "본인 기기 변경",
    });
    if (!result.ok) return data({ error: result.error }, { status: 400 });
    return data({ ok: true as const, deviceReset: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

export default function MyCourses({ loaderData }: Route.ComponentProps) {
  const { courses, devices, reviewRewardPoints, tossClientKey } = loaderData;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8 md:px-6 md:py-10">
      <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <ClapperboardIcon className="size-5" /> 내 강의
      </h1>

      {courses.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            보유한 강의 수강권이 없습니다.
          </CardContent>
        </Card>
      ) : (
        courses.map((c) => (
          <CourseCard
            key={c.enrollmentId}
            course={c}
            rewardPoints={reviewRewardPoints}
            tossClientKey={tossClientKey}
          />
        ))
      )}

      <Card>
        <CardHeader className="pb-2">
          <h2 className="flex items-center gap-1.5 text-[15px] font-bold">
            <MonitorSmartphoneIcon className="size-4" /> 등록 기기
          </h2>
          <p className="text-muted-foreground text-[12px]">
            기기 변경(초기화)은 월 1회 가능합니다. 추가 변경이 필요하면 고객센터로 문의해 주세요.
          </p>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <p className="text-muted-foreground text-[13px]">
              등록된 기기가 없습니다. 첫 재생 시 자동 등록됩니다.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {devices.map((d) => (
                <DeviceRow key={d.deviceId} device={d} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CourseCard({
  course,
  rewardPoints,
  tossClientKey,
}: {
  rewardPoints: number;
  course: {
    enrollmentId: string;
    planId: string | null;
    review: {
      rating: number;
      body: string;
      isPublic: boolean;
      rewarded: boolean;
    } | null;
    label: string;
    firstLessonId: string | null;
    startsAt: string;
    expiresAt: string;
    status: string;
    lessonCount: number;
    completedCount: number;
    progressPct: number;
    allowedSeconds: number | null;
    usedSeconds: number;
    remainingSeconds: number | null;
    pause: {
      remainingDays: number;
      remainingCount: number;
      minDays: number;
      maxDays: number;
    } | null;
    extensionProducts: Array<{ code: string; name: string; priceKrw: number }>;
    paidExtension: {
      priceKrw: number;
      days: number;
      remainingCount: number | null;
      expired: boolean;
      graceUntil: string;
      nextExpiresAt: string;
    } | null;
  };
  tossClientKey: string | null;
}) {
  const navigate = useNavigate();
  const { addPlan } = useCart();
  const fetcher = useFetcher<{ ok?: boolean; error?: string; paused?: number }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.paused) {
      toast.success(`일시정지를 적용했습니다 (+${fetcher.data.paused}일 연장).`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  // feat-11-010 — [수강연장] → 서버가 정책 재검증 후 주문 생성 → 토스 결제창.
  //   ★금액·가능 여부는 서버가 정한다. 여기서 계산하지 않는다.
  const [extPending, setExtPending] = useState(false);
  const startPaidExtension = async () => {
    if (!course.paidExtension || extPending) return;
    if (!tossClientKey) {
      toast.error("결제 설정이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setExtPending(true);
    try {
      const fd = new FormData();
      fd.set("enrollmentId", course.enrollmentId);
      const res = await fetch("/api/lms/extension-order", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        orderId?: string;
        amount?: number;
        orderName?: string;
        error?: string;
      };
      if (!json.ok || !json.orderId) {
        toast.error(json.error ?? "연장 결제를 시작하지 못했습니다.");
        return;
      }
      const { loadTossPayments } = await import(
        "@tosspayments/tosspayments-sdk"
      );
      const tossPayments = await loadTossPayments(tossClientKey);
      const payment = tossPayments.payment({ customerKey: course.enrollmentId });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: json.amount ?? 0 },
        orderId: json.orderId,
        orderName: json.orderName ?? "수강기간 연장",
        successUrl: `${window.location.origin}/api/payments/toss/confirm`,
        failUrl: `${window.location.origin}/lecture?extFailed=1`,
      });
    } catch (e) {
      // 결제창 취소는 조용히 — 사용자가 직접 닫은 것이다.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/취소|cancel/i.test(msg)) toast.error(`결제 오류: ${msg}`);
    } finally {
      setExtPending(false);
    }
  };

  const requestPause = () => {
    if (!course.pause) return;
    const days = Math.trunc(
      Number(
        prompt(
          `일시정지 일수 (${course.pause.minDays}~${course.pause.maxDays}일, 남은 ${course.pause.remainingDays}일·${course.pause.remainingCount}회):`,
        ) ?? 0,
      ),
    );
    if (!days || days <= 0) return;
    const fd = new FormData();
    fd.set("intent", "pause_request");
    fd.set("enrollmentId", course.enrollmentId);
    fd.set("days", String(days));
    fetcher.submit(fd, { method: "post" });
  };
  const extendTo = (code: string) => {
    addPlan(code);
    toast.success("연장 상품을 장바구니에 담았습니다.");
    navigate("/lecture/cart");
  };
  const completed =
    course.lessonCount > 0 && course.completedCount >= course.lessonCount;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-bold">{course.label}</h2>
          <Badge variant={course.status === "active" ? "default" : "secondary"}>
            {STATUS_LABEL[course.status] ?? course.status}
          </Badge>
          {completed ? <Badge variant="outline">완강</Badge> : null}
        </div>
        <p className="text-muted-foreground text-[12px] tabular-nums">
          {course.startsAt.slice(0, 10)} ~ {course.expiresAt.slice(0, 10)}
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div>
          <div className="mb-1 flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">
              진도 {course.completedCount}/{course.lessonCount}강
            </span>
            <span className="font-semibold tabular-nums">{course.progressPct}%</span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${course.progressPct}%` }}
            />
          </div>
        </div>
        {course.status === "active" ? (
          <Button asChild size="sm" className="w-full">
            <Link to={`/lecture/room/${course.enrollmentId}`}>
              <PlayCircleIcon className="size-4" />
              강의실 입장
            </Link>
          </Button>
        ) : null}
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          {course.pause && course.status === "active" ? (
            <button
              type="button"
              onClick={requestPause}
              disabled={fetcher.state !== "idle" || course.pause.remainingCount <= 0 || course.pause.remainingDays <= 0}
              className="border-border hover:bg-muted/50 ml-auto inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] font-medium disabled:opacity-40"
            >
              <PauseCircleIcon className="size-3.5" /> 일시정지 신청
            </button>
          ) : null}
        </div>
        {course.paidExtension ? (
          <div className="border-border/60 flex flex-wrap items-center gap-2 border-t pt-2.5">
            <span className="text-muted-foreground inline-flex items-center gap-1 text-[12px]">
              <CalendarPlusIcon className="size-3.5" /> 수강기간 연장
            </span>
            <button
              type="button"
              disabled={extPending}
              onClick={startPaidExtension}
              className="border-border hover:bg-muted/50 inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium disabled:opacity-40"
            >
              {extPending ? "결제 준비 중…" : "수강연장"}
              <span className="tabular-nums">
                {course.paidExtension.days}일 · ₩
                {course.paidExtension.priceKrw.toLocaleString("ko-KR")}
              </span>
            </button>
            <span className="text-muted-foreground text-[11px]">
              {course.paidExtension.expired
                ? `종료 후 연장 — 결제 즉시 열리고 내일부터 ${course.paidExtension.days}일`
                : `연장 후 종료일 ${course.paidExtension.nextExpiresAt.slice(0, 10)}`}
              {course.paidExtension.remainingCount !== null
                ? ` · 남은 횟수 ${course.paidExtension.remainingCount}회`
                : ""}
            </span>
          </div>
        ) : null}
        {course.extensionProducts.length > 0 ? (
          <div className="border-border/60 flex flex-wrap items-center gap-2 border-t pt-2.5">
            <span className="text-muted-foreground inline-flex items-center gap-1 text-[12px]">
              <CalendarPlusIcon className="size-3.5" /> 수강 연장
            </span>
            {course.extensionProducts.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => extendTo(p.code)}
                className="border-border hover:bg-muted/50 inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium"
              >
                {p.name}
                <span className="tabular-nums">
                  ₩{p.priceKrw.toLocaleString("ko-KR")}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {REVIEWS_ENABLED && course.planId ? (
          <ReviewCTA
            planId={course.planId}
            review={course.review}
            completed={completed}
            rewardPoints={rewardPoints}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`별점 ${value}점`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          className={cn(
            "size-3.5",
            n <= Math.round(value)
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

// 수강 후기 작성/수정 — /api/lms/review 로 제출. 일정 분량 이상이면 포인트 적립(대상당 1회).
function ReviewCTA({
  planId,
  review,
  completed,
  rewardPoints,
}: {
  planId: string;
  review: { rating: number; body: string; isPublic: boolean; rewarded: boolean } | null;
  completed: boolean;
  rewardPoints: number;
}) {
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    awardedPoints?: number;
  }>();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(review?.rating ?? 5);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) {
      if (fetcher.data.awardedPoints) {
        toast.success(
          `후기 등록 완료 — ${fetcher.data.awardedPoints.toLocaleString("ko-KR")}P 적립!`,
        );
      } else {
        toast.success("수강 후기를 등록했습니다.");
      }
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  // 아직 보상받지 않은 경우에만 적립 안내 노출(재작성 시 오해 방지).
  const rewardHint = !review?.rewarded;

  if (!open) {
    return (
      <div className="border-border/60 border-t pt-2.5">
        {review ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">내 후기</span>
            <Stars value={review.rating} />
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-link hover:underline"
            >
              수정
            </button>
          </div>
        ) : completed ? (
          // 완강한 사람만 작성 가능 — 유도 배너.
          <div className="bg-amber-50 dark:bg-amber-500/10 -mx-1 flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
              <SparklesIcon className="size-4 text-amber-500" />
              완강을 축하해요! 후기를 남겨 주세요
            </span>
            <Button
              type="button"
              size="sm"
              className="h-7 text-[12px]"
              onClick={() => setOpen(true)}
            >
              수강 후기 작성
            </Button>
            {rewardHint ? (
              <span className="text-muted-foreground text-[11px]">
                {REVIEW_REWARD_MIN_CHARS}자 이상 작성 시{" "}
                <b className="text-amber-600">
                  {rewardPoints.toLocaleString("ko-KR")}P
                </b>{" "}
                적립
              </span>
            ) : null}
          </div>
        ) : (
          // 미완강 — 완강 후 작성 가능 안내(서버에서도 완강 게이트).
          <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-[12px]">
            <StarIcon className="text-muted-foreground/50 size-3.5" />
            완강 후 수강 후기를 작성할 수 있어요
            {rewardHint ? (
              <span className="text-[11px]">
                · {REVIEW_REWARD_MIN_CHARS}자 이상 시{" "}
                {rewardPoints.toLocaleString("ko-KR")}P 적립
              </span>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action="/api/lms/review"
      className="border-border/60 space-y-2.5 border-t pt-3"
    >
      <input type="hidden" name="intent" value="submit" />
      <input type="hidden" name="targetType" value="plan" />
      <input type="hidden" name="targetId" value={planId} />
      <input type="hidden" name="rating" value={rating} />
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">별점</span>
        <span className="inline-flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className="p-0.5"
              aria-label={`${n}점`}
            >
              <StarIcon
                className={cn(
                  "size-5",
                  n <= rating
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </span>
      </div>
      <textarea
        name="body"
        rows={3}
        maxLength={2000}
        defaultValue={review?.body ?? ""}
        placeholder={`강의에 대한 솔직한 후기를 남겨 주세요. (${REVIEW_REWARD_MIN_CHARS}자 이상 작성 시 ${rewardPoints.toLocaleString("ko-KR")}P 적립)`}
        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
      />
      {/* ★checkbox(value=1) 가 hidden(value=0) 보다 먼저 와야 체크 시 fd.get 첫값="1"(공개). */}
      <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          name="isPublic"
          value="1"
          defaultChecked={review?.isPublic ?? true}
          className="size-3.5"
        />
        공개(다른 수험생에게 보임)
      </label>
      <input type="hidden" name="isPublic" value="0" />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          {review ? "후기 수정" : "후기 등록"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground text-xs hover:underline"
        >
          취소
        </button>
      </div>
    </fetcher.Form>
  );
}

const DEVICE_KIND_LABEL: Record<string, string> = {
  pc: "PC",
  mobile: "모바일",
  tablet: "태블릿",
};

function DeviceRow({
  device,
}: {
  device: {
    deviceId: string;
    kind: string;
    deviceName: string | null;
    registeredAt: string;
    lastSeenAt: string;
  };
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string; deviceReset?: boolean }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.deviceReset) toast.success("기기를 초기화했습니다. 새 기기는 재생 시 등록됩니다.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  const reset = () => {
    if (!confirm("이 기기를 등록 해제할까요? 기기 변경은 월 1회 가능합니다.")) return;
    const fd = new FormData();
    fd.set("intent", "device_reset");
    fd.set("deviceId", device.deviceId);
    fetcher.submit(fd, { method: "post" });
  };
  return (
    <li className="border-border/60 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]">
      <span className="font-semibold">{DEVICE_KIND_LABEL[device.kind] ?? device.kind}</span>
      <span className="text-muted-foreground">{device.deviceName ?? "이름 없음"}</span>
      <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
        마지막 사용 {device.lastSeenAt.slice(0, 10)}
      </span>
      <Button type="button" size="sm" variant="outline" className="h-7 text-[12px]"
        onClick={reset} disabled={fetcher.state !== "idle"}>
        초기화
      </Button>
    </li>
  );
}
