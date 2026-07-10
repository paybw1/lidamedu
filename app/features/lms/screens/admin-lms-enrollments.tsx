// feat-11-002 — 영상 수강권: 수동 지급(이관·이벤트·직원용)·목록·연장·회수. manager+.
// 쓰기는 전부 adminClient(RLS 에 쓰기 정책 없음 — 서버 권위) + enrollment_admin_logs 감사.

import { useEffect } from "react";
import { TicketIcon } from "lucide-react";
import { Form, data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
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
  const policies = await getPlanPolicies(planIds);
  const rows = rowsRaw.map((r) => ({
    ...r,
    balance: balances.get(r.enrollmentId) ?? null,
    extensionAllowed: r.planId ? (policies[r.planId]?.extensionAllowed ?? false) : false,
  }));
  return {
    rows,
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
const revokeSchema = z.object({
  enrollmentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
});

export async function action({ request }: Route.ActionArgs) {
  const { user } = await requireManager(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

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

export default function AdminLmsEnrollments({ loaderData }: Route.ComponentProps) {
  const { rows, query, role, courses, plans } = loaderData;
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
  };
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
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
          {fmtHours(row.balance?.usedSeconds ?? 0)} /{" "}
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
  );
}
