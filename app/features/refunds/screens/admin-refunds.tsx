// feat-11-013 P6-c — 환불관리 목록 (요청서 PART B §3).

import { Form, Link } from "react-router";

import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Chip,
  IndexTable,
  MemberLink,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { Button } from "~/core/components/ui/button";
import {
  REFUND_STATUSES,
  REFUND_STATUS_LABELS,
  type RefundStatus,
} from "~/features/refunds/lib/refund-status";
import { requireRefundStaff } from "~/features/refunds/lib/refund-gate.server";
import { listRefunds } from "~/features/refunds/queries.server";

import type { Route } from "./+types/admin-refunds";

export const meta: Route.MetaFunction = () => [
  { title: "환불 관리 | 리담변리사학원" },
];

/** 상태별 색 — 진행 중은 호박, 완료는 초록, 반려·철회·오류는 산호. */
const TONE: Record<RefundStatus, "emerald" | "amber" | "coral" | "neutral" | "violet"> = {
  received: "amber",
  reviewing: "amber",
  need_info: "amber",
  awaiting_return: "amber",
  amount_fixed: "violet",
  pg_pending: "violet",
  pg_done: "violet",
  partial_done: "emerald",
  full_done: "emerald",
  rejected: "coral",
  withdrawn: "neutral",
  error: "coral",
};

const won = (n: number | null) => (n == null ? "—" : `₩${n.toLocaleString("ko-KR")}`);
const dt = (s: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "—");

export async function loader({ request }: Route.LoaderArgs) {
  const { role } = await requireRefundStaff(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "open";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const { rows, openCount } = await listRefunds({ status, q });
  return { rows, openCount, status, q, role };
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { rows, openCount, status, q, role } = loaderData;

  return (
    <AdminShell
      cluster="sales"
      role={role}
      title={
        <span className="inline-flex items-center gap-2">
          환불 관리
          {openCount > 0 ? <Chip tone="coral">{openCount}</Chip> : null}
        </span>
      }
      desc="고객센터로 접수된 환불을 검토하고, 토스 취소결과를 입력해 확정합니다. 결제취소는 토스 상점관리자에서 관리자가 직접 처리합니다."
    >
      <Form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <select
          name="status"
          defaultValue={status}
          className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
        >
          <option value="open">처리 중(미종결)</option>
          <option value="">전체</option>
          {REFUND_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REFUND_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="회원명 · 주문번호"
          className="border-input bg-background focus:border-primary h-9 w-64 rounded-md border px-3 text-[13px] outline-none"
        />
        <Button type="submit" size="sm" variant="secondary">
          조회
        </Button>
      </Form>

      <IndexTable
        minWidth={880}
        headers={[
          { label: "접수일시", width: "140px" },
          { label: "회원" },
          { label: "상태", width: "150px" },
          { label: "대상", width: "70px", align: "right" },
          { label: "환불금액", width: "120px", align: "right" },
          { label: "결제금액", width: "120px", align: "right" },
          { label: "요청사유" },
        ]}
      >
        {rows.length === 0 ? (
          <TR>
            <TD colSpan={7} soft>
              {status === "open"
                ? "처리 중인 환불건이 없습니다."
                : "조건에 맞는 환불건이 없습니다."}
            </TD>
          </TR>
        ) : (
          rows.map((r) => (
            <TR key={r.refundId}>
              <TD mono soft>
                <Link to={`/admin/refunds/${r.refundId}`} className="hover:underline">
                  {dt(r.intakeAt)}
                </Link>
              </TD>
              <TD>
                <MemberLink profileId={r.userId} name={r.userName} />
              </TD>
              <TD>
                <Chip tone={TONE[r.status]}>{REFUND_STATUS_LABELS[r.status]}</Chip>
              </TD>
              <TD align="right" mono>
                {r.itemCount}건
              </TD>
              <TD align="right" mono>
                {won(r.thisRefundKrw)}
              </TD>
              <TD align="right" mono soft>
                {won(r.originalPaidKrw)}
              </TD>
              <TD soft>{r.requestReason ?? "—"}</TD>
            </TR>
          ))
        )}
      </IndexTable>
    </AdminShell>
  );
}
