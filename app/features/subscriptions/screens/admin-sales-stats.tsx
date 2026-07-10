// feat-8-029 P2 — 매출 통계 (manager+). 항목(강의/교재)별 매출·환불·순매출 + 상품/도서 랭킹.
// 소스: order_items × orders(결제 완료). admin-payments(결제건 중심)와 상보적 — 항목 단위 집계.

import { BookIcon, GraduationCapIcon, LayersIcon } from "lucide-react";
import { Form, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Bar, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import {
  getSalesStats,
  type CategoryAgg,
  type ProductRankRow,
} from "~/features/subscriptions/sales-stats.server";
import type { StatsGranularity } from "~/features/subscriptions/payments-admin.server";

import type { Route } from "./+types/admin-sales-stats";

export const meta: Route.MetaFunction = () => [
  { title: "매출 통계 | 운영자" },
];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type PeriodPreset = "this_month" | "30d" | "90d" | "this_year" | "all";

function presetRange(preset: PeriodPreset): { fromIso: string | null; toIso: string | null } {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const kstToUtcIso = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m, d) - KST_OFFSET_MS).toISOString();
  if (preset === "this_month") {
    return { fromIso: kstToUtcIso(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), 1), toIso: null };
  }
  if (preset === "this_year") {
    return { fromIso: kstToUtcIso(nowKst.getUTCFullYear(), 0, 1), toIso: null };
  }
  if (preset === "30d" || preset === "90d") {
    const days = preset === "30d" ? 30 : 90;
    return { fromIso: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(), toIso: null };
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
  const granularity = (url.searchParams.get("g") ?? "month") as StatsGranularity;
  const { fromIso, toIso } = presetRange(preset);
  const stats = await getSalesStats({ fromIso, toIso, granularity });

  return { stats, filter: { preset, granularity } };
}

