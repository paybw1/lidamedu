// feat-11-002 — 영상 수강권: 수동 지급(이관·이벤트·직원용)·목록·연장·회수. manager+.
// 쓰기는 전부 adminClient(RLS 에 쓰기 정책 없음 — 서버 권위) + enrollment_admin_logs 감사.

import { useEffect, useState } from "react";
import { TicketIcon } from "lucide-react";
import { Form, data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import {
  COURSE_EXT_DAYS_KEY,
  COURSE_EXT_ENABLED_KEY,
  COURSE_EXT_MAX_COUNT_KEY,
  COURSE_EXT_PRICE_KEY,
  getCourseExtensionDefaults,
  setAppSetting,
} from "~/core/lib/app-settings.server";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getCourseTotalDuration,
  getWatchBalances,
  listEnrollments,
  logEnrollmentAdminAction,
  type EnrollmentRow,
  type WatchBalance,
} from "~/features/lms/queries.server";
import { EXTENSION_DEFAULTS_FALLBACK } from "~/features/lms/lib/extension-policy";
import { insertLedgerAdjustment, resetWatchUsage } from "~/features/lms/watch.server";
import { getPlanPolicies } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/admin-lms-enrollments";

export const meta: Route.MetaFunction = () => [
  { title: "영상 수강권 | 리담변리사학원" },
];

