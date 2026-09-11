// feat-8-029 Stage 3 — 강사 정산 상세 (manager+): 항목별 내역·합계·상태 전이.
import type { Route } from "./+types/admin-settlement-detail";

import { ArrowLeftIcon } from "lucide-react";
import { Link, data } from "react-router";

import { requireManager } from "~/core/lib/admin-guard.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { SettlementActions } from "~/features/subscriptions/screens/admin-settlements";
import {
  TAX_TYPE_LABEL,
  bpToPercentText,
  ratioLabelOf,
} from "~/features/subscriptions/settlement-engine";
import { getSettlementDetail } from "~/features/subscriptions/settlements-admin.server";

export const meta: Route.MetaFunction = () => [{ title: "정산 상세 | 운영자" }];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireManager(request);

  if (!params.settlementId) throw data("정산 없음", { status: 404 });
  const detail = await getSettlementDetail(params.settlementId);
  if (!detail) throw data("정산 없음", { status: 404 });
  return detail;
}

function fmtKrw(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}₩${Math.abs(n).toLocaleString("ko-KR")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export default function AdminSettlementDetail({
  loaderData,
}: Route.ComponentProps) {
  const { settlement: s, items } = loaderData;
  const month = s.periodStart.slice(0, 7);
  const shareSum = items
    .filter((i) => i.kind === "share")
    .reduce((a, i) => a + i.shareAmountKrw, 0);
  const adjSum = items
    .filter((i) => i.kind === "refund_adjustment")
    .reduce((a, i) => a + i.shareAmountKrw, 0);

  return (
    <AdminShell
      cluster="sales"
      title={`정산 상세 — ${s.instructorName ?? ""} ${month}`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to={`/admin/settlements?month=${month}`}
          className="text-link inline-flex items-center gap-1 text-xs font-semibold hover:underline"
        >
          <ArrowLeftIcon className="size-3.5" /> 정산 목록
        </Link>
        <Chip
          tone={
            s.status === "paid"
              ? "emerald"
              : s.status === "confirmed"
                ? "blue"
                : "amber"
          }
        >
          {s.status === "paid"
            ? "지급완료"
            : s.status === "confirmed"
              ? "확정"
              : "초안"}
        </Chip>
        <span className="text-muted-foreground text-xs">
          확정 {fmtDate(s.confirmedAt)} · 지급 {fmtDate(s.paidAt)}
        </span>
        <div className="ml-auto">
          <SettlementActions
            settlementId={s.settlementId}
            status={s.status}
            backTo={`/admin/settlements/${s.settlementId}`}
          />
        </div>
      </div>

      {/* 원장 요청 9칸 — 결제·환불·수수료·매출·정산비율·정산금액·세율·세금액·지급액. */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeaderCard label="결제" value={fmtKrw(s.grossKrw)} />
        <HeaderCard
          label="환불"
          value={s.refundKrw !== 0 ? `−${fmtKrw(s.refundKrw)}` : "—"}
          coral={s.refundKrw !== 0}
        />
        <HeaderCard
          label={`수수료 ${s.feeRateBp > 0 ? bpToPercentText(s.feeRateBp) : "(미설정)"}`}
          value={s.feeKrw !== 0 ? `−${fmtKrw(s.feeKrw)}` : "—"}
          coral={s.feeKrw !== 0}
        />
        <HeaderCard
          label="매출 (결제−환불−수수료)"
          value={fmtKrw(s.netSalesKrw)}
        />
        <HeaderCard
          label={`정산금액 (비율 ${ratioLabelOf(items)})`}
          value={fmtKrw(s.totalShareKrw)}
        />
        <HeaderCard
          label={`세금액 ${TAX_TYPE_LABEL[s.taxType]} ${bpToPercentText(s.taxRateBp)}`}
          value={s.taxKrw !== 0 ? `−${fmtKrw(s.taxKrw)}` : "—"}
          coral={s.taxKrw !== 0}
        />
        <HeaderCard label="정산 지급액" value={fmtKrw(s.payoutKrw)} strong />
        <HeaderCard
          label="검산 (배분 − 환불차감)"
          value={`${fmtKrw(shareSum)} ${adjSum !== 0 ? fmtKrw(adjSum) : ""}`.trim()}
        />
      </div>

      <IndexTable
        minWidth={980}
        headers={[
          { label: "구분", align: "center", width: "6rem" },
          { label: "원천", align: "center", width: "5rem" },
          { label: "일자", width: "7rem" },
          { label: "학생" },
          { label: "강의·상품" },
          { label: "기준액", align: "right", width: "8rem" },
          { label: "수수료", align: "right", width: "7rem" },
          { label: "배분 기준", align: "right", width: "7rem" },
          { label: "배분액", align: "right", width: "8rem" },
          { label: "비고" },
        ]}
        footer={
          <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
            {items.length}항목 · 정산액 {fmtKrw(s.totalShareKrw)}
          </div>
        }
      >
        {items.map((i) => (
          <TR key={i.itemId}>
            <TD align="center">
              {i.kind === "share" ? (
                <Chip tone="blue">배분</Chip>
              ) : (
                <Chip tone="coral">환불차감</Chip>
              )}
            </TD>
            <TD align="center" soft className="text-[11px]">
              {i.sourceKind === "order_item" ? "강의주문" : "구독결제"}
            </TD>
            <TD mono soft>
              {fmtDate(i.saleAt)}
            </TD>
            <TD>{i.studentName ?? "—"}</TD>
            <TD>{i.label ?? "—"}</TD>
            <TD align="right" mono soft>
              {fmtKrw(i.baseAmountKrw)}
            </TD>
            <TD align="right" mono soft>
              {i.feeKrw === 0 ? "—" : fmtKrw(i.feeKrw)}
            </TD>
            <TD align="right" mono soft>
              {i.shareKind === "percent"
                ? `${i.shareValue}%`
                : `₩${i.shareValue.toLocaleString("ko-KR")}/건`}
            </TD>
            <TD align="right" mono>
              <span
                className={
                  i.shareAmountKrw < 0 ? "text-rose-600 dark:text-rose-400" : ""
                }
              >
                {fmtKrw(i.shareAmountKrw)}
              </span>
            </TD>
            <TD soft className="max-w-[12rem] truncate text-[12px]">
              {i.note ?? "—"}
            </TD>
          </TR>
        ))}
      </IndexTable>
    </AdminShell>
  );
}

function HeaderCard({
  label,
  value,
  strong,
  coral,
}: {
  label: string;
  value: string;
  strong?: boolean;
  coral?: boolean;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p
        className={
          "mt-1 text-xl font-bold tabular-nums " +
          (coral
            ? "text-rose-600 dark:text-rose-400"
            : strong
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-foreground")
        }
      >
        {value}
      </p>
    </div>
  );
}