function fmtKrw(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

const GRANULARITY_LABEL: Record<StatsGranularity, string> = {
  day: "일별",
  week: "주별",
  month: "월별",
};

export default function AdminSalesStats({ loaderData }: Route.ComponentProps) {
  const { stats, filter } = loaderData;
  const { summary, buckets, courseRank, bookRank } = stats;
  const maxNet = Math.max(
    1,
    ...buckets.map((b) => b.course.netKrw + b.book.netKrw),
  );

  return (
    <AdminShell
      cluster="sales"
      title="매출 통계"
      desc="강의·교재 항목 단위 매출을 집계합니다. 결제 완료(부분환불·환불 포함) 주문의 항목이 대상이며, 집계는 KST 결제일 기준입니다. 순매출 = 결제액 − 환불액."
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
        <Button type="submit" size="sm" variant="outline">
          적용
        </Button>
      </Form>

      {/* 요약 — 강의 / 교재 / 총 순매출 / 총 환불 */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CategoryCard
          label="강의 순매출"
          icon={<GraduationCapIcon className="size-3.5" />}
          agg={summary.course}
          tone="emerald"
        />
        <CategoryCard
          label="교재 순매출"
          icon={<BookIcon className="size-3.5" />}
          agg={summary.book}
          tone="violet"
        />
        <SummaryCard label="총 순매출" value={fmtKrw(summary.total.netKrw)} tone="emerald" />
        <SummaryCard
          label="총 환불"
          value={fmtKrw(summary.total.refundKrw)}
          sub={`${summary.total.refundKrw > 0 ? "환불 반영됨" : "환불 없음"}`}
          tone="coral"
        />
      </div>

      {/* 기간 × 카테고리 breakdown */}
      <div className="mb-6">
        <SectionTitle icon={<LayersIcon className="size-3.5" />}>
          {GRANULARITY_LABEL[filter.granularity]} 항목 매출
        </SectionTitle>
        {buckets.length === 0 ? (
          <EmptyBox>기간 내 결제 완료 매출이 없습니다.</EmptyBox>
        ) : (
          <IndexTable
            minWidth={820}
            headers={[
              { label: "구간", width: "8rem" },
              { label: "강의 순매출", align: "right", width: "11rem" },
              { label: "교재 순매출", align: "right", width: "11rem" },
              { label: "합계", align: "right", width: "10rem" },
              { label: "" },
            ]}
          >
            {buckets.map((b) => {
              const total = b.course.netKrw + b.book.netKrw;
              return (
                <TR key={b.key}>
                  <TD mono>
                    {b.key}
                    {filter.granularity === "week" ? " 주" : ""}
                  </TD>
                  <TD align="right" mono>
                    {fmtKrw(b.course.netKrw)}
                    <span className="text-muted-foreground ml-1 text-[11px]">({b.course.qty})</span>
                  </TD>
                  <TD align="right" mono>
                    {fmtKrw(b.book.netKrw)}
                    <span className="text-muted-foreground ml-1 text-[11px]">({b.book.qty})</span>
                  </TD>
                  <TD align="right" mono>
                    {fmtKrw(total)}
                  </TD>
                  <TD>
                    <Bar value={total} max={maxNet} className="w-full min-w-[80px]" />
                  </TD>
                </TR>
              );
            })}
          </IndexTable>
        )}
      </div>

      {/* 강의 상품 랭킹 */}
      <div className="mb-6">
        <SectionTitle icon={<GraduationCapIcon className="size-3.5" />}>강의 상품 랭킹</SectionTitle>
        <RankTable rows={courseRank} emptyLabel="기간 내 강의 매출이 없습니다." unit="수강" />
      </div>

      {/* 도서 랭킹 */}
      <div>
        <SectionTitle icon={<BookIcon className="size-3.5" />}>도서 매출 랭킹</SectionTitle>
        <RankTable rows={bookRank} emptyLabel="기간 내 도서 매출이 없습니다." unit="권" />
      </div>
    </AdminShell>
  );
}

function RankTable({
  rows,
  emptyLabel,
  unit,
}: {
  rows: ProductRankRow[];
  emptyLabel: string;
  unit: string;
}) {
  if (rows.length === 0) return <EmptyBox>{emptyLabel}</EmptyBox>;
  const totalNet = rows.reduce((a, r) => a + r.netKrw, 0);
  return (
    <IndexTable
      minWidth={780}
      headers={[
        { label: "상품", },
        { label: "수량", align: "right", width: "6rem" },
        { label: "결제액", align: "right", width: "10rem" },
        { label: "환불액", align: "right", width: "9rem" },
        { label: "순매출", align: "right", width: "10rem" },
      ]}
      footer={
        <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-right text-[11px] font-medium tabular-nums">
          순매출 합계 {fmtKrw(totalNet)}
        </div>
      }
    >
      {rows.map((r) => (
        <TR key={`${r.category}:${r.id}`}>
          <TD>{r.name}</TD>
          <TD align="right" mono soft>
            {r.qty.toLocaleString("ko-KR")}
            {unit}
          </TD>
          <TD align="right" mono>
            {fmtKrw(r.grossKrw)}
          </TD>
          <TD align="right" mono soft>
            {r.refundKrw > 0 ? (
              <span className="text-rose-600 dark:text-rose-400">−{fmtKrw(r.refundKrw)}</span>
            ) : (
              "—"
            )}
          </TD>
          <TD align="right" mono>
            {fmtKrw(r.netKrw)}
          </TD>
        </TR>
      ))}
    </IndexTable>
  );
}

function CategoryCard({
  label,
  icon,
  agg,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  agg: CategoryAgg;
  tone: "emerald" | "violet";
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
        {icon} {label}
      </p>
      <p
        className={
          "mt-1 text-xl font-bold tabular-nums " +
          (tone === "emerald"
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-violet-700 dark:text-violet-300")
        }
      >
        {fmtKrw(agg.netKrw)}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
        {agg.qty}건 · 결제 {fmtKrw(agg.grossKrw)}
        {agg.refundKrw > 0 ? ` · 환불 −${fmtKrw(agg.refundKrw)}` : ""}
      </p>
    </div>
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

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground mb-2 inline-flex items-center gap-1.5 text-[12px] font-bold tracking-widest uppercase">
      {icon} {children}
    </h2>
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

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-card text-muted-foreground rounded-xl border py-10 text-center text-sm shadow-sm">
      {children}
    </div>
  );
}
