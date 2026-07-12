// feat-8-029 Stage 1 — 운영자 주문결제 관리 (manager+).
// 기간·상품 필터 + 일/주/월 집계 + 결제내역 / 환불내역 탭.

import {
  BanknoteIcon,
  DownloadIcon,
  ReceiptTextIcon,
  RotateCcwIcon,
} from "lucide-react";
import { Form, Link, redirect, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { csvResponse } from "~/core/lib/csv.server";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Bar,
  Chip,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import {
  buildPaymentStats,
  listAdminPayments,
  type StatsGranularity,
} from "~/features/subscriptions/payments-admin.server";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "~/features/subscriptions/labels";
import { listSubscriptionPlans } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/admin-payments";

export const meta: Route.MetaFunction = () => [
  { title: "주문·결제 관리 | 운영자" },
];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type PeriodPreset = "this_month" | "30d" | "90d" | "this_year" | "all";

/** preset → [fromIso, toIso) — KST 경계 기준. */
function presetRange(preset: PeriodPreset): {
  fromIso: string | null;
  toIso: string | null;
} {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const kstToUtcIso = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m, d) - KST_OFFSET_MS).toISOString();
  if (preset === "this_month") {
    return {
      fromIso: kstToUtcIso(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), 1),
      toIso: null,
    };
  }
  if (preset === "this_year") {
    return { fromIso: kstToUtcIso(nowKst.getUTCFullYear(), 0, 1), toIso: null };
  }
  if (preset === "30d" || preset === "90d") {
    const days = preset === "30d" ? 30 : 90;
    return {
      fromIso: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
      toIso: null,
    };
  }
  return { fromIso: null, toIso: null };
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const { data: prof } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!roleAtLeast(prof?.role, "manager")) throw redirect("/admin");

  const url = new URL(request.url);
  const preset = (url.searchParams.get("period") ?? "this_month") as PeriodPreset;
  const granularity = (url.searchParams.get("g") ?? "day") as StatsGranularity;
  const planId = url.searchParams.get("plan") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const tab = url.searchParams.get("tab") === "refunds" ? "refunds" : "payments";

  const { fromIso, toIso } = presetRange(preset);
  const [rows, plans] = await Promise.all([
    listAdminPayments({ fromIso, toIso, planId: planId || undefined }),
    listSubscriptionPlans(client),
  ]);
  const { buckets, summary } = buildPaymentStats(rows, granularity, fromIso, toIso);

  // 결제내역 — created_at 이 기간 내인 것(상태 필터 적용). 환불내역 — refunded_at 이 기간 내인 것.
  const payments = rows.filter(
    (r) =>
      (!fromIso || r.createdAt >= fromIso) &&
      (!toIso || r.createdAt < toIso) &&
      (!status || r.status === status),
  );
  const refunds = rows
    .filter(
      (r) =>
        r.refundedAt &&
        (!fromIso || r.refundedAt >= fromIso) &&
        (!toIso || r.refundedAt < toIso),
    )
    .sort((a, b) => (b.refundedAt ?? "").localeCompare(a.refundedAt ?? ""));

  // CSV 내보내기 — 현재 탭(결제/환불)·필터 그대로. 회계 핸드오프용.
  if (url.searchParams.get("export") === "csv") {
    const src = tab === "refunds" ? refunds : payments;
    const headers = [
      "결제ID",
      "일시",
      "회원",
      "상품",
      "금액(원)",
      "상태",
      "결제수단",
      "토스주문ID",
      "환불일시",
      "환불액(원)",
      "환불사유",
    ];
    const csvRows = src.map((r) => [
      r.paymentId,
      fmtDateTime(r.createdAt),
      r.userName ?? "",
      r.planName || r.planCode,
      r.amountKrw,
      PAYMENT_STATUS_LABEL[r.status] ?? r.status,
      r.method ?? "",
      r.tossOrderId ?? "",
      r.refundedAt ? fmtDateTime(r.refundedAt) : "",
      r.refundAmountKrw ?? "",
      r.refundReason ?? "",
    ]);
    return csvResponse(
      `${tab === "refunds" ? "환불내역" : "결제내역"}_${preset}.csv`,
      headers,
      csvRows,
    );
  }

  return {
    payments,
    refunds,
    buckets,
    summary,
    plans,
    filter: { preset, granularity, planId, status, tab },
  };
}

