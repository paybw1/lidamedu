// feat-11-011 P5 — 강의·판매 운영 대시보드 (요청서 §1.2 "0. 대시보드").
// 로그인 직후 오늘의 운영현황과 **손이 필요한 일**을 한 화면에서 본다.
//
// ★새로 저장하는 값은 없다. 전부 기존 테이블에서 파생한다.
// ★경고 카드는 숫자만 보여 주지 않는다 — 누르면 그 목록으로 바로 간다(요청서 §1.4).

import { AlertTriangleIcon, LayoutDashboardIcon } from "lucide-react";
import { Link, data } from "react-router";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import { CHECKOUT_TTL_MINUTES } from "~/features/orders/orders.server";

import type { Route } from "./+types/admin-ops-dashboard";

export const meta: Route.MetaFunction = () => [
  { title: "운영 대시보드 | 리담변리사학원" },
];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** KST 오늘 0시의 UTC ISO. 하루 경계는 서버 시간이 아니라 한국 날짜다. */
function kstTodayStartIso(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  return new Date(`${kst.toISOString().slice(0, 10)}T00:00:00+09:00`).toISOString();
}

/** 만료 임박으로 보는 기간(일). */
const EXPIRING_SOON_DAYS = 7;
/** 이 시간을 넘긴 미결제 주문은 "장기 결제대기"로 본다. */
const STALE_ORDER_HOURS = 24;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("로그인이 필요합니다.", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager")) {
    throw data("운영 대시보드는 관리자 이상만 볼 수 있습니다.", { status: 403 });
  }

  const todayIso = kstTodayStartIso();
  const staleIso = new Date(Date.now() - STALE_ORDER_HOURS * 3600_000).toISOString();
  const soonIso = new Date(Date.now() + EXPIRING_SOON_DAYS * 86400_000).toISOString();
  const nowIso = new Date().toISOString();
  const head = { count: "exact" as const, head: true };

  const [
    paidToday,
    enrollToday,
    extendToday,
    refundPending,
    playbackToday,
    shipPreparing,
    inquiryOpen,
    staleOrders,
    expiringSoon,
    depositWaiting,
  ] = await Promise.all([
    adminClient.from("orders").select("order_id", head).eq("status", "paid").gte("created_at", todayIso),
    adminClient.from("enrollments").select("enrollment_id", head).gte("created_at", todayIso),
    adminClient.from("enrollment_extensions").select("extension_id", head).gte("created_at", todayIso),
    adminClient.from("refund_requests").select("refund_request_id", head).eq("status", "pending"),
    adminClient.from("playback_issues").select("issue_id", head).gte("created_at", todayIso),
    adminClient.from("shipments").select("shipment_id", head).eq("status", "preparing"),
    adminClient.from("cs_inquiries").select("inquiry_id", head).neq("status", "answered").is("deleted_at", null),
    adminClient
      .from("orders")
      .select("order_id", head)
      .in("status", ["attempted", "pending_payment"])
      .lt("created_at", staleIso),
    adminClient
      .from("enrollments")
      .select("enrollment_id", head)
      .eq("status", "active")
      .gte("expires_at", nowIso)
      .lte("expires_at", soonIso),
    adminClient.from("orders").select("order_id", head).eq("status", "pending_deposit"),
  ]);

  // 오늘 매출 — 파생 뷰(v_sales_daily)를 그대로 쓴다. 집계를 여기서 다시 짜지 않는다.
  const todayKst = new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
  const { data: sales } = await adminClient
    .from("v_sales_daily")
    .select("sale_date, gross_krw, refund_krw")
    .eq("sale_date", todayKst)
    .maybeSingle();

  const n = (r: { count: number | null }) => r.count ?? 0;
  return {
    role,
    today: {
      grossKrw: Number(sales?.gross_krw ?? 0),
      refundKrw: Number(sales?.refund_krw ?? 0),
      paidOrders: n(paidToday),
      newEnrollments: n(enrollToday),
      extensions: n(extendToday),
    },
    alerts: {
      refundPending: n(refundPending),
      playbackToday: n(playbackToday),
      shipPreparing: n(shipPreparing),
      inquiryOpen: n(inquiryOpen),
      staleOrders: n(staleOrders),
      expiringSoon: n(expiringSoon),
      depositWaiting: n(depositWaiting),
    },
    meta: { expiringSoonDays: EXPIRING_SOON_DAYS, staleOrderHours: STALE_ORDER_HOURS, ttl: CHECKOUT_TTL_MINUTES },
  };
}

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-border bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {sub ? <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p> : null}
    </div>
  );
}

