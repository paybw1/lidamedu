// feat-8-029 P2 · feat-11-007 #7~11 — 매출 통계 (manager+ / lms_stats_view).
// 상품유형별(정기구독·강의·도서) 매출·환불·순매출 + 기간 직접검색 + 강의유형/과목/도서카테고리
// 필터 + 상품 랭킹 + CSV. 소스: order_items × orders(결제 완료). 집계는 KST 결제일 기준.

import { BookIcon, DownloadIcon, LayersIcon, TrophyIcon } from "lucide-react";
import { Form, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import adminClient from "~/core/lib/supa-admin-client.server";
import { csvResponse } from "~/core/lib/csv.server";
import { requireManager } from "~/core/lib/admin-guard.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Bar, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import {
  LECTURE_CATEGORIES,
  LECTURE_CATEGORY_LABEL,
} from "~/features/lms/lib/lecture-category";
import {
  getSalesStats,
  type CategoryAgg,
} from "~/features/subscriptions/sales-stats.server";
import {
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABEL,
  type ItemCategory,
} from "~/features/subscriptions/sales-stats-labels";
import type { StatsGranularity } from "~/features/subscriptions/payments-admin.server";
import { LAW_SUBJECTS, LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-sales-stats";

export const meta: Route.MetaFunction = () => [{ title: "매출 통계 | 운영자" }];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
type PeriodPreset =
  | "this_month"
  | "30d"
  | "90d"
  | "this_year"
  | "all"
  | "custom";

// KST 달력일(YYYY-MM-DD) → 그 날 00:00 KST 의 UTC ISO.
function kstDayStartIso(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - KST_OFFSET_MS,
  ).toISOString();
}

function presetRange(
  preset: PeriodPreset,
  from: string | null,
  to: string | null,
): { fromIso: string | null; toIso: string | null } {
  if (preset === "custom") {
    const fromIso = from ? kstDayStartIso(from) : null;
    // to 는 그 날의 끝 = 다음날 00:00(exclusive).
    let toIso: string | null = null;
    if (to) {
      const start = kstDayStartIso(to);
      if (start)
        toIso = new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
    return { fromIso, toIso };
  }
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const kstToUtcIso = (y: number, mo: number, d: number) =>
    new Date(Date.UTC(y, mo, d) - KST_OFFSET_MS).toISOString();
  if (preset === "this_month")
    return {
      fromIso: kstToUtcIso(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), 1),
      toIso: null,
    };
  if (preset === "this_year")
    return { fromIso: kstToUtcIso(nowKst.getUTCFullYear(), 0, 1), toIso: null };
  if (preset === "30d" || preset === "90d") {
    const days = preset === "30d" ? 30 : 90;
    return {
      fromIso: new Date(Date.now() - days * 86400000).toISOString(),
      toIso: null,
    };
  }
  return { fromIso: null, toIso: null };
}