function fmtKrw(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

const STATUS_TONE: Record<PaymentStatus, "emerald" | "coral" | "amber" | "neutral"> = {
  completed: "emerald",
  refunded: "amber",
  failed: "coral",
  pending: "neutral",
};

const GRANULARITY_LABEL: Record<StatsGranularity, string> = {
  day: "일별",
  week: "주별",
  month: "월별",
};

export default function AdminPayments({ loaderData }: Route.ComponentProps) {
  const { payments, refunds, buckets, summary, plans, filter } = loaderData;
  const [searchParams] = useSearchParams();
  const tabQs = (tab: "payments" | "refunds") => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", tab);
    return `?${p.toString()}`;
  };
  const exportHref = (() => {
    const p = new URLSearchParams(searchParams);
    p.set("export", "csv");
    return `?${p.toString()}`;
  })();
  const maxNet = Math.max(1, ...buckets.map((b) => Math.max(b.paidKrw, b.refundKrw)));

  return (
    <AdminShell
      cluster="sales"
      title="주문·결제 관리"
      desc="기간별 결제·환불 내역과 매출 통계를 조회합니다. 집계는 KST 기준이며, 결제는 결제일·환불은 환불일 기준으로 버킷됩니다."
      headerRight={
        <Button asChild size="sm" variant="outline">
          <a href={exportHref} download>
            <DownloadIcon className="size-3.5" /> CSV 내보내기
          </a>
        </Button>
      }
    >
      <Form
        method="get"
        className="border-border bg-card mb-4 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
      >
        <FilterField label="기간">
          <AdminSelect name="period" defaultValue={filter.preset}>
            <option value="this_month">이번 달</option>
            <option value="30d">최근 30일</option>
            <option value="90d">최근 90일</option>
            <option value="this_year">올해</option>
            <option value="all">전체</option>
          </AdminSelect>
        </FilterField>
        <FilterField label="집계 단위">
          <AdminSelect name="g" defaultValue={filter.granularity}>
            <option value="day">일별</option>
            <option value="week">주별</option>
            <option value="month">월별</option>
          </AdminSelect>
        </FilterField>
        <FilterField label="상품">
          <AdminSelect name="plan" defaultValue={filter.planId}>
            <option value="">전체</option>
            {plans.map((p) => (
              <option key={p.planId} value={p.planId}>
                {p.name}
              </option>
            ))}
          </AdminSelect>
        </FilterField>
        <FilterField label="상태 (결제내역)">
          <AdminSelect name="status" defaultValue={filter.status}>
            <option value="">전체</option>
            <option value="completed">완료</option>
            <option value="refunded">환불</option>
            <option value="failed">실패</option>
            <option value="pending">대기</option>
          </AdminSelect>
        </FilterField>
        <input type="hidden" name="tab" value={filter.tab} />
        <Button type="submit" size="sm" variant="outline">
          적용
        </Button>
      </Form>

      {/* 요약 카드 */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="결제액 (승인)"
          value={fmtKrw(summary.paidKrw)}
          sub={`${summary.paidCount}건${summary.failedCount ? ` · 실패 ${summary.failedCount}건` : ""}`}
        />
        <SummaryCard
          label="환불액"
          value={fmtKrw(summary.refundKrw)}
          sub={`${summary.refundCount}건`}
          tone="coral"
        />
        <SummaryCard label="순매출" value={fmtKrw(summary.netKrw)} tone="emerald" />
        <SummaryCard
          label="평균 결제액"
          value={summary.paidCount > 0 ? fmtKrw(Math.round(summary.paidKrw / summary.paidCount)) : "—"}
        />
      </div>

      {/* 기간 집계 */}
      <div className="mb-5">
        <h2 className="text-muted-foreground mb-2 inline-flex items-center gap-1.5 text-[12px] font-bold tracking-widest uppercase">
          <BanknoteIcon className="size-3.5" /> {GRANULARITY_LABEL[filter.granularity]} 집계
        </h2>
        {buckets.length === 0 ? (
          <EmptyBox>기간 내 결제·환불이 없습니다.</EmptyBox>
        ) : (
          <IndexTable
            minWidth={720}
            headers={[
              { label: "구간", width: "8rem" },
              { label: "결제", align: "right", width: "10rem" },
              { label: "환불", align: "right", width: "10rem" },
              { label: "순매출", align: "right", width: "9rem" },
              { label: "" },
            ]}
          >
            {buckets.map((b) => (
              <TR key={b.key}>
                <TD mono>
                  {b.key}
                  {filter.granularity === "week" ? " 주" : ""}
                </TD>
                <TD align="right" mono>
                  {fmtKrw(b.paidKrw)}
                  <span className="text-muted-foreground ml-1 text-[11px]">({b.paidCount})</span>
                </TD>
                <TD align="right" mono soft>
                  {b.refundKrw > 0 ? (
                    <span className="text-rose-600 dark:text-rose-400">
                      −{fmtKrw(b.refundKrw)}
                      <span className="ml-1 text-[11px]">({b.refundCount})</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD align="right" mono>
                  {fmtKrw(b.netKrw)}
                </TD>
                <TD>
                  <Bar value={b.netKrw} max={maxNet} className="w-full min-w-[80px]" />
                </TD>
              </TR>
            ))}
          </IndexTable>
        )}
      </div>

      {/* 내역 탭 */}
      <div className="mb-2 flex items-center gap-1.5">
        <TabLink to={tabQs("payments")} active={filter.tab === "payments"}>
          <ReceiptTextIcon className="size-3.5" /> 결제내역 ({payments.length})
        </TabLink>
        <TabLink to={tabQs("refunds")} active={filter.tab === "refunds"}>
          <RotateCcwIcon className="size-3.5" /> 환불내역 ({refunds.length})
        </TabLink>
      </div>

      {filter.tab === "payments" ? (
        payments.length === 0 ? (
          <EmptyBox>조건에 맞는 결제가 없습니다.</EmptyBox>
        ) : (
          <IndexTable
            minWidth={960}
            headers={[
              { label: "결제일시", width: "10rem" },
              { label: "학생" },
              { label: "상품" },
              { label: "금액", align: "right", width: "8rem" },
              { label: "상태", align: "center", width: "6rem" },
              { label: "결제수단", align: "center", width: "5.5rem" },
              { label: "승인번호(주문번호)", width: "14rem" },
            ]}
            footer={
              <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
                총 {payments.length}건
              </div>
            }
          >
            {payments.map((p) => (
              <TR key={p.paymentId}>
                <TD mono soft>
                  {fmtDateTime(p.createdAt)}
                </TD>
                <TD>
                  <Link to={`/admin/users/${p.userId}`} className="text-link hover:underline">
                    {p.userName ?? p.userId.slice(0, 8)}
                  </Link>
                </TD>
                <TD>{p.planName}</TD>
                <TD align="right" mono>
                  {fmtKrw(p.amountKrw)}
                </TD>
                <TD align="center">
                  <Chip tone={STATUS_TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Chip>
                </TD>
                <TD align="center" soft>
                  {p.method ?? "—"}
                </TD>
                <TD mono soft className="max-w-[14rem]">
                  {p.paymentKey ? (
                    <span className="block truncate" title={`승인번호 ${p.paymentKey}`}>
                      {p.paymentKey}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {p.tossOrderId ? (
                    <span
                      className="text-muted-foreground/70 block truncate text-[10px]"
                      title={`토스 주문번호 ${p.tossOrderId}`}
                    >
                      {p.tossOrderId}
                    </span>
                  ) : null}
                </TD>
              </TR>
            ))}
          </IndexTable>
        )
      ) : refunds.length === 0 ? (
        <EmptyBox>기간 내 환불이 없습니다.</EmptyBox>
      ) : (
        <IndexTable
          minWidth={860}
          headers={[
            { label: "환불일시", width: "10rem" },
            { label: "학생" },
            { label: "상품" },
            { label: "결제액", align: "right", width: "8rem" },
            { label: "환불액", align: "right", width: "8rem" },
            { label: "사유" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {refunds.length}건 · {fmtKrw(refunds.reduce((a, r) => a + (r.refundAmountKrw ?? r.amountKrw), 0))}
            </div>
          }
        >
          {refunds.map((p) => (
            <TR key={p.paymentId}>
              <TD mono soft>
                {p.refundedAt ? fmtDateTime(p.refundedAt) : "—"}
              </TD>
              <TD>
                <Link to={`/admin/users/${p.userId}`} className="text-link hover:underline">
                  {p.userName ?? p.userId.slice(0, 8)}
                </Link>
              </TD>
              <TD>{p.planName}</TD>
              <TD align="right" mono soft>
                {fmtKrw(p.amountKrw)}
              </TD>
              <TD align="right" mono>
                <span className="text-rose-600 dark:text-rose-400">
                  −{fmtKrw(p.refundAmountKrw ?? p.amountKrw)}
                </span>
              </TD>
              <TD soft className="max-w-[18rem] truncate">
                {p.refundReason ?? "—"}
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[11px] font-semibold">{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "emerald" | "coral";
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p
        className={
          "mt-1 text-xl font-bold tabular-nums " +
          (tone === "emerald"
            ? "text-emerald-700 dark:text-emerald-300"
            : tone === "coral"
              ? "text-rose-600 dark:text-rose-400"
              : "text-foreground")
        }
      >
        {value}
      </p>
      {sub ? <p className="text-muted-foreground mt-0.5 text-[11px]">{sub}</p> : null}
    </div>
  );
}

function TabLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border text-muted-foreground hover:bg-muted bg-transparent")
      }
    >
      {children}
    </Link>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-card text-muted-foreground rounded-xl border py-12 text-center text-sm shadow-sm">
      {children}
    </div>
  );
}
