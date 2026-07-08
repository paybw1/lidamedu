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
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getCourseTotalDuration,
  listEnrollments,
  logEnrollmentAdminAction,
  type EnrollmentRow,
} from "~/features/lms/queries.server";

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
  return { client, user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { role } = await requireManager(request);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const [rows, coursesRes, plansRes] = await Promise.all([
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
          minWidth={860}
          headers={[
            { label: "회원" },
            { label: "강의" },
            { label: "구분", width: "5rem" },
            { label: "기간", width: "12rem" },
            { label: "배수", align: "right", width: "5rem" },
            { label: "상태", width: "6rem" },
            { label: "", width: "14rem" },
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

function EnrollmentRowView({ row }: { row: EnrollmentRow }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  const extend = (days: number) => {
    const fd = new FormData();
    fd.set("intent", "extend");
    fd.set("enrollmentId", row.enrollmentId);
    fd.set("days", String(days));
    fetcher.submit(fd, { method: "post" });
  };
  const revoke = () => {
    const reason = prompt("회수 사유를 입력하세요 (환불·취소 등):");
    if (!reason?.trim()) return;
    const fd = new FormData();
    fd.set("intent", "revoke");
    fd.set("enrollmentId", row.enrollmentId);
    fd.set("reason", reason.trim());
    fetcher.submit(fd, { method: "post" });
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
        {row.multiplierSnapshot != null ? `×${row.multiplierSnapshot}` : "∞"}
      </TD>
      <TD>
        <Chip tone={STATUS_TONE[row.status] ?? "neutral"}>{STATUS_LABEL[row.status] ?? row.status}</Chip>
      </TD>
      <TD align="right">
        {row.status !== "revoked" ? (
          <div className="flex items-center justify-end gap-1">
            {[7, 15, 30].map((d) => (
              <button key={d} type="button" onClick={() => extend(d)}
                className="border-border hover:bg-muted/50 h-6 rounded-md border px-1.5 text-[11px] font-medium tabular-nums">
                +{d}일
              </button>
            ))}
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