/** 경고 카드 — 0건이면 조용히 회색, 1건 이상이면 눈에 띄고 눌러서 목록으로 간다. */
function AlertCard({
  label,
  count,
  to,
  hint,
}: {
  label: string;
  count: number;
  to: string;
  hint?: string;
}) {
  const hot = count > 0;
  return (
    <Link
      to={to}
      className={
        "block rounded-xl border p-4 transition-colors " +
        (hot
          ? "border-amber-400/60 bg-amber-50 hover:border-amber-500 dark:border-amber-500/40 dark:bg-amber-500/10"
          : "border-border bg-card hover:border-primary/50")
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className={"text-[12px] font-bold " + (hot ? "text-amber-900 dark:text-amber-200" : "")}>
          {label}
        </p>
        <span
          className={
            "text-xl font-extrabold tabular-nums " +
            (hot ? "text-amber-800 dark:text-amber-200" : "text-muted-foreground")
          }
        >
          {count}
        </span>
      </div>
      {hint ? (
        <p className={"mt-0.5 text-[11px] " + (hot ? "text-amber-800/80 dark:text-amber-200/70" : "text-muted-foreground")}>
          {hint}
        </p>
      ) : null}
    </Link>
  );
}

export default function AdminOpsDashboard({ loaderData }: Route.ComponentProps) {
  const { role, today, alerts, meta } = loaderData;
  const pending = Object.values(alerts).reduce((s, v) => s + v, 0);

  return (
    <AdminShell
      cluster="c-dashboard"
      role={role}
      title="운영 대시보드"
      desc="오늘의 판매 현황과 손이 필요한 일을 한 화면에서 봅니다. 숫자를 누르면 해당 목록으로 이동합니다."
      headerRight={
        <span className="text-muted-foreground text-xs font-semibold">
          <LayoutDashboardIcon className="mr-1 inline size-3.5" />
          처리 대기 {pending}건
        </span>
      }
    >
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold">오늘</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="결제 금액" value={won(today.grossKrw)} sub={`주문 ${today.paidOrders}건`} />
          <Stat label="환불 금액" value={won(today.refundKrw)} />
          <Stat label="신규 수강" value={`${today.newEnrollments}건`} />
          <Stat label="수강 연장" value={`${today.extensions}건`} />
          <Stat label="재생 오류" value={`${alerts.playbackToday}건`} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
          <AlertTriangleIcon className="size-4" /> 처리 대기
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AlertCard
            label="환불 요청"
            count={alerts.refundPending}
            to="/admin/orders"
            hint="수강생이 신청한 환불"
          />
          <AlertCard
            label="입금 대기"
            count={alerts.depositWaiting}
            to="/admin/orders?status=pending_deposit"
            hint="무통장 입금 확인 필요"
          />
          <AlertCard
            label="배송 준비"
            count={alerts.shipPreparing}
            to="/admin/shipments?status=preparing"
            hint="송장 등록 전"
          />
          <AlertCard
            label="미처리 문의"
            count={alerts.inquiryOpen}
            to="/admin/cs-inquiries"
            hint="답변 대기"
          />
          <AlertCard
            label="장기 결제대기"
            count={alerts.staleOrders}
            to="/admin/orders?status=attempted"
            hint={`${meta.staleOrderHours}시간 경과 · ${meta.ttl}분 뒤 자동 만료`}
          />
          <AlertCard
            label="수강권 만료 예정"
            count={alerts.expiringSoon}
            to="/admin/lms/enrollments"
            hint={`${meta.expiringSoonDays}일 이내`}
          />
          <AlertCard
            label="재생 오류"
            count={alerts.playbackToday}
            to="/admin/lms/devices"
            hint="오늘 접수된 재생 실패"
          />
        </div>
      </section>
    </AdminShell>
  );
}