const SUBJECT_OPTIONS = [
  ...LAW_SUBJECT_SLUGS.map((s) => ({ value: s, label: LAW_SUBJECTS[s].name })),
  { value: "science", label: "자연과학" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireManager(request);
  const url = new URL(request.url);
  const sp = url.searchParams;
  const preset = (sp.get("period") ?? "this_month") as PeriodPreset;
  const granularity = (sp.get("g") ?? "month") as StatsGranularity;
  const from = sp.get("from");
  const to = sp.get("to");
  const lectureCategory = sp.get("lc") || null;
  const subject = sp.get("subj") || null;
  const bookCategoryId = sp.get("bc") || null;
  const { fromIso, toIso } = presetRange(preset, from, to);

  const [stats, bookCatsRes] = await Promise.all([
    getSalesStats({
      fromIso,
      toIso,
      granularity,
      lectureCategory,
      subject,
      bookCategoryId,
    }),
    adminClient.from("book_categories").select("category_id, name").order("name"),
  ]);
  const bookCategories = (bookCatsRes.data ?? []).map((c) => ({
    id: c.category_id,
    name: c.name,
  }));

  if (sp.get("export") === "csv") {
    const headers = ["구분", "상품", "수량", "결제액(원)", "환불액(원)", "순매출(원)"];
    const rows = stats.rank.map((p) => [
      ITEM_CATEGORY_LABEL[p.category],
      p.name,
      p.qty,
      p.grossKrw,
      p.refundKrw,
      p.netKrw,
    ]);
    return csvResponse(`매출통계_${preset}.csv`, headers, rows);
  }

  return {
    stats,
    bookCategories,
    filter: {
      preset,
      granularity,
      from: from ?? "",
      to: to ?? "",
      lectureCategory: lectureCategory ?? "",
      subject: subject ?? "",
      bookCategoryId: bookCategoryId ?? "",
    },
  };
}

function fmtKrw(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}
const GRANULARITY_LABEL: Record<StatsGranularity, string> = {
  day: "일별",
  week: "주별",
  month: "월별",
};
const CAT_TONE: Record<ItemCategory, string> = {
  subscription: "text-sky-700 dark:text-sky-300",
  course: "text-emerald-700 dark:text-emerald-300",
  book: "text-violet-700 dark:text-violet-300",
};

export default function AdminSalesStats({ loaderData }: Route.ComponentProps) {
  const { stats, bookCategories, filter } = loaderData;
  const { summary, buckets, rank } = stats;
  const [searchParams] = useSearchParams();
  const exportHref = (() => {
    const p = new URLSearchParams(searchParams);
    p.set("export", "csv");
    return `?${p.toString()}`;
  })();
  const maxNet = Math.max(
    1,
    ...buckets.map(
      (b) => b.subscription.netKrw + b.course.netKrw + b.book.netKrw,
    ),
  );

  return (
    <AdminShell
      cluster="sales"
      title="매출 통계"
      desc="정기구독·강의·도서 상품유형별 매출을 집계합니다. 결제 완료(부분환불·환불 포함) 주문의 항목이 대상이며, 집계는 KST 결제일 기준입니다. 순매출 = 결제액 − 환불액."
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
            <option value="custom">직접 설정</option>
          </AdminSelect>
        </FilterField>
        <FilterField label="시작일">
          <input
            type="date"
            name="from"
            defaultValue={filter.from}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          />
        </FilterField>
        <FilterField label="종료일">
          <input
            type="date"
            name="to"
            defaultValue={filter.to}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          />
        </FilterField>
        <FilterField label="집계 단위">
          <AdminSelect name="g" defaultValue={filter.granularity}>
            <option value="day">일별</option>
            <option value="week">주별</option>
            <option value="month">월별</option>
          </AdminSelect>
        </FilterField>
        <FilterField label="강의 유형">
          <AdminSelect name="lc" defaultValue={filter.lectureCategory}>
            <option value="">전체 강의</option>
            {LECTURE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {LECTURE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </AdminSelect>
        </FilterField>
        <FilterField label="강의 과목">
          <AdminSelect name="subj" defaultValue={filter.subject}>
            <option value="">전체 과목</option>
            {SUBJECT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </AdminSelect>
        </FilterField>
        <FilterField label="도서 카테고리">
          <AdminSelect name="bc" defaultValue={filter.bookCategoryId}>
            <option value="">전체 도서</option>
            {bookCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </AdminSelect>
        </FilterField>
        <Button type="submit" size="sm" variant="outline">
          적용
        </Button>
      </Form>
      <p className="text-muted-foreground mb-4 text-[11px]">
        ※ 강의 유형·과목 필터를 지정하면 해당 강의 항목만, 도서 카테고리를 지정하면 해당 도서만
        집계됩니다. (정기구독 결제 중 정기결제 파이프라인 분은 별도 — 여기서는 주문 경유 매출 기준)
      </p>

      {/* 요약 — 3분할 + 총계 */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ITEM_CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat}
            label={`${ITEM_CATEGORY_LABEL[cat]} 순매출`}
            agg={summary[cat]}
            toneClass={CAT_TONE[cat]}
          />
        ))}
        <SummaryCard
          label="총 순매출"
          value={fmtKrw(summary.total.netKrw)}
          sub={`결제 ${fmtKrw(summary.total.grossKrw)} · 환불 −${fmtKrw(summary.total.refundKrw)}`}
        />
      </div>

      {/* 기간 × 유형 breakdown */}
      <div className="mb-6">
        <SectionTitle icon={<LayersIcon className="size-3.5" />}>
          {GRANULARITY_LABEL[filter.granularity]} 유형별 매출
        </SectionTitle>
        {buckets.length === 0 ? (
          <EmptyBox>기간 내 결제 완료 매출이 없습니다.</EmptyBox>
        ) : (
          <IndexTable
            minWidth={880}
            headers={[
              { label: "구간", width: "7rem" },
              { label: "정기구독", align: "right", width: "9rem" },
              { label: "강의", align: "right", width: "9rem" },
              { label: "도서", align: "right", width: "9rem" },
              { label: "합계", align: "right", width: "9rem" },
              { label: "" },
            ]}
          >
            {buckets.map((b) => {
              const total =
                b.subscription.netKrw + b.course.netKrw + b.book.netKrw;
              return (
                <TR key={b.key}>
                  <TD mono>
                    {b.key}
                    {filter.granularity === "week" ? " 주" : ""}
                  </TD>
                  <TD align="right" mono>
                    {fmtKrw(b.subscription.netKrw)}
                  </TD>
                  <TD align="right" mono>
                    {fmtKrw(b.course.netKrw)}
                  </TD>
                  <TD align="right" mono>
                    {fmtKrw(b.book.netKrw)}
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

      {/* 상품 랭킹(전 유형, 순매출 순) */}
      <div>
        <SectionTitle icon={<TrophyIcon className="size-3.5" />}>상품 랭킹</SectionTitle>
        {rank.length === 0 ? (
          <EmptyBox>기간 내 매출이 없습니다.</EmptyBox>
        ) : (
          <IndexTable
            minWidth={820}
            headers={[
              { label: "구분", width: "6rem" },
              { label: "상품" },
              { label: "수량", align: "right", width: "6rem" },
              { label: "결제액", align: "right", width: "9rem" },
              { label: "환불액", align: "right", width: "8rem" },
              { label: "순매출", align: "right", width: "9rem" },
            ]}
            footer={
              <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-right text-[11px] font-medium tabular-nums">
                순매출 합계 {fmtKrw(rank.reduce((a, r) => a + r.netKrw, 0))}
              </div>
            }
          >
            {rank.map((r) => (
              <TR key={`${r.category}:${r.id}`}>
                <TD soft>{ITEM_CATEGORY_LABEL[r.category]}</TD>
                <TD>{r.name}</TD>
                <TD align="right" mono soft>
                  {r.qty.toLocaleString("ko-KR")}
                </TD>
                <TD align="right" mono>
                  {fmtKrw(r.grossKrw)}
                </TD>
                <TD align="right" mono soft>
                  {r.refundKrw > 0 ? (
                    <span className="text-rose-600 dark:text-rose-400">
                      −{fmtKrw(r.refundKrw)}
                    </span>
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
        )}
      </div>
    </AdminShell>
  );
}

function CategoryCard({
  label,
  agg,
  toneClass,
}: {
  label: string;
  agg: CategoryAgg;
  toneClass: string;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p className={"mt-1 text-xl font-bold tabular-nums " + toneClass}>
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
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p className="text-foreground mt-1 text-xl font-bold tabular-nums">
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