async function requireManager(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager")) throw data("Forbidden", { status: 403 });
  if (!(await hasDutyAccess("lms_cs", user.id, role))) {
    throw data("Forbidden — 관리자 관리에서 접근 권한을 배정받아야 합니다.", { status: 403 });
  }
  return { client, user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { role } = await requireManager(request);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const [rowsRaw, coursesRes, plansRes] = await Promise.all([
    listEnrollments({ query: query || undefined }),
    adminClient
      .from("courses")
      .select("course_id, edition_label, status, series:course_series!courses_series_id_fkey(title)")
      .is("deleted_at", null)
      .order("edition_year", { ascending: false }),
    adminClient
      .from("subscription_plans")
      .select("plan_id, name, product_kind")
      .in("product_kind", ["course", "tpass"])
      .order("display_order"),
  ]);
  const balances = await getWatchBalances(rowsRaw.map((r) => r.enrollmentId));
  // ② 연장 정책 연동 — 각 수강권 플랜의 학생 셀프연장 허용 여부(advisory).
  const planIds = [...new Set(rowsRaw.map((r) => r.planId).filter((x): x is string => !!x))];
  // 회차 차단 UI — 표시된 수강권들의 강의 회차 목록(courseId 별).
  const courseIds = [...new Set(rowsRaw.map((r) => r.courseId))];
  const [policies, lessonRes] = await Promise.all([
    getPlanPolicies(planIds),
    courseIds.length
      ? adminClient
          .from("course_lessons")
          .select("lesson_id, course_id, lesson_no, title")
          .in("course_id", courseIds)
          .is("deleted_at", null)
          .order("sort_order")
          .order("lesson_no")
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const lessonsByCourse = new Map<
    string,
    Array<{ lessonId: string; lessonNo: number; title: string }>
  >();
  for (const l of lessonRes.data ?? []) {
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push({ lessonId: l.lesson_id, lessonNo: l.lesson_no, title: l.title });
    lessonsByCourse.set(l.course_id, arr);
  }
  const extensionDefaultsForRows = await getCourseExtensionDefaults(
    adminClient,
  ).catch(() => EXTENSION_DEFAULTS_FALLBACK);
  const rows = rowsRaw.map((r) => ({
    ...r,
    balance: balances.get(r.enrollmentId) ?? null,
    // ★기본값 해석까지 거쳐야 실제 동작과 같은 값이 나온다(강의별 값이 NULL 이면 기본값).
    extensionAllowed: r.planId
      ? (policies[r.planId]?.extensionAllowed ?? extensionDefaultsForRows.enabled)
      : extensionDefaultsForRows.enabled,
    lessons: lessonsByCourse.get(r.courseId) ?? [],
  }));
  return {
    rows,
    extensionDefaults: extensionDefaultsForRows,
    query,
    role,
    courses: (coursesRes.data ?? []).map((c) => ({
      courseId: c.course_id,
      label: `${(c.series as { title: string } | null)?.title ?? ""} ${c.edition_label}`.trim(),
      status: c.status,
    })),
    plans: (plansRes.data ?? []).map((p) => ({
      planId: p.plan_id,
      name: p.name,
      kind: p.product_kind,
    })),
  };
}

const grantSchema = z.object({
  memberNo: z.coerce.number().int().min(1),
  courseId: z.string().uuid(),
  planId: z.string().uuid().nullable(),
  durationDays: z.coerce.number().int().min(1).max(3650),
  source: z.enum(["manual", "migration", "event"]),
  note: z.string().trim().min(1).max(300),
});
const extendSchema = z.object({
  enrollmentId: z.string().uuid(),
  days: z.coerce.number().int().min(1).max(365),
});
const setDatesSchema = z.object({
  enrollmentId: z.string().uuid(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const revokeSchema = z.object({
  enrollmentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
});

export async function action({ request }: Route.ActionArgs) {
  const { user } = await requireManager(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

  // feat-11-010 — 유료 연장 기본값 저장(운영 전역). 강의별 값이 비어 있을 때 적용된다.
  if (intent === "ext_defaults") {
    const num = (k: string, max: number): number => {
      const n = Number(String(fd.get(k) ?? ""));
      return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : 0;
    };
    const pairs: Array<[string, string | number | boolean]> = [
      [COURSE_EXT_ENABLED_KEY, fd.get("extEnabled") === "1"],
      [COURSE_EXT_PRICE_KEY, num("extPrice", 100_000_000)],
      [COURSE_EXT_MAX_COUNT_KEY, num("extMaxCount", 100)],
      [COURSE_EXT_DAYS_KEY, num("extDays", 3650)],
    ];
    for (const [key, value] of pairs) {
      const res = await setAppSetting(adminClient, key, value, user.id);
      if (!res.ok) return data({ error: res.error }, { status: 400 });
    }
    return { ok: true, message: "연장 기본값을 저장했습니다." };
  }

  if (intent === "grant") {
    const parsed = grantSchema.safeParse({
      memberNo: fd.get("memberNo"),
      courseId: fd.get("courseId"),
      planId: fd.get("planId") || null,
      durationDays: fd.get("durationDays"),
      source: fd.get("source"),
      note: fd.get("note"),
    });
    if (!parsed.success) {
      return data({ error: "입력을 확인해 주세요 (회원번호·강의·기간·사유 필수)." }, { status: 400 });
    }
    const { data: profile } = await adminClient
      .from("profiles")
      .select("profile_id, name")
      .eq("member_no", parsed.data.memberNo)
      .maybeSingle();
    if (!profile) return data({ error: `회원번호 ${parsed.data.memberNo} 를 찾을 수 없습니다.` }, { status: 404 });

    // 배수 정책 스냅샷 (plan 선택 시) + 지급 시점 course 총 재생시간 스냅샷 (설계 §3.4)
    let multiplier: number | null = null;
    if (parsed.data.planId) {
      const { data: policy } = await adminClient
        .from("plan_policies")
        .select("multiplier")
        .eq("plan_id", parsed.data.planId)
        .maybeSingle();
      multiplier = policy?.multiplier ?? null;
    }
    const baseDuration = await getCourseTotalDuration(parsed.data.courseId);
    const expiresAt = new Date(
      Date.now() + parsed.data.durationDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: enrollment, error } = await adminClient
      .from("enrollments")
      .insert({
        user_id: profile.profile_id,
        course_id: parsed.data.courseId,
        plan_id: parsed.data.planId,
        source: parsed.data.source,
        granted_by: user.id,
        admin_note: parsed.data.note,
        expires_at: expiresAt,
        multiplier_snapshot: multiplier,
        base_duration_snapshot_seconds: baseDuration,
      })
      .select("enrollment_id")
      .single();
    if (error) return data({ error: error.message }, { status: 400 });
    await logEnrollmentAdminAction({
      enrollmentId: enrollment.enrollment_id,
      actorId: user.id,
      action: "grant",
      after: { expires_at: expiresAt, multiplier, base_duration: baseDuration },
      reason: parsed.data.note,
    });
    return data({ ok: true as const, granted: profile.name ?? String(parsed.data.memberNo) });
  }

  if (intent === "extend") {
    const parsed = extendSchema.safeParse({
      enrollmentId: fd.get("enrollmentId"),
      days: fd.get("days"),
    });
    if (!parsed.success) return data({ error: "연장 일수를 확인해 주세요." }, { status: 400 });
    const { data: cur } = await adminClient
      .from("enrollments")
      .select("expires_at")
      .eq("enrollment_id", parsed.data.enrollmentId)
      .maybeSingle();
    if (!cur) return data({ error: "수강권을 찾을 수 없습니다." }, { status: 404 });
    const next = new Date(
      Date.parse(cur.expires_at) + parsed.data.days * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { error } = await adminClient
      .from("enrollments")
      .update({ expires_at: next, status: "active" })
      .eq("enrollment_id", parsed.data.enrollmentId);
    if (error) return data({ error: error.message }, { status: 400 });
    await logEnrollmentAdminAction({
      enrollmentId: parsed.data.enrollmentId,
      actorId: user.id,
      action: "extend",
      before: { expires_at: cur.expires_at },
      after: { expires_at: next },
      reason: `+${parsed.data.days}일 연장`,
    });
    return data({ ok: true as const });
  }

  if (intent === "set_dates") {
    const parsed = setDatesSchema.safeParse({
      enrollmentId: fd.get("enrollmentId"),
      startsAt: fd.get("startsAt"),
      expiresAt: fd.get("expiresAt"),
    });
    if (!parsed.success) return data({ error: "시작일·종료일 형식을 확인해 주세요." }, { status: 400 });
    // KST 경계로 저장 — 시작 00:00, 종료 23:59:59.
    const startsIso = new Date(`${parsed.data.startsAt}T00:00:00+09:00`).toISOString();
    const expiresIso = new Date(`${parsed.data.expiresAt}T23:59:59+09:00`).toISOString();
    if (Date.parse(expiresIso) <= Date.parse(startsIso)) {
      return data({ error: "종료일은 시작일 이후여야 합니다." }, { status: 400 });
    }
    const { data: cur } = await adminClient
      .from("enrollments")
      .select("starts_at, expires_at, status")
      .eq("enrollment_id", parsed.data.enrollmentId)
      .maybeSingle();
    if (!cur) return data({ error: "수강권을 찾을 수 없습니다." }, { status: 404 });
    // 종료일이 미래면 만료 상태를 active 로 되돌린다(회수 상태는 유지).
    const nextStatus =
      cur.status === "expired" && Date.parse(expiresIso) > Date.now()
        ? "active"
        : cur.status;
    const { error } = await adminClient
      .from("enrollments")
      .update({ starts_at: startsIso, expires_at: expiresIso, status: nextStatus })
      .eq("enrollment_id", parsed.data.enrollmentId);
    if (error) return data({ error: error.message }, { status: 400 });
    await logEnrollmentAdminAction({
      enrollmentId: parsed.data.enrollmentId,
      actorId: user.id,
      action: "set_dates",
      before: { starts_at: cur.starts_at, expires_at: cur.expires_at },
      after: { starts_at: startsIso, expires_at: expiresIso },
      reason: "수강기간 직접 수정",
    });
    return data({ ok: true as const });
  }

  if (intent === "set_blocked") {
    const enrollmentId = String(fd.get("enrollmentId") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(enrollmentId)) {
      return data({ error: "잘못된 요청" }, { status: 400 });
    }
    const lessonIds = fd
      .getAll("lessonIds")
      .map(String)
      .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
    const { data: cur } = await adminClient
      .from("enrollments")
      .select("blocked_lesson_ids")
      .eq("enrollment_id", enrollmentId)
      .maybeSingle();
    if (!cur) return data({ error: "수강권을 찾을 수 없습니다." }, { status: 404 });
    const { error } = await adminClient
      .from("enrollments")
      .update({ blocked_lesson_ids: lessonIds })
      .eq("enrollment_id", enrollmentId);
    if (error) return data({ error: error.message }, { status: 400 });
    await logEnrollmentAdminAction({
      enrollmentId,
      actorId: user.id,
      action: "set_blocked_lessons",
      before: { blocked_lesson_ids: cur.blocked_lesson_ids ?? [] },
      after: { blocked_lesson_ids: lessonIds },
      reason: `재생 차단 회차 ${lessonIds.length}개`,
    });
    return data({ ok: true as const });
  }

  if (intent === "credit") {
    // 배수 복구(오차감 보상) — 사용량을 줄이는 음수 credit 행 (§4.4)
    const enrollmentId = String(fd.get("enrollmentId") ?? "");
    const seconds = Math.floor(Number(fd.get("seconds") ?? 0));
    const reason = String(fd.get("reason") ?? "").trim();
    if (!enrollmentId || seconds <= 0 || !reason) {
      return data({ error: "복구 초·사유를 확인해 주세요." }, { status: 400 });
    }
    await insertLedgerAdjustment({
      enrollmentId,
      kind: "credit",
      seconds: -seconds,
      reason,
      actorId: user.id,
    });
    await logEnrollmentAdminAction({
      enrollmentId,
      actorId: user.id,
      action: "watch_credit",
      after: { credited_seconds: seconds },
      reason,
    });
    return data({ ok: true as const });
  }

  if (intent === "reset_usage") {
    // 사용량 초기화 — 현재 SUM 상쇄 reset 행 1개 (§4.4)
    const enrollmentId = String(fd.get("enrollmentId") ?? "");
    const reason = String(fd.get("reason") ?? "").trim();
    if (!enrollmentId || !reason) return data({ error: "사유를 입력해 주세요." }, { status: 400 });
    const { offsetSeconds } = await resetWatchUsage({ enrollmentId, reason, actorId: user.id });
    await logEnrollmentAdminAction({
      enrollmentId,
      actorId: user.id,
      action: "watch_reset",
      after: { offset_seconds: offsetSeconds },
      reason,
    });
    return data({ ok: true as const });
  }

  if (intent === "pause") {
    // 일시정지 적용(관리자) — expires_at += days, status=paused (§3.4)
    const enrollmentId = String(fd.get("enrollmentId") ?? "");
    const days = Math.floor(Number(fd.get("days") ?? 0));
    if (!enrollmentId || days <= 0 || days > 365) {
      return data({ error: "정지 일수를 확인해 주세요." }, { status: 400 });
    }
    const { data: cur } = await adminClient
      .from("enrollments")
      .select("expires_at, status")
      .eq("enrollment_id", enrollmentId)
      .maybeSingle();
    if (!cur) return data({ error: "수강권을 찾을 수 없습니다." }, { status: 404 });
    if (cur.status !== "active") return data({ error: "이용중 상태에서만 정지할 수 있습니다." }, { status: 400 });
    const startsOn = new Date();
    const endsOn = new Date(Date.now() + days * 86400_000);
    const nextExpires = new Date(Date.parse(cur.expires_at) + days * 86400_000).toISOString();
    const { error: pErr } = await adminClient.from("enrollment_pauses").insert({
      enrollment_id: enrollmentId,
      requested_by: user.id,
      starts_on: startsOn.toISOString().slice(0, 10),
      ends_on: endsOn.toISOString().slice(0, 10),
      days,
      is_admin_exception: true, // 관리자 적용 — 정책 범위 검증은 학생 셀프 신청(M4 마이페이지)에서
    });
    if (pErr) return data({ error: pErr.message }, { status: 400 });
    const { error } = await adminClient
      .from("enrollments")
      .update({ status: "paused", expires_at: nextExpires })
      .eq("enrollment_id", enrollmentId);
    if (error) return data({ error: error.message }, { status: 400 });
    await logEnrollmentAdminAction({
      enrollmentId,
      actorId: user.id,
      action: "pause",
      before: { expires_at: cur.expires_at },
      after: { expires_at: nextExpires, days },
      reason: `일시정지 ${days}일 (관리자 적용)`,
    });
    return data({ ok: true as const });
  }

  if (intent === "resume") {
    const enrollmentId = String(fd.get("enrollmentId") ?? "");
    if (!enrollmentId) return data({ error: "잘못된 요청" }, { status: 400 });
    const { error } = await adminClient
      .from("enrollments")
      .update({ status: "active" })
      .eq("enrollment_id", enrollmentId)
      .eq("status", "paused");
    if (error) return data({ error: error.message }, { status: 400 });
    // 최근 미재개 pause 에 재개 시각 기록
    const { data: lastPause } = await adminClient
      .from("enrollment_pauses")
      .select("pause_id")
      .eq("enrollment_id", enrollmentId)
      .is("resumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastPause) {
      await adminClient
        .from("enrollment_pauses")
        .update({ resumed_at: new Date().toISOString() })
        .eq("pause_id", lastPause.pause_id);
    }
    await logEnrollmentAdminAction({
      enrollmentId,
      actorId: user.id,
      action: "resume",
      reason: "일시정지 재개 (관리자)",
    });
    return data({ ok: true as const });
  }

  if (intent === "revoke") {
    const parsed = revokeSchema.safeParse({
      enrollmentId: fd.get("enrollmentId"),
      reason: fd.get("reason"),
    });
    if (!parsed.success) return data({ error: "회수 사유를 입력해 주세요." }, { status: 400 });
    const { error } = await adminClient
      .from("enrollments")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoke_reason: parsed.data.reason,
      })
      .eq("enrollment_id", parsed.data.enrollmentId);
    if (error) return data({ error: error.message }, { status: 400 });
    await logEnrollmentAdminAction({
      enrollmentId: parsed.data.enrollmentId,
      actorId: user.id,
      action: "revoke",
      reason: parsed.data.reason,
    });
    return data({ ok: true as const });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

const STATUS_TONE: Record<string, "emerald" | "amber" | "neutral" | "coral"> = {
  active: "emerald",
  paused: "amber",
  expired: "neutral",
  revoked: "coral",
};
const STATUS_LABEL: Record<string, string> = {
  active: "이용중",
  paused: "일시정지",
  expired: "만료",
  revoked: "회수",
};
const SOURCE_LABEL: Record<string, string> = {
  order: "결제",
  manual: "수동",
  migration: "이관",
  event: "이벤트",
};

/**
 * feat-11-010 — 유료 수강기간 연장 **기본값**.
 * 강의별 값(상품 › 수강 정책)이 비어 있으면 이 값이 적용된다.
 */
function ExtensionDefaultsForm({
  defaults,
}: {
  defaults: {
    enabled: boolean;
    priceKrw: number;
    maxCount: number;
    days: number;
  };
}) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  useEffect(() => {
    if (fetcher.data?.error) toast.error(fetcher.data.error);
    else if (fetcher.data?.message) toast.success(fetcher.data.message);
  }, [fetcher.data]);
  const num = "border-input bg-background h-8 w-28 rounded-md border px-2 text-xs";
  return (
    <fetcher.Form
      method="post"
      className="border-input mb-4 flex flex-wrap items-end gap-3 rounded-lg border p-3"
    >
      <input type="hidden" name="intent" value="ext_defaults" />
      <div className="mr-2">
        <p className="text-sm font-bold">수강연장 기본값</p>
        <p className="text-muted-foreground text-[11px]">
          온라인 단과강의 공통. 강의별로 다르게 하려면 상품의 수강 정책에서 개별
          설정합니다.
        </p>
      </div>
      <label className="flex items-center gap-1.5 text-xs font-semibold">
        <input
          type="checkbox"
          name="extEnabled"
          value="1"
          defaultChecked={defaults.enabled}
          className="size-3.5"
        />
        기간연장 허용
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[10px] font-semibold uppercase">
          연장비용(원)
        </span>
        <Input
          name="extPrice"
          type="number"
          min={0}
          defaultValue={defaults.priceKrw}
          className={num}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[10px] font-semibold uppercase">
          최대횟수(0=무제한)
        </span>
        <Input
          name="extMaxCount"
          type="number"
          min={0}
          max={100}
          defaultValue={defaults.maxCount}
          className={num}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[10px] font-semibold uppercase">
          연장일수(0=학습일수)
        </span>
        <Input
          name="extDays"
          type="number"
          min={0}
          max={3650}
          defaultValue={defaults.days}
          className={num}
        />
      </label>
      <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
        기본값 저장
      </Button>
    </fetcher.Form>
  );
}

export default function AdminLmsEnrollments({ loaderData }: Route.ComponentProps) {
  const { rows, query, role, courses, plans, extensionDefaults } = loaderData;
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="영상 수강권"
      desc="수강권 수동 지급(이관·이벤트·직원용)과 기간 연장·회수를 처리합니다. 결제 지급은 M4 주문 연동에서 자동화됩니다."
      headerRight={
        <Chip tone="solid">
          <TicketIcon className="size-3" /> {rows.length}건
        </Chip>
      }
    >
      <ExtensionDefaultsForm defaults={extensionDefaults} />

      <GrantForm courses={courses} plans={plans} />

      <Form method="get" className="mt-4 mb-2 flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="이름 / 회원번호 / 강의명 검색"
          className="border-input bg-background h-9 w-72 rounded-lg border px-3 text-sm"
        />
        <Button type="submit" size="sm" variant="outline" className="h-9">검색</Button>
      </Form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          수강권이 없습니다.
        </p>
      ) : (
        <IndexTable
          minWidth={1000}
          headers={[
            { label: "회원" },
            { label: "강의" },
            { label: "구분", width: "4.5rem" },
            { label: "기간", width: "11rem" },
            { label: "배수 사용/허용", align: "right", width: "9rem" },
            { label: "상태", width: "5.5rem" },
            { label: "", width: "17rem" },
          ]}
        >
          {rows.map((r) => (
            <EnrollmentRowView key={r.enrollmentId} row={r} />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function GrantForm({
  courses,
  plans,
}: {
  courses: Array<{ courseId: string; label: string; status: string }>;
  plans: Array<{ planId: string; name: string; kind: string }>;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string; granted?: string }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.granted) toast.success(`${fetcher.data.granted} 님에게 수강권을 지급했습니다.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <fetcher.Form
      method="post"
      className="border-border bg-card flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
    >
      <input type="hidden" name="intent" value="grant" />
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">회원번호</span>
        <input name="memberNo" type="number" required min={1} placeholder="1234"
          className="border-input bg-background h-9 w-24 rounded-lg border px-2 text-sm tabular-nums" />
      </label>
      <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">강의(에디션)</span>
        <select name="courseId" required className="border-input bg-background h-9 rounded-lg border px-2 text-sm">
          {courses.map((c) => (
            <option key={c.courseId} value={c.courseId}>
              {c.label}{c.status !== "published" ? " (미발행)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">정책 상품(선택)</span>
        <select name="planId" className="border-input bg-background h-9 rounded-lg border px-2 text-sm">
          <option value="">(정책 없음 — 배수 무제한)</option>
          {plans.map((p) => (
            <option key={p.planId} value={p.planId}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">기간(일)</span>
        <input name="durationDays" type="number" required min={1} max={3650} defaultValue={180}
          className="border-input bg-background h-9 w-20 rounded-lg border px-2 text-sm tabular-nums" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">구분</span>
        <select name="source" className="border-input bg-background h-9 rounded-lg border px-2 text-sm">
          <option value="manual">수동</option>
          <option value="migration">이관</option>
          <option value="event">이벤트</option>
        </select>
      </label>
      <label className="flex min-w-[180px] flex-1 flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">사유(필수)</span>
        <input name="note" required maxLength={300} placeholder="예: lidamedu 이관"
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm" />
      </label>
      <Button type="submit" size="sm" className="h-9" disabled={fetcher.state !== "idle"}>
        지급
      </Button>
    </fetcher.Form>
  );
}

function fmtHours(sec: number | null): string {
  if (sec == null) return "∞";
  const h = sec / 3600;
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`;
}

function EnrollmentRowView({
  row,
}: {
  row: EnrollmentRow & {
    balance: WatchBalance | null;
    extensionAllowed: boolean;
    lessons: Array<{ lessonId: string; lessonNo: number; title: string }>;
  };
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  const submit = (fields: Record<string, string>) => {
    const fd = new FormData();
    fd.set("enrollmentId", row.enrollmentId);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fetcher.submit(fd, { method: "post" });
  };
  const extend = (days: number) => submit({ intent: "extend", days: String(days) });
  const revoke = () => {
    const reason = prompt("회수 사유를 입력하세요 (환불·취소 등):");
    if (!reason?.trim()) return;
    submit({ intent: "revoke", reason: reason.trim() });
  };
  const credit = () => {
    const minutes = prompt("복구할 분(min)을 입력하세요 (버퍼링·오류 오차감 보상):");
    const m = Math.floor(Number(minutes ?? 0));
    if (!m || m <= 0) return;
    const reason = prompt("복구 사유:");
    if (!reason?.trim()) return;
    submit({ intent: "credit", seconds: String(m * 60), reason: reason.trim() });
  };
  const resetUsage = () => {
    const reason = prompt("사용량 초기화 사유 (이력은 보존되고 잔여만 원복됩니다):");
    if (!reason?.trim()) return;
    submit({ intent: "reset_usage", reason: reason.trim() });
  };
  const pause = () => {
    const days = Math.floor(Number(prompt("일시정지 일수 (만료일이 그만큼 연장됩니다):") ?? 0));
    if (!days || days <= 0) return;
    submit({ intent: "pause", days: String(days) });
  };
  return (
    <>
      <TR>
      <TD>
        <span className="font-semibold">{row.userName ?? "(이름 없음)"}</span>
        {row.memberNo != null ? (
          <span className="text-muted-foreground ml-1 text-[11px] tabular-nums">No.{row.memberNo}</span>
        ) : null}
      </TD>
      <TD soft>{row.courseLabel}</TD>
      <TD soft>{SOURCE_LABEL[row.source] ?? row.source}</TD>
      <TD mono soft>
        {row.startsAt.slice(0, 10)} ~ {row.expiresAt.slice(0, 10)}
      </TD>
      <TD align="right" mono>
        <span title={row.multiplierSnapshot != null ? `배수 ×${row.multiplierSnapshot}` : "배수 미적용"}>
          {/* 회차 단위 초기화가 쌓이면 원장 합계가 음수가 될 수 있어 표시에서 0 으로 막는다. */}
          {fmtHours(Math.max(0, row.balance?.usedSeconds ?? 0))} /{" "}
          {fmtHours(row.balance?.allowedSeconds ?? null)}
        </span>
        {row.balance?.remainingSeconds != null && row.balance.remainingSeconds <= 0 ? (
          <Chip tone="coral" className="ml-1">소진</Chip>
        ) : null}
      </TD>
      <TD>
        <div className="flex flex-col items-start gap-1">
          <Chip tone={STATUS_TONE[row.status] ?? "neutral"}>{STATUS_LABEL[row.status] ?? row.status}</Chip>
          <Chip
            tone={row.extensionAllowed ? "emerald" : "outline"}
            className="text-[10px]"
          >
            {row.extensionAllowed ? "셀프연장 허용" : "셀프연장 불가"}
          </Chip>
        </div>
      </TD>
      <TD align="right">
        {row.status !== "revoked" ? (
          <div className="flex flex-wrap items-center justify-end gap-1">
            {[7, 15, 30].map((d) => (
              <button key={d} type="button" onClick={() => extend(d)}
                className="border-border hover:bg-muted/50 h-6 rounded-md border px-1.5 text-[11px] font-medium tabular-nums">
                +{d}일
              </button>
            ))}
            <button type="button" onClick={credit}
              className="border-border hover:bg-muted/50 h-6 rounded-md border px-1.5 text-[11px] font-medium"
              title="배수 오차감 복구 (credit)">
              복구
            </button>
            <button type="button" onClick={resetUsage}
              className="border-border hover:bg-muted/50 h-6 rounded-md border px-1.5 text-[11px] font-medium"
              title="사용량 초기화 (reset — 이력 보존)">
              초기화
            </button>
            {row.status === "paused" ? (
              <button type="button" onClick={() => submit({ intent: "resume" })}
                className="border-border hover:bg-muted/50 h-6 rounded-md border px-1.5 text-[11px] font-medium">
                재개
              </button>
            ) : (
              <button type="button" onClick={pause}
                className="border-border hover:bg-muted/50 h-6 rounded-md border px-1.5 text-[11px] font-medium">
                정지
              </button>
            )}
            <button type="button" onClick={() => setEditing((v) => !v)}
              className="border-border hover:bg-muted/50 h-6 rounded-md border px-1.5 text-[11px] font-medium"
              title="수강기간 직접 수정 · 회차 재생 차단">
              수정
            </button>
            <button type="button" onClick={revoke}
              className="border-border h-6 rounded-md border px-1.5 text-[11px] font-medium text-rose-600 hover:bg-rose-500/10 dark:text-rose-400">
              회수
            </button>
          </div>
        ) : (
          <span className="text-muted-foreground text-[11px]">{row.adminNote ?? ""}</span>
        )}
      </TD>
      </TR>
      {editing && row.status !== "revoked" ? (
        <tr className="border-border/60 border-b last:border-0">
          <td colSpan={7} className="bg-muted/20 p-3">
            <EnrollmentEditPanel
              row={row}
              busy={fetcher.state !== "idle"}
              submitFd={(fd) => {
                fd.set("enrollmentId", row.enrollmentId);
                fetcher.submit(fd, { method: "post" });
              }}
              onDone={() => setEditing(false)}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function toDateInput(iso: string): string {
  // KST 기준 날짜(YYYY-MM-DD).
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(0, 10);
}

function EnrollmentEditPanel({
  row,
  busy,
  submitFd,
  onDone,
}: {
  row: EnrollmentRow & {
    lessons: Array<{ lessonId: string; lessonNo: number; title: string }>;
  };
  busy: boolean;
  submitFd: (fd: FormData) => void;
  onDone: () => void;
}) {
  const [startsAt, setStartsAt] = useState(() => toDateInput(row.startsAt));
  const [expiresAt, setExpiresAt] = useState(() => toDateInput(row.expiresAt));
  const [blocked, setBlocked] = useState<Set<string>>(
    () => new Set(row.blockedLessonIds),
  );
  const toggleBlocked = (lessonId: string) => {
    setBlocked((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  };
  const saveDates = () => {
    const fd = new FormData();
    fd.set("intent", "set_dates");
    fd.set("startsAt", startsAt);
    fd.set("expiresAt", expiresAt);
    submitFd(fd);
  };
  const saveBlocked = () => {
    const fd = new FormData();
    fd.set("intent", "set_blocked");
    for (const id of blocked) fd.append("lessonIds", id);
    submitFd(fd);
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* 수강기간 직접 수정 */}
      <div className="space-y-2">
        <p className="text-muted-foreground text-[11px] font-semibold">
          수강기간 직접 수정
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px]">시작일</span>
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="border-input bg-background h-8 rounded-md border px-2 text-[12px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px]">종료일</span>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="border-input bg-background h-8 rounded-md border px-2 text-[12px]"
            />
          </label>
          <Button size="sm" className="h-8 text-[12px]" disabled={busy} onClick={saveDates}>
            기간 저장
          </Button>
        </div>
        <p className="text-muted-foreground/70 text-[10px]">
          종료일이 미래면 만료 상태가 자동으로 수강중으로 복구됩니다.
        </p>
      </div>

      {/* 특정 회차 재생 차단 */}
      <div className="space-y-2">
        <p className="text-muted-foreground text-[11px] font-semibold">
          특정 회차 재생 차단 ({blocked.size}개 차단)
        </p>
        {row.lessons.length === 0 ? (
          <p className="text-muted-foreground/60 text-[11px]">회차가 없습니다.</p>
        ) : (
          <>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {row.lessons.map((l) => (
                <label
                  key={l.lessonId}
                  className="flex items-center gap-1.5 text-[12px]"
                >
                  <input
                    type="checkbox"
                    checked={blocked.has(l.lessonId)}
                    onChange={() => toggleBlocked(l.lessonId)}
                    className="size-3.5 shrink-0"
                  />
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {l.lessonNo}강
                  </span>
                  <span className="truncate">{l.title}</span>
                </label>
              ))}
            </div>
            <Button size="sm" variant="outline" className="h-8 text-[12px]" disabled={busy} onClick={saveBlocked}>
              차단 저장
            </Button>
          </>
        )}
      </div>

      <div className="md:col-span-2 flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="text-muted-foreground text-[11px] hover:underline"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
